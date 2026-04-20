const { prisma } = require('../src/db/prisma');

const CORE_MODULES = [
  { module: 'r_auction', is_admin: false },
  { module: 'r_asset', is_admin: false },
  { module: 'r_attach', is_admin: false },
  { module: 'r_event', is_admin: false },
  { module: 'r_bid', is_admin: false },
  { module: 'r_module', is_admin: true },
  { module: 'r_company', is_admin: true },
  { module: 'r_role', is_admin: true },
  { module: 'r_user', is_admin: true },
  { module: 'r_access', is_admin: true },
  { module: 'r_connection', is_admin: false },
  { module: 'r_invitation', is_admin: false },
  { module: 'r_log', is_admin: true },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const core of CORE_MODULES) {
    const existing = await prisma.r_module.findFirst({ where: { module: core.module } });

    if (!existing) {
      await prisma.r_module.create({
        data: {
          module: core.module,
          is_admin: core.is_admin,
          is_active: true,
          additional: { source: 'sync-core-modules' },
        },
      });
      created += 1;
      continue;
    }

    const needsUpdate = existing.is_active !== true || existing.is_admin !== core.is_admin;
    if (needsUpdate) {
      await prisma.r_module.update({
        where: { id_module: existing.id_module },
        data: {
          is_active: true,
          is_admin: core.is_admin,
          additional: {
            ...(existing.additional && typeof existing.additional === 'object' ? existing.additional : {}),
            source: 'sync-core-modules',
            normalized: true,
          },
        },
      });
      updated += 1;
    }
  }

  const rows = await prisma.r_module.findMany({
    orderBy: { id_module: 'asc' },
    select: { id_module: true, module: true, is_admin: true, is_active: true },
  });

  console.log(`sync-core-modules => created=${created}, updated=${updated}, total=${rows.length}`);
  for (const row of rows) {
    console.log(`${row.id_module} | ${row.module} | admin=${row.is_admin} | active=${row.is_active}`);
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
