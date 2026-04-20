const { prisma } = require('../src/db/prisma');

async function main() {
  const deleted = await prisma.$executeRawUnsafe('DELETE FROM showdeal.r_invitation');
  console.log('Deleted rows:', deleted);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
