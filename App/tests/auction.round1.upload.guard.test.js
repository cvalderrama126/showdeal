'use strict';

const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../src/db/prisma', () => ({
  prisma: {
    r_user: {
      findUnique: jest.fn(),
    },
    r_module: {
      findFirst: jest.fn(),
    },
    r_access: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

const { createApp } = require('../src/app');
const { prisma } = require('../src/db/prisma');

const app = createApp();

function buildToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: '10',
      login: 'qa.user',
      companyId: '100',
      roleId: '2',
      roleName: 'buyer',
      isAdmin: false,
      tokenVersion: 0,
      iat: now,
      exp: now + 3600,
      ...overrides,
    },
    process.env.JWT_SECRET
  );
}

describe('Round1 upload guard', () => {
  beforeEach(() => {
    prisma.r_user.findUnique.mockResolvedValue({ is_active: true, additional: { token_version: 0 } });
    prisma.r_module.findFirst.mockResolvedValue({ id_module: 1n, is_admin: false });
    prisma.r_access.count.mockResolvedValue(1);
    prisma.r_access.findFirst.mockResolvedValue({ is_insert: true, is_update: true, is_delete: true });
  });

  it('rejects non-admin company spoofing before processing file', async () => {
    const token = buildToken({ companyId: '100', isAdmin: false });

    const res = await request(app)
      .post('/api/r_auction/round1/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('id_event', '1')
      .field('id_company', '200');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ ok: false, error: 'COMPANY_MISMATCH' });
  });

  it('rejects non-admin when token has no company claim', async () => {
    const token = buildToken({ companyId: undefined, isAdmin: false });

    const res = await request(app)
      .post('/api/r_auction/round1/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('id_event', '1')
      .field('id_company', '100');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ ok: false, error: 'INVALID_COMPANY_IN_TOKEN' });
  });

  it('allows admin to upload on behalf of another company (continues to next validations)', async () => {
    const token = buildToken({ isAdmin: true, companyId: undefined });

    const res = await request(app)
      .post('/api/r_auction/round1/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('id_event', '1')
      .field('id_company', '200');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, error: 'FILE_REQUIRED' });
  });
});
