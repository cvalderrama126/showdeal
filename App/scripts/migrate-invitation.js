const { prisma } = require('../src/db/prisma');

async function main() {
  // Drop the old constraint and rebuild the table to match the new schema
  await prisma.$executeRawUnsafe(`ALTER TABLE showdeal.r_invitation DROP CONSTRAINT IF EXISTS r_invitation_unique`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS showdeal.r_invitation_unique`);
  await prisma.$executeRawUnsafe(`ALTER TABLE showdeal.r_invitation DROP COLUMN IF EXISTS id_user`);
  await prisma.$executeRawUnsafe(`ALTER TABLE showdeal.r_invitation ADD COLUMN IF NOT EXISTS id_company BIGINT`);
  // Make it not null (table should be empty)
  await prisma.$executeRawUnsafe(`ALTER TABLE showdeal.r_invitation ALTER COLUMN id_company SET NOT NULL`);
  // Add FK
  await prisma.$executeRawUnsafe(`ALTER TABLE showdeal.r_invitation DROP CONSTRAINT IF EXISTS r_company_r_invitation_fk`);
  await prisma.$executeRawUnsafe(`ALTER TABLE showdeal.r_invitation ADD CONSTRAINT r_company_r_invitation_fk FOREIGN KEY (id_company) REFERENCES showdeal.r_company(id_company)`);
  // Add unique constraint
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS r_invitation_unique ON showdeal.r_invitation(id_event, id_company)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE showdeal.r_invitation ADD CONSTRAINT r_invitation_unique UNIQUE USING INDEX r_invitation_unique`);
  // Add indexes
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_r_invitation_id_event ON showdeal.r_invitation(id_event)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_r_invitation_id_company ON showdeal.r_invitation(id_company)`);
  console.log('Migration complete!');
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
