const { prisma } = require('../src/db/prisma');
const { authenticator } = require('otplib');
const path = require('path');
const fs = require('fs');

// Minimal valid PNG bytes (1x1 red pixel)
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
  '7753de0000000c4944415408d76360f8cfc00000000200016216f50000000' +
  '0049454e44ae426082', 'hex'
);

async function main() {
  // Login
  const lr = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'admin', password: 'password123' }),
  });
  const login = await lr.json();
  console.log('login status:', lr.status, JSON.stringify(login).substring(0, 120));

  let token;
  if (login.challengeToken) {
    const u = await prisma.r_user.findFirst({ where: { user_1: 'admin' }, select: { additional: true } });
    const otp = authenticator.generate(u.additional.otp.secret);
    const vr = await fetch('http://localhost:3001/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeToken: login.challengeToken, otp }),
    });
    const v = await vr.json();
    token = v.token || v.data?.token;
    console.log('otp verify status:', vr.status, token ? 'got token' : JSON.stringify(v).substring(0, 120));
  } else {
    token = login.token || login.data?.token;
  }

  if (!token) { console.error('No token'); return; }

  // Upload using FormData (native Node 18+)
  const fd = new FormData();
  fd.append('id_asset', '4');
  fd.append('tp_attach', 'PNG');
  fd.append('is_active', 'true');
  fd.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'test.png');

  const r = await fetch('http://localhost:3001/api/r_attach', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: fd,
  });
  const txt = await r.text();
  console.log('upload status:', r.status);
  console.log('upload body:', txt.substring(0, 500));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
