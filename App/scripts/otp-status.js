const { prisma } = require('../src/db/prisma');

async function main() {
  const username = process.argv[2] || 'admin';
  const user = await prisma.r_user.findFirst({
    where: { user_1: username },
    select: { id_user: true, user_1: true, additional: true, is_active: true },
  });

  if (!user) {
    console.log('USER_NOT_FOUND');
    return;
  }

  const otp = user.additional?.otp || null;
  console.log(JSON.stringify({
    id_user: String(user.id_user),
    user: user.user_1,
    is_active: user.is_active,
    otp_enabled: otp?.enabled === true,
    otp_has_secret: typeof otp?.secret === 'string' && otp.secret.length > 0,
    otp_secret: otp?.secret || null,
    otp_issuer: otp?.issuer || null,
    otp_label: otp?.label || null,
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
