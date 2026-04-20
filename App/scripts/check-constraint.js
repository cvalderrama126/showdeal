const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.$queryRawUnsafe(
  "SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname='chk_r_attach_tp_attach'"
)
.then(r => console.log(JSON.stringify(r, null, 2)))
.catch(console.error)
.finally(() => p.$disconnect());
