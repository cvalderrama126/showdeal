const { prisma } = require('../src/db/prisma');

async function main() {
  const [roles, modules, access] = await Promise.all([
    prisma.r_role.findMany({
      where: { is_active: true },
      orderBy: { id_role: 'asc' },
      select: { id_role: true, role: true, is_active: true },
    }),
    prisma.r_module.findMany({
      where: { is_active: true },
      orderBy: { id_module: 'asc' },
      select: { id_module: true, module: true, is_admin: true, is_active: true },
    }),
    prisma.r_access.findMany({
      where: { is_active: true },
      select: { id_access: true },
    }),
  ]);

  console.log('ROLES');
  for (const r of roles) {
    console.log(`${r.id_role} | ${r.role}`);
  }

  console.log('\nMODULES');
  for (const m of modules) {
    console.log(`${m.id_module} | ${m.module} | admin=${m.is_admin}`);
  }

  console.log(`\nACCESS_COUNT ${access.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
