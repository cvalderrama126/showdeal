'use strict';

const {
  sanitizeError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
} = require('../src/routes/error.middleware');

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    url: '/test',
    method: 'GET',
    ip: '127.0.0.1',
    get: jest.fn(() => 'jest-test-agent'),
    ...overrides,
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json  = jest.fn(() => res);
  return res;
}

// ─── sanitizeError ───────────────────────────────────────────────────────────

describe('sanitizeError()', () => {
  it('returns generic message for unknown errors', () => {
    const result = sanitizeError(new Error('internal details'));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('An error occurred while processing your request.');
    expect(result.timestamp).toBeDefined();
  });

  it('maps ValidationError to VALIDATION_ERROR code', () => {
    const err = Object.assign(new Error('bad input'), { name: 'ValidationError' });
    const result = sanitizeError(err);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.error).toMatch(/Invalid input/i);
  });

  it('maps UnauthorizedError to UNAUTHORIZED code', () => {
    const err = Object.assign(new Error('Unauthorized'), { name: 'UnauthorizedError' });
    const result = sanitizeError(err);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  it('maps ForbiddenError to FORBIDDEN code', () => {
    const err = Object.assign(new Error('Forbidden access'), { name: 'ForbiddenError' });
    const result = sanitizeError(err);
    expect(result.code).toBe('FORBIDDEN');
  });

  it('maps Prisma P2002 to DUPLICATE_RECORD', () => {
    const err = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    const result = sanitizeError(err);
    expect(result.code).toBe('P2002');
    expect(result.error).toMatch(/already exists/i);
  });

  it('maps Prisma P2025 to NOT_FOUND', () => {
    const err = Object.assign(new Error('record not found'), { code: 'P2025' });
    const result = sanitizeError(err);
    expect(result.code).toBe('P2025');
    expect(result.error).toMatch(/not found/i);
  });

  it('maps Prisma P1001 to DATABASE_ERROR', () => {
    const err = Object.assign(new Error('db down'), { code: 'P1001' });
    const result = sanitizeError(err);
    expect(result.code).toBe('P1001');
    expect(result.error).toMatch(/unavailable/i);
  });

  it('maps JWT errors', () => {
    const err = new Error('JWT invalid signature');
    const result = sanitizeError(err);
    expect(result.code).toBe('INVALID_TOKEN');
  });

  it('maps bcrypt/password errors to AUTHENTICATION_ERROR', () => {
    const err = new Error('bcrypt compare failed');
    const result = sanitizeError(err);
    expect(result.code).toBe('AUTHENTICATION_ERROR');
  });

  it('exposes original error when ENABLE_DEBUG_ERRORS=1', () => {
    process.env.ENABLE_DEBUG_ERRORS = '1';
    const err = new Error('raw details');
    const result = sanitizeError(err);
    expect(result.originalError).toBe('raw details');
    delete process.env.ENABLE_DEBUG_ERRORS;
  });
});

// ─── errorHandler ────────────────────────────────────────────────────────────

describe('errorHandler()', () => {
  it('responds 409 for Prisma P2002 (unique constraint)', () => {
    const err = Object.assign(new Error('dupe'), { code: 'P2002' });
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalled();
  });

  it('responds 404 for Prisma P2025 (record not found)', () => {
    const err = Object.assign(new Error('missing'), { code: 'P2025' });
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('responds 503 for Prisma P1001 (db unavailable)', () => {
    const err = Object.assign(new Error('db conn'), { code: 'P1001' });
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('normalises odd status codes to 500', () => {
    const err = Object.assign(new Error('odd'), { status: 399 });
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('responds 500 for generic server errors', () => {
    const err = new Error('something broke');
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.ok).toBe(false);
    // Must not leak internal detail
    expect(body.error).not.toContain('something broke');
  });

  it('exposes safe uppercase code messages (4xx)', () => {
    const err = Object.assign(new Error('FILE_REQUIRED'), { status: 400 });
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('FILE_REQUIRED');
  });

  it('sanitises 4xx messages that contain SQL keywords', () => {
    const err = Object.assign(new Error('SQL injection attempt'), { status: 400 });
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).not.toContain('SQL injection');
  });

  it('respects err.statusCode as fallback', () => {
    const err = Object.assign(new Error('Not found'), { statusCode: 404 });
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─── notFoundHandler ─────────────────────────────────────────────────────────

describe('notFoundHandler()', () => {
  it('responds 404 with path', () => {
    const req = makeReq({ path: '/missing/resource' });
    const res = makeRes();
    notFoundHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.ok).toBe(false);
    expect(body.path).toBe('/missing/resource');
  });
});

// ─── asyncHandler ─────────────────────────────────────────────────────────────

describe('asyncHandler()', () => {
  it('calls next with the rejection reason on async failure', async () => {
    const error = new Error('async boom');
    const wrapped = asyncHandler(async () => { throw error; });
    const next = jest.fn();
    await wrapped(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it('runs successfully without calling next when handler resolves', async () => {
    const wrapped = asyncHandler(async (req, res) => { res.json({ ok: true }); });
    const next = jest.fn();
    const res = makeRes();
    await wrapped(makeReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
