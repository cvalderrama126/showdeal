'use strict';

const { prisma } = require('../src/db/prisma');
const { createPasswordResetToken } = require('../src/auth/password-reset.service');

const login = process.env.TEST_USER_LOGIN || 'qa.mfa.lockout@showdeal.local';

async function main() {
  const user = await prisma.r_user.findFirst({
    where: { user_1: login },
    select: { id_user: true, user_1: true },
  });

  if (!user) {
    throw new Error(`QA user not found: ${login}`);
  }

  await prisma.r_password_reset_token.deleteMany({
    where: {
      id_user: user.id_user,
    },
  });

  const result = await createPasswordResetToken(login, '127.0.0.1', 'qa-manual');
  console.log(JSON.stringify(result));
}

main()
  .catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
