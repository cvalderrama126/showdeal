const { prisma } = require('../src/db/prisma');
const { authenticator } = require('otplib');

async function main() {
  const username = process.argv[2] || 'admin';
  const user = await prisma.r_user.findFirst({
    where: { user_1: username },
    select: { id_user: true, user_1: true, additional: true },
  });

  if (!user) {
    console.log('USER_NOT_FOUND');
    return;
  }

  const issuer = 'ShowDeal';
  const secret = authenticator.generateSecret();
  const label = `${issuer}:${user.user_1}`;
  const otpauth_url = authenticator.keyuri(user.user_1, issuer, secret);

  const currentAdditional = user.additional && typeof user.additional === 'object' ? user.additional : {};
  const nextAdditional = {
    ...currentAdditional,
    otp: {
      type: 'totp',
      enabled: true,
      secret,
      issuer,
      label,
      otpauth_url,
      reset_at: new Date().toISOString(),
    },
  };

  await prisma.r_user.update({
    where: { id_user: user.id_user },
    data: { additional: nextAdditional },
  });

  const codeNow = authenticator.generate(secret);

  console.log(JSON.stringify({
    user: user.user_1,
    secret,
    otpauth_url,
    code_now: codeNow,
    note: 'Agrega este secret en Google/Microsoft Authenticator (TOTP, 6 digitos, 30s).',
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
