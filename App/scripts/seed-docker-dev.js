/**
 * seed-docker-dev.js
 * Seeds minimal data for Docker dev/production testing:
 *  1. Core roles
 *  2. Core modules (delegates to sync-core-modules logic)
 *  3. A default company
 *  4. Test users (one per role)
 *  5. RBAC access (delegates to fill-access-by-profile logic)
 */

const { prisma } = require('./src/db/prisma');
const bcrypt = require('bcryptjs');

const ROLES = ['Root', 'Supervisor', 'Auctioneer', 'Buyer', 'Seller', 'Auditor', 'Viewer'];

const CORE_MODULES = [
  { module: 'r_auction', is_admin: false },
  { module: 'r_asset',   is_admin: false },
  { module: 'r_attach',  is_admin: false },
  { module: 'r_event',   is_admin: false },
  { module: 'r_bid',     is_admin: false },
  { module: 'r_module',  is_admin: true  },
  { module: 'r_company', is_admin: true  },
  { module: 'r_role',    is_admin: true  },
  { module: 'r_user',    is_admin: true  },
  { module: 'r_access',  is_admin: true  },
  { module: 'r_connection', is_admin: false },
  { module: 'r_invitation', is_admin: false },
  { module: 'r_log',     is_admin: true  },
];

const TEST_PASSWORD = 'password123';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRolePolicy(roleName) {
  const role = roleName.trim().toLowerCase();
  if (['root', 'admin'].includes(role)) {
    return () => ({ is_insert: true, is_update: true, is_delete: true });
  }
  if (role === 'supervisor') {
    return ({ moduleName }) => {
      const full = new Set(['r_auction', 'r_asset', 'r_attach', 'r_event', 'r_bid', 'r_connection', 'r_invitation', 'r_user']);
      if (full.has(moduleName)) return { is_insert: true, is_update: true, is_delete: false };
      return { is_insert: false, is_update: false, is_delete: false };
    };
  }
  if (role === 'auctioneer') {
    return ({ moduleName }) => {
      const full = new Set(['r_auction', 'r_asset', 'r_attach', 'r_event', 'r_invitation']);
      if (full.has(moduleName)) return { is_insert: true, is_update: true, is_delete: false };
      return { is_insert: false, is_update: false, is_delete: false };
    };
  }
  if (role === 'buyer') {
    return ({ moduleName }) => {
      if (moduleName === 'r_bid') return { is_insert: true, is_update: false, is_delete: false };
      return { is_insert: false, is_update: false, is_delete: false };
    };
  }
  return () => ({ is_insert: false, is_update: false, is_delete: false });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== ShowDeal Docker Dev Seed ===\n');

  // 1. Roles
  console.log('1. Seeding roles...');
  const roleMap = {};
  for (const roleName of ROLES) {
    const existing = await prisma.r_role.findFirst({ where: { role: roleName } });
    if (existing) {
      roleMap[roleName] = existing;
      console.log(`   skip (exists): ${roleName}`);
    } else {
      const roleData = { role: roleName, is_active: true };
      if (roleName === 'Root') roleData.additional = { is_admin: true };
      const created = await prisma.r_role.create({ data: roleData });
      roleMap[roleName] = created;
      console.log(`   created: ${roleName}`);
    }
  }

  // 2. Modules
  console.log('\n2. Seeding core modules...');
  const moduleMap = {};
  for (const m of CORE_MODULES) {
    const existing = await prisma.r_module.findFirst({ where: { module: m.module } });
    if (existing) {
      moduleMap[m.module] = existing;
      console.log(`   skip (exists): ${m.module}`);
    } else {
      const created = await prisma.r_module.create({
        data: { module: m.module, is_admin: m.is_admin, is_active: true },
      });
      moduleMap[m.module] = created;
      console.log(`   created: ${m.module}`);
    }
  }

  // 3. Company
  console.log('\n3. Seeding default company...');
  let company = await prisma.r_company.findFirst({ where: { uin: 'SHOWDEAL-CORP' } });
  if (!company) {
    company = await prisma.r_company.create({
      data: { uin: 'SHOWDEAL-CORP', company: 'ShowDeal Corp', is_active: true },
    });
    console.log('   created: ShowDeal Corp');
  } else {
    console.log('   skip (exists): ShowDeal Corp');
  }

  // 4. Test users
  console.log('\n4. Seeding test users (password: ' + TEST_PASSWORD + ')...');
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);
  const testUsers = [
    { username: 'admin',      name: 'Admin User',      role: 'Root'       },
    { username: 'supervisor', name: 'Supervisor User', role: 'Supervisor' },
    { username: 'auctioneer', name: 'Auctioneer User', role: 'Auctioneer' },
    { username: 'buyer',      name: 'Buyer User',      role: 'Buyer'      },
    { username: 'seller',     name: 'Seller User',     role: 'Seller'     },
    { username: 'auditor',    name: 'Auditor User',    role: 'Auditor'    },
    { username: 'viewer',     name: 'Viewer User',     role: 'Viewer'     },
  ];

  for (const u of testUsers) {
    const roleRow = roleMap[u.role];
    if (!roleRow) { console.log(`   skip (role missing): ${u.username}`); continue; }

    const existing = await prisma.r_user.findFirst({ where: { user_1: u.username } });
    if (existing) {
      console.log(`   skip (exists): ${u.username}`);
      continue;
    }
    await prisma.r_user.create({
      data: {
        user_1:      u.username,
        name:        u.name,
        uin:         `TEST-${u.username.toUpperCase()}-001`,
        id_role:     roleRow.id_role,
        id_company:  company.id_company,
        is_active:   true,
        authentication: [{ password: hash, created: new Date().toISOString() }],
      },
    });
    console.log(`   created: ${u.username} (${u.role})`);
  }

  // 5. RBAC Access
  console.log('\n5. Seeding RBAC access...');
  for (const [roleName, roleRow] of Object.entries(roleMap)) {
    const policyFn = getRolePolicy(roleName);
    for (const [moduleName, moduleRow] of Object.entries(moduleMap)) {
      const perms = policyFn({ moduleName, isAdminModule: moduleRow.is_admin });
      try {
        await prisma.r_access.upsert({
          where: { id_module_id_role: { id_module: moduleRow.id_module, id_role: roleRow.id_role } },
          update: perms,
          create: { id_module: moduleRow.id_module, id_role: roleRow.id_role, is_active: true, ...perms },
        });
      } catch { /* ignore duplicate */ }
    }
  }
  console.log('   done');

  console.log('\n=== Seed Complete ===');
  console.log('Test credentials:');
  testUsers.forEach(u => console.log(`  ${u.username.padEnd(12)} / ${TEST_PASSWORD}  (${u.role})`));
  console.log('');
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
