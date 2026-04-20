require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

(async () => {
  try {
    const r = await prisma.$queryRaw`SELECT current_user as user, current_database() as db, current_schema() as schema`;
    console.log("✅ DB OK:", r);
  } catch (e) {
    console.error("❌ DB FAIL:", e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();