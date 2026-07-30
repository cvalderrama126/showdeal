const { prisma } = require("../db/prisma");
const { toBigIntOrNull } = require("../utils/common");

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

async function isBuyerRole(roleId) {
  const role = await prisma.r_role.findUnique({
    where: { id_role: roleId },
    select: { role: true },
  });
  const roleName = String(role?.role || "").trim().toLowerCase();
  return roleName.includes("buyer") || roleName.includes("comprador");
}

function allowWhenAccessMissing() {
  return false;
}

function isAuctioneerRoleName(roleName) {
  const value = String(roleName || "").trim().toLowerCase();
  return value.includes("auctioneer");
}

function isAuditorRoleName(roleName) {
  const value = String(roleName || "").trim().toLowerCase();
  return value.includes("auditor") || value.includes("audit");
}

async function isAuditorRole(roleId, roleName) {
  if (isAuditorRoleName(roleName)) return true;

  const parsedRoleId = toBigIntOrNull(roleId);
  if (parsedRoleId === null) return false;

  const role = await prisma.r_role.findUnique({
    where: { id_role: parsedRoleId },
    select: { role: true },
  });

  return isAuditorRoleName(role?.role);
}

function isPrivilegedOperator(auth) {
  return auth?.isAdmin === true || auth?.isAuctioneer === true || isAuctioneerRoleName(auth?.roleName);
}

function isRestrictedAuctioneerModule(moduleName) {
  return ["r_module", "r_role", "r_access"].includes(String(moduleName || "").trim());
}

function isBuyerUiModuleAllowed(moduleName) {
  return ["r_buyer_offer", "r_buyer_won"].includes(String(moduleName || "").trim());
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

async function getModulePermissions({ roleId, moduleNames, isAdmin = false, roleName = "" }) {
  const cleanNames = Array.from(
    new Set(
      (Array.isArray(moduleNames) ? moduleNames : [])
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    )
  );

  const auctioneerMode = isAuctioneerRoleName(roleName);
  const auditorMode = await isAuditorRole(roleId, roleName);

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
  const buyerRole = await isBuyerRole(roleId);

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
    if (auditorMode) {
      const allowLogRead = moduleName === "r_log";
      permissions[moduleName] = {
        configured: true,
        read: allowLogRead,
        create: false,
        update: false,
        delete: false,
      };
      continue;
    }

    if (auctioneerMode && isRestrictedAuctioneerModule(moduleName)) {
      permissions[moduleName] = {
        configured: false,
        read: false,
        create: false,
        update: false,
        delete: false,
      };
      continue;
    }

    if (auctioneerMode) {
      permissions[moduleName] = {
        configured: true,
        read: true,
        create: true,
        update: true,
        delete: true,
      };
      continue;
    }

    if (buyerRole && !isBuyerUiModuleAllowed(moduleName)) {
      permissions[moduleName] = {
        configured: true,
        read: false,
        create: false,
        update: false,
        delete: false,
      };
      continue;
    }

    const moduleInfo = moduleMap.get(moduleName) || null;
    const configured = (moduleInfo?._count?.r_access || 0) > 0;
    const access = accessMap.get(moduleName) || null;

    if (moduleName === "r_log") {
      permissions[moduleName] = {
        configured,
        read: !!access || auditorMode,
        create: false,
        update: false,
        delete: false,
      };
      continue;
    }

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
      const auditorMode = await isAuditorRole(req.auth?.roleId, req.auth?.roleName);

      if (moduleName === "r_log" && action === "read" && auditorMode) {
        return next();
      }

      if (auditorMode) {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_AUDITOR_MODULE", module: moduleName });
      }

      if (isPrivilegedOperator(req.auth)) {
        if (req.auth?.isAuctioneer === true || isAuctioneerRoleName(req.auth?.roleName)) {
          if (isRestrictedAuctioneerModule(moduleName)) {
            return res.status(403).json({ ok: false, error: "FORBIDDEN_AUCTIONEER_MODULE", module: moduleName });
          }
        }
        return next();
      }

      const rawRoleId = req.auth?.roleId;
      const roleId = toBigIntOrNull(rawRoleId);
      if (roleId === null) {
        return res.status(403).json({ ok: false, error: "MISSING_ROLE" });
      }

      const buyerRole = await isBuyerRole(roleId);
      if (buyerRole && moduleName === "r_asset") {
        return res.status(403).json({ ok: false, error: "FORBIDDEN_BUYER_MODULE", module: moduleName });
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
        if (moduleName === "r_log" && action === "read") {
          const logAccess = await prisma.r_access.findFirst({
            where: {
              is_active: true,
              id_role: roleId,
              r_module: {
                is: {
                  is_active: true,
                  module: "r_log",
                },
              },
            },
            select: { id_access: true },
          });

          if (logAccess) {
            return next();
          }
        }

        return res.status(403).json({ ok: false, error: "FORBIDDEN_ADMIN_MODULE", module: moduleName });
      }

      const configured = await hasAccessConfig(moduleName);
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
