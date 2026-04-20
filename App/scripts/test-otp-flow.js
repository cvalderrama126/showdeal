const { prisma } = require('../src/db/prisma');
const { authenticator } = require('otplib');

async function main() {
  const loginRes = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'admin', password: 'password123' }),
  });

  const login = await loginRes.json();
  console.log('LOGIN', loginRes.status, JSON.stringify(login));

  if (!login.requireOtp) {
    console.log('OTP_NOT_REQUIRED');
    return;
  }

  const user = await prisma.r_user.findFirst({
    where: { user_1: 'admin' },
    select: { additional: true },
  });

  const secret = user?.additional?.otp?.secret;
  if (!secret) {
    console.log('OTP_SECRET_MISSING');
    return;
  }

  const otp = authenticator.generate(secret);
  const verifyRes = await fetch('http://localhost:3001/auth/otp/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeToken: login.challengeToken, otp }),
  });

  const verify = await verifyRes.json();
  console.log('VERIFY', verifyRes.status, JSON.stringify(verify));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
