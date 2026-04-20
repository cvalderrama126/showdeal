const { prisma } = require('../src/db/prisma');

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      c.conname,
      t.relname AS table_name,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'c'
      AND n.nspname = 'showdeal'
      AND t.relname IN ('r_auction','r_attach','r_connection','r_event','r_asset')
    ORDER BY t.relname, c.conname;
  `);

  for (const row of rows) {
    console.log(`${row.table_name} | ${row.conname}`);
    console.log(`${row.definition}`);
    console.log('---');
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
