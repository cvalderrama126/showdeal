const { prisma } = require('../src/db/prisma');
const { authenticator } = require('otplib');

async function main() {
  const loginRes = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'admin', password: 'password123' }),
  });
  const login = await loginRes.json();

  const user = await prisma.r_user.findFirst({ where: { user_1: 'admin' }, select: { additional: true } });
  const otp = authenticator.generate(user.additional.otp.secret);

  const verifyRes = await fetch('http://localhost:3001/auth/otp/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeToken: login.challengeToken, otp }),
  });
  const verify = await verifyRes.json();
  const token = verify.token || verify.data?.token;

  const headers = { authorization: `Bearer ${token}` };
  const assetRes = await fetch('http://localhost:3001/api/r_asset?includeInactive=true&take=5', { headers });
  const assets = await assetRes.json();

  const attachRes = await fetch('http://localhost:3001/api/r_attach?includeInactive=true&take=5', { headers });
  const attaches = await attachRes.json();

  console.log('asset', assetRes.status, Array.isArray(assets.data) ? assets.data.length : 0);
  console.log('attach', attachRes.status, Array.isArray(attaches.data) ? attaches.data.length : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
