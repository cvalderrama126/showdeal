const { prisma } = require('../src/db/prisma');
const { authenticator } = require('otplib');

async function main() {
  const lr = await fetch('http://localhost:3001/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'admin', password: 'password123' }),
  });
  const login = await lr.json();
  let token;
  if (login.challengeToken) {
    const u = await prisma.r_user.findFirst({ where: { user_1: 'admin' }, select: { additional: true } });
    const otp = authenticator.generate(u.additional.otp.secret);
    const vr = await fetch('http://localhost:3001/auth/otp/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeToken: login.challengeToken, otp }),
    });
    const v = await vr.json();
    token = v.token || v.data?.token;
  } else {
    token = login.token || login.data?.token;
  }

  // Upload a valid PHOTO
  const fd = new FormData();
  fd.append('id_asset', '4');
  fd.append('tp_attach', 'PHOTO');
  fd.append('is_active', 'true');

  // Create a minimal valid PNG (8x8 red square)
  const { createCanvas } = (() => { try { return require('canvas'); } catch { return {}; } })();
  // Use a real small PNG file from uploads if available, else skip
  // Instead, use a known-good PNG base64
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(pngB64, 'base64');
  fd.append('file', new Blob([pngBuffer], { type: 'image/png' }), 'pixel.png');

  const r = await fetch('http://localhost:3001/api/r_attach', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd,
  });
  const body = await r.json();
  console.log('upload status:', r.status, JSON.stringify(body).substring(0, 400));

  // List attachments for asset 4
  const lr2 = await fetch('http://localhost:3001/api/r_attach?id_asset=4&includeInactive=true&take=5', {
    headers: { authorization: `Bearer ${token}` },
  });
  const list = await lr2.json();
  console.log('list:', JSON.stringify(list?.data?.[0] || {}).substring(0, 500));
}

main().catch(console.error).finally(() => prisma.$disconnect());
