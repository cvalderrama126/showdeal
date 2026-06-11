'use strict';

const jwt = require('jsonwebtoken');

// ─── Prisma mock ─────────────────────────────────────────────────────────────
// Controlled per-test to simulate different DB states.

const mockFindUnique = jest.fn();
jest.mock('../src/db/prisma', () => ({
  prisma: {
    r_user: { findUnique: (...a) => mockFindUnique(...a) },
    $queryRaw: jest.fn(async () => [{ ok: 1 }]),
  },
}));

const { requireAuth } = require('../src/auth/auth.middleware');

// ─── helpers ─────────────────────────────────────────────────────────────────

const SECRET = 'test-jwt-secret-not-for-production';

function makeToken(payload = {}, secret = SECRET) {
  return jwt.sign(
    { sub: '1', iat: Math.floor(Date.now() / 1000), tokenVersion: 0, ...payload },
    secret,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

function makeReq(overrides = {}) {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json  = jest.fn(() => res);
  return res;
}

// ─── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
  mockFindUnique.mockReset();
});

describe('requireAuth middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const res = makeRes();
    await requireAuth(makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatch(/missing token/i);
  });

  it('returns 500 when JWT_SECRET is not set', async () => {
    delete process.env.JWT_SECRET;
    const res = makeRes();
    const req = makeReq({ headers: { authorization: `Bearer ${makeToken()}` } });
    await requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    process.env.JWT_SECRET = SECRET;
  });

  it('returns 401 for an invalid/tampered token', async () => {
    const res = makeRes();
    const req = makeReq({ headers: { authorization: 'Bearer invalidtoken' } });
    await requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatch(/invalid token/i);
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign(
      { sub: '1', tokenVersion: 0 },
      SECRET,
      { algorithm: 'HS256', expiresIn: -1 },
    );
    const res = makeRes();
    const req = makeReq({ headers: { authorization: `Bearer ${expired}` } });
    await requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatch(/expired/i);
  });

  it('returns 401 when user is not found in DB', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const res = makeRes();
    const req = makeReq({ headers: { authorization: `Bearer ${makeToken()}` } });
    await requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error).toMatch(/not active|not found/i);
  });

  it('returns 401 when user is inactive', async () => {
    mockFindUnique.mockResolvedValueOnce({
      is_active: false,
      additional: { token_version: 0 },
    });
    const res = makeRes();
    const req = makeReq({ headers: { authorization: `Bearer ${makeToken()}` } });
    await requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error).toMatch(/not active/i);
  });

  it('returns 401 when token version is revoked', async () => {
    mockFindUnique.mockResolvedValueOnce({
      is_active: true,
      additional: { token_version: 99 }, // DB version ahead of token
    });
    const res = makeRes();
    const req = makeReq({ headers: { authorization: `Bearer ${makeToken({ tokenVersion: 0 })}` } });
    await requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error).toMatch(/revoked/i);
  });

  it('calls next() and sets req.auth on valid token + active user', async () => {
    mockFindUnique.mockResolvedValueOnce({
      is_active: true,
      additional: { token_version: 0 },
    });
    const next = jest.fn();
    const req = makeReq({ headers: { authorization: `Bearer ${makeToken()}` } });
    await requireAuth(req, {}, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toBeDefined();
    expect(req.auth.sub).toBe('1');
  });

  it('accepts token from sd_auth cookie when no Authorization header', async () => {
    mockFindUnique.mockResolvedValueOnce({
      is_active: true,
      additional: { token_version: 0 },
    });
    const next = jest.fn();
    const req = makeReq({ cookies: { sd_auth: makeToken() } });
    await requireAuth(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 for token with non-numeric subject', async () => {
    const badToken = jwt.sign(
      { sub: 'not-a-number', tokenVersion: 0 },
      SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const res = makeRes();
    const req = makeReq({ headers: { authorization: `Bearer ${badToken}` } });
    await requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
