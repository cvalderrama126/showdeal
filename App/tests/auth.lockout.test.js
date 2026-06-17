'use strict';

describe('auth.service lockout policy', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.MAX_FAILED_LOGIN_ATTEMPTS = '3';
    process.env.ACCOUNT_LOCK_MINUTES = '15';
  });

  test('locks account on third invalid credential attempt', async () => {
    const update = jest.fn(async () => ({}));

    jest.doMock('../src/db/prisma', () => ({
      prisma: {
        r_user: {
          findFirst: jest.fn(async () => ({
            id_user: 9n,
            user_1: 'qa.user',
            login: 'qa.user',
            is_active: true,
            id_company: 1n,
            id_role: 1n,
            authentication: [{ password: '$2b$10$abcdefghijklmnopqrstuv1234567890abcdEFGHijklmn' }],
            additional: { login_security: { failed_attempts: 2, locked_until: null } },
            r_role: { role: 'Root', additional: { is_admin: true } },
          })),
          findUnique: jest.fn(),
          update,
        },
      },
    }));

    jest.doMock('bcryptjs', () => ({
      compare: jest.fn(async () => false),
      hash: jest.fn(),
    }));

    const { login } = require('../src/auth/auth.service');
    const result = await login({ user: 'qa.user', password: 'wrong-password' });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(423);
    expect(result.code).toBe('ACCOUNT_LOCKED');
    expect(update).toHaveBeenCalledTimes(1);
  });

  test('rejects login when account already locked', async () => {
    const futureIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    jest.doMock('../src/db/prisma', () => ({
      prisma: {
        r_user: {
          findFirst: jest.fn(async () => ({
            id_user: 10n,
            user_1: 'locked.user',
            login: 'locked.user',
            is_active: true,
            authentication: [{ password: '$2b$10$abcdefghijklmnopqrstuv1234567890abcdEFGHijklmn' }],
            additional: { login_security: { failed_attempts: 3, locked_until: futureIso } },
            r_role: { role: 'Root', additional: { is_admin: true } },
          })),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      },
    }));

    jest.doMock('bcryptjs', () => ({
      compare: jest.fn(async () => true),
      hash: jest.fn(),
    }));

    const { login } = require('../src/auth/auth.service');
    const result = await login({ user: 'locked.user', password: 'any' });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(423);
    expect(result.code).toBe('ACCOUNT_LOCKED');
  });
});
