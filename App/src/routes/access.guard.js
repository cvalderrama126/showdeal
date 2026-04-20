const { prisma } = require("../db/prisma");

function toBigIntOrNull(value) {
  const s = String(value || "").trim();
  if (!/^\d+$/.test(s)) return null;
  return BigInt(s);
}

async function hasAccessConfig(moduleName) {
  const configuredCount = await prisma.r_access.count({
    where: {
      is_active: true,
      r_module: {
        is: {
          is_active: true,
          module: moduleName,
        },
      },
    },
  });

  return configuredCount > 0;
}

function allowWhenAccessMissing() {
  return process.env.AUTHZ_REQUIRE_CONFIG === "false";
}

async function getActiveModules(moduleNames) {
  const cleanNames = Array.from(
    new Set(
      (Array.isArray(moduleNames) ? moduleNames : [])
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    )
  );

  const rows = await prisma.r_module.findMany({
    where: {
      is_active: true,
      module: cleanNames.length ? { in: cleanNames } : undefined,
    },
    select: {
      id_module: true,
      module: true,
      is_admin: true,
      _count: {
        select: {
          r_access: {
            where: {
              is_active: true,
            },
          },
        },
      },
    },
  });

  return cleanNames.length ? rows : [];
}

async function getModulePermissions({ roleId, moduleNames, isAdmin = false }) {
  const cleanNames = Array.from(
    new Set(
      (Array.isArray(moduleNames) ? moduleNames : [])
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    )
  );

  if (isAdmin === true) {
    const permissions = {};
    for (const moduleName of cleanNames) {
      permissions[moduleName] = {
        configured: true,
        read: true,
        create: true,
        update: true,
        delete: true,
      };
    }
    return permissions;
  }

  const modules = await getActiveModules(cleanNames);

  const accessRows = await prisma.r_access.findMany({
    where: {
      is_active: true,
      id_role: roleId,
      r_module: {
        is: {
          is_active: true,
          module: cleanNames.length ? { in: cleanNames } : undefined,
        },
      },
    },
    select: {
      is_insert: true,
      is_update: true,
      is_delete: true,
      r_module: {
        select: {
          module: true,
        },
      },
    },
  });

  const moduleMap = new Map(modules.map((item) => [item.module, item]));
  const accessMap = new Map(accessRows.map((item) => [item.r_module.module, item]));
  const permissions = {};

  for (const moduleName of cleanNames) {
    const moduleInfo = moduleMap.get(moduleName) || null;
    const configured = (moduleInfo?._count?.r_access || 0) > 0;
    const access = accessMap.get(moduleName) || null;

    if (moduleInfo?.is_admin === true) {
      permissions[moduleName] = {
        configured,
        read: false,
        create: false,
        update: false,
        delete: false,
      };
      continue;
    }

    if (!configured) {
      const allow = allowWhenAccessMissing();
      permissions[moduleName] = {
        configured: false,
        read: allow,
        create: allow,
        update: allow,
        delete: allow,
      };
      continue;
    }

    permissions[moduleName] = {
      configured: true,
      read: !!access,
      create: access?.is_insert === true,
      update: access?.is_update === true,
      delete: access?.is_delete === true,
    };
  }

  return permissions;
}

function requireModuleAccess(moduleName, action) {
  return async function moduleAccessGuard(req, res, next) {
    try {
      if (req.auth?.isAdmin === true) {
        return next();
      }

      const rawRoleId = req.auth?.roleId;
      const roleId = toBigIntOrNull(rawRoleId);
      if (!roleId) {
        return res.status(403).json({ ok: false, error: "MISSING_ROLE" });
      }

      const moduleInfo = await prisma.r_module.findFirst({
        where: {
          is_active: true,
          module: moduleName,
        },
        select: {
          id_module: true,
          is_admin: true,
        },
      });

      if (moduleInfo?.is_admin === true) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_ADMIN_MODULE", module: moduleName });
      }

      const configured = await hasAccessConfig(moduleName);
      if (!configured && allowWhenAccessMissing()) {
        return next();
      }
      if (!configured) {
        return res.status(403).json({ ok: false, error: "ACCESS_NOT_CONFIGURED", module: moduleName });
      }

      const access = await prisma.r_access.findFirst({
        where: {
          is_active: true,
          id_role: roleId,
          r_module: {
            is: {
              is_active: true,
              module: moduleName,
            },
          },
        },
        select: {
          is_insert: true,
          is_update: true,
          is_delete: true,
        },
      });

      if (!access) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN", module: moduleName });
      }

      if (action === "create" && access.is_insert !== true) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_CREATE", module: moduleName });
      }
      if (action === "update" && access.is_update !== true) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_UPDATE", module: moduleName });
      }
      if (action === "delete" && access.is_delete !== true) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_DELETE", module: moduleName });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireModuleAccess, getModulePermissions };
