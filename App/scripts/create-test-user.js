'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../src/db/prisma');

const DEFAULT_LOGIN = process.env.TEST_USER_LOGIN || 'qa.mfa.lockout@showdeal.local';
const DEFAULT_NAME = process.env.TEST_USER_NAME || 'QA MFA Lockout User';
const DEFAULT_ROLE = process.env.TEST_USER_ROLE || 'Root';

function randomPassword(length = 20) {
  const raw = crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64url');
  return `${raw.slice(0, length - 3)}Aa1!`;
}

async function resolveRoleId() {
  const role = await prisma.r_role.findFirst({
    where: {
      role: DEFAULT_ROLE,
      is_active: true,
    },
    select: {
      id_role: true,
      role: true,
    },
  });

  if (role) return role;

  return await prisma.r_role.findFirst({
    where: { is_active: true },
    select: { id_role: true, role: true },
  });
}

async function resolveCompanyId() {
  return await prisma.r_company.findFirst({
    where: { is_active: true },
    select: { id_company: true, company: true },
  });
}

async function upsertQaUser() {
  const role = await resolveRoleId();
  if (!role) {
    throw new Error('No hay roles activos para crear usuario de prueba.');
  }

  const company = await resolveCompanyId();
  if (!company) {
    throw new Error('No hay compañías activas para crear usuario de prueba.');
  }

  const plainPassword = randomPassword(20);
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  const authEntry = {
    type: 'password',
    password: hashedPassword,
    created: new Date().toISOString().slice(0, 10),
    expired: null,
  };

  const additional = {
    first_login: true,
    otp: {
      type: 'totp',
      enabled: false,
      secret: null,
      issuer: 'ShowDeal',
      label: `ShowDeal:${DEFAULT_LOGIN}`,
      otpauth_url: null,
    },
    login_security: {
      failed_attempts: 0,
      locked_until: null,
      reset_by_script_at: new Date().toISOString(),
    },
  };

  const existing = await prisma.r_user.findFirst({
    where: { user_1: DEFAULT_LOGIN },
    select: { id_user: true },
  });

  let user;
  if (!existing) {
    user = await prisma.r_user.create({
      data: {
        user_1: DEFAULT_LOGIN,
        name: DEFAULT_NAME,
        uin: `QA-${Date.now()}`,
        id_role: role.id_role,
        id_company: company.id_company,
        is_active: true,
        authentication: [authEntry],
        additional,
      },
      select: { id_user: true, user_1: true },
    });
  } else {
    user = await prisma.r_user.update({
      where: { id_user: existing.id_user },
      data: {
        name: DEFAULT_NAME,
        id_role: role.id_role,
        id_company: company.id_company,
        is_active: true,
        authentication: [authEntry],
        additional,
        upd_at: new Date(),
      },
      select: { id_user: true, user_1: true },
    });
  }

  return {
    user,
    role,
    company,
    plainPassword,
  };
}

async function main() {
  try {
    console.log('Preparando usuario QA para MFA, recuperacion de contrasena y lockout...');

    const result = await upsertQaUser();

    console.log('');
    console.log('Usuario QA listo.');
    console.log('==============================================');
    console.log(`ID Usuario: ${String(result.user.id_user)}`);
    console.log(`Login: ${result.user.user_1}`);
    console.log(`Password temporal: ${result.plainPassword}`);
    console.log(`Rol: ${result.role.role}`);
    console.log(`Compania: ${result.company.company}`);
    console.log('');
    console.log('Checklist de pruebas recomendadas:');
    console.log('1. Login correcto en /index.html.');
    console.log('2. Configurar OTP desde /home.html (primera sesion).');
    console.log('3. Verificar OTP en /otp.html.');
    console.log('4. Forzar 3 credenciales invalidas y validar ACCOUNT_LOCKED.');
    console.log('5. Ejecutar recuperacion en /reset-password.html y validar desbloqueo.');
    console.log('==============================================');
  } catch (err) {
    console.error('Error creando usuario QA:', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
