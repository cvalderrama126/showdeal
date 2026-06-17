'use strict';

describe('auth.service TOTP secret encryption', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('otpSetup fails closed when TOTP secret encryption fails', async () => {
    const update = jest.fn();

    jest.doMock('../src/db/prisma', () => ({
      prisma: {
        r_user: {
          findUnique: jest.fn(async () => ({
            id_user: 1n,
            is_active: true,
            user_1: 'admin',
            login: 'admin',
            additional: {},
            r_role: {
              role: 'admin',
              additional: { is_admin: true },
            },
          })),
          update,
        },
      },
    }));

    jest.doMock('../src/utils/crypto.utils', () => ({
      encryptAES: jest.fn(() => {
        throw new Error('boom');
      }),
      decryptAES: jest.fn(),
    }));

    const { otpSetup } = require('../src/auth/auth.service');

    await expect(otpSetup({ id_user: 1n, issuer: 'ShowDeal' })).rejects.toMatchObject({
      status: 503,
      message: 'OTP_SECRET_ENCRYPTION_FAILED',
    });

    expect(update).not.toHaveBeenCalled();
  });
});