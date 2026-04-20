const { prisma } = require('../src/db/prisma');
const { authenticator } = require('otplib');

async function getToken() {
  const loginRes = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'admin', password: 'password123' }),
  });
  const login = await loginRes.json();

  if (login.challengeToken) {
    const u = await prisma.r_user.findFirst({ where: { user_1: 'admin' }, select: { additional: true } });
    const otp = authenticator.generate(u.additional.otp.secret);
    const verifyRes = await fetch('http://localhost:3001/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeToken: login.challengeToken, otp }),
    });
    const verify = await verifyRes.json();
    return verify.token || verify.data?.token;
  }

  return login.token || login.data?.token;
}

async function main() {
  const token = await getToken();
  if (!token) throw new Error('No token');

  const listRes = await fetch('http://localhost:3001/api/r_attach?includeInactive=true&take=20', {
    headers: { authorization: `Bearer ${token}` },
  });
  const list = await listRes.json();
  const row = Array.isArray(list.data) ? list.data.find((x) => x.file_name === 'Bubba.png') || list.data[0] : null;
  if (!row) throw new Error('No attachment rows found');

  console.log('row:', { id: row.id_attach, name: row.file_name, mime: row.mime_type, download_url: row.download_url });

  const dlRes = await fetch(`http://localhost:3001${row.download_url}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  const buf = Buffer.from(await dlRes.arrayBuffer());
  const headHex = buf.subarray(0, 16).toString('hex');
  const asText = buf.subarray(0, 120).toString('utf8');

  console.log('download status:', dlRes.status);
  console.log('content-type:', dlRes.headers.get('content-type'));
  console.log('content-length:', dlRes.headers.get('content-length'));
  console.log('first16hex:', headHex);
  console.log('first120text:', asText.replace(/\n/g, '\\n'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
