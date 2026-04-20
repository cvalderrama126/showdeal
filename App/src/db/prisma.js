const { PrismaClient } = require("@prisma/client");

// Evita múltiples instancias en hot reload (nodemon)
const globalForPrisma = global;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

module.exports = { prisma };