const { prisma } = require('../src/db/prisma');

function normalize(name) {
  return String(name || '').trim().toLowerCase();
}

function getRolePolicy(roleName) {
  const role = normalize(roleName);

  if (['root', 'admin', 'superadmin', 'administrator'].includes(role)) {
    return () => ({ read: true, create: true, update: true, delete: true });
  }

  if (role === 'supervisor') {
    return ({ moduleName }) => {
      // Supervisor can operate most business modules and manage users (no hard deletes).
      const full = new Set(['r_auction', 'r_asset', 'r_attach', 'r_event', 'r_bid', 'r_connection', 'r_invitation', 'r_user']);
      const readOnly = new Set(['r_module', 'r_role', 'r_company', 'r_access', 'r_log']);
      if (full.has(moduleName)) return { read: true, create: true, update: true, delete: false };
      if (readOnly.has(moduleName)) return { read: true, create: false, update: false, delete: false };
      return { read: false, create: false, update: false, delete: false };
    };
  }

  if (role === 'auctioneer') {
    return ({ moduleName }) => {
      const full = new Set(['r_auction', 'r_asset', 'r_attach', 'r_event', 'r_invitation']);
      if (full.has(moduleName)) return { read: true, create: true, update: true, delete: false };
      if (moduleName === 'r_bid') return { read: true, create: false, update: false, delete: false };
      if (moduleName === 'r_connection') return { read: true, create: false, update: false, delete: false };
      return { read: false, create: false, update: false, delete: false };
    };
  }

  if (role === 'buyer') {
    return ({ moduleName }) => {
      if (['r_auction', 'r_asset', 'r_attach', 'r_event'].includes(moduleName)) {
        return { read: true, create: false, update: false, delete: false };
      }
      if (moduleName === 'r_bid') {
        return { read: true, create: true, update: false, delete: false };
      }
      if (moduleName === 'r_invitation') {
        return { read: true, create: false, update: false, delete: false };
      }
      return { read: false, create: false, update: false, delete: false };
    };
  }

  if (role === 'seller') {
    return ({ moduleName }) => {
      if (['r_asset', 'r_attach'].includes(moduleName)) {
        return { read: true, create: true, update: true, delete: false };
      }
      if (['r_auction', 'r_event', 'r_bid', 'r_connection'].includes(moduleName)) {
        return { read: true, create: false, update: false, delete: false };
      }
      return { read: false, create: false, update: false, delete: false };
    };
  }

  if (role === 'auditor') {
    return ({ moduleName }) => {
      // Auditor can read all modules, no write.
      return { read: true, create: false, update: false, delete: false };
    };
  }

  if (role === 'viewer') {
    return ({ moduleName }) => {
      if (['r_auction', 'r_asset', 'r_attach', 'r_event', 'r_bid'].includes(moduleName)) {
        return { read: true, create: false, update: false, delete: false };
      }
      return { read: false, create: false, update: false, delete: false };
    };
  }

  // Fallback role profile.
  return ({ moduleName, isAdminModule }) => {
    if (isAdminModule) return { read: false, create: false, update: false, delete: false };
    return { read: true, create: false, update: false, delete: false };
  };
}

async function upsertAccessRow({ roleId, moduleId, perms }) {
  const existing = await prisma.r_access.findFirst({
    where: {
      id_role: roleId,
      id_module: moduleId,
    },
    select: { id_access: true },
  });

  const data = {
    is_active: true,
    is_insert: perms.create === true,
    is_update: perms.update === true,
    is_delete: perms.delete === true,
    additional: {
      source: 'fill-access-by-profile',
      profile_applied: true,
      at: new Date().toISOString(),
    },
  };

  if (existing) {
    await prisma.r_access.update({ where: { id_access: existing.id_access }, data });
    return 'updated';
  }

  await prisma.r_access.create({
    data: {
      id_role: roleId,
      id_module: moduleId,
      ...data,
    },
  });
  return 'created';
}

async function deactivateAccessRow({ roleId, moduleId }) {
  const existing = await prisma.r_access.findFirst({
    where: {
      id_role: roleId,
      id_module: moduleId,
      is_active: true,
    },
    select: { id_access: true },
  });

  if (!existing) return false;

  await prisma.r_access.update({
    where: { id_access: existing.id_access },
    data: { is_active: false },
  });

  return true;
}

async function main() {
  const [roles, modules] = await Promise.all([
    prisma.r_role.findMany({ where: { is_active: true }, select: { id_role: true, role: true } }),
    prisma.r_module.findMany({ where: { is_active: true }, select: { id_module: true, module: true, is_admin: true } }),
  ]);

  let created = 0;
  let updated = 0;
  let deactivated = 0;

  for (const role of roles) {
    const policy = getRolePolicy(role.role);

    for (const module of modules) {
      const perms = policy({
        moduleName: module.module,
        isAdminModule: module.is_admin === true,
      });

      if (perms.read === true) {
        const action = await upsertAccessRow({
          roleId: role.id_role,
          moduleId: module.id_module,
          perms,
        });
        if (action === 'created') created += 1;
        if (action === 'updated') updated += 1;
      } else {
        const changed = await deactivateAccessRow({
          roleId: role.id_role,
          moduleId: module.id_module,
        });
        if (changed) deactivated += 1;
      }
    }
  }

  const totalActive = await prisma.r_access.count({ where: { is_active: true } });

  console.log(`fill-access-by-profile => created=${created}, updated=${updated}, deactivated=${deactivated}, active_total=${totalActive}`);

  // Show a compact summary by role.
  for (const role of roles) {
    const count = await prisma.r_access.count({ where: { is_active: true, id_role: role.id_role } });
    console.log(`role=${role.role} active_access=${count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
