const { prisma } = require('../src/db/prisma');

async function main() {
  const models = [
    'r_access',
    'r_asset',
    'r_attach',
    'r_auction',
    'r_bid',
    'r_company',
    'r_connection',
    'r_event',
    'r_invitation',
    'r_log',
    'r_module',
    'r_role',
    'r_user',
  ];

  for (const model of models) {
    const total = await prisma[model].count();
    let active = 'n/a';
    if (model !== 'r_log') {
      active = await prisma[model].count({ where: { is_active: true } });
    }
    console.log(`${model}: total=${total} active=${active}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
