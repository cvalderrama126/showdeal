'use strict';

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockFindMany  = jest.fn();
const mockFindUnique = jest.fn();

jest.mock('../src/db/prisma', () => ({
  prisma: {
    r_connection: { findMany:  (...a) => mockFindMany(...a)  },
    r_user:       { findUnique: (...a) => mockFindUnique(...a) },
    r_bid:        { findUnique: (...a) => mockFindUnique(...a) },
    r_asset:      { findUnique: (...a) => mockFindUnique(...a) },
    r_attach:     { findUnique: (...a) => mockFindUnique(...a) },
    r_auction:    { findUnique: (...a) => mockFindUnique(...a) },
  },
}));

const { requireOwnership, filterByOwnership } = require('../src/routes/ownership.middleware');

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeAuth(overrides = {}) {
  return { sub: '10', companyId: '5', isAdmin: false, ...overrides };
}

function makeReq(overrides = {}) {
  return { auth: makeAuth(), params: { id: '100' }, ...overrides };
}

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json  = jest.fn(() => res);
  return res;
}

// ─── requireOwnership ────────────────────────────────────────────────────────

describe('requireOwnership()', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindUnique.mockReset();
  });

  it('bypasses check and calls next() for admin users', async () => {
    const fn = requireOwnership('r_asset');
    const next = jest.fn();
    await fn(makeReq({ auth: makeAuth({ isAdmin: true }) }), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('calls next() when no id param is present', async () => {
    const fn = requireOwnership('r_asset');
    const next = jest.fn();
    await fn(makeReq({ params: {} }), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  // r_user model
  it('allows access to a user in the same company', async () => {
    const companyId = BigInt(5);
    mockFindUnique
      .mockResolvedValueOnce({ id_company: companyId })  // getUserCompany
      .mockResolvedValueOnce({ id_company: companyId }); // targetUser
    const fn = requireOwnership('r_user');
    const next = jest.fn();
    await fn(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('denies access to a user in a different company', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ id_company: BigInt(5) })    // requester company
      .mockResolvedValueOnce({ id_company: BigInt(99) });  // target company
    const fn = requireOwnership('r_user');
    const res = makeRes();
    await fn(makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error).toBe('ACCESS_DENIED');
  });

  it('returns 403 USER_NOT_FOUND when requester user row is null', async () => {
    mockFindUnique.mockResolvedValueOnce(null); // getUserCompany returns null
    const fn = requireOwnership('r_user');
    const res = makeRes();
    await fn(makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error).toBe('USER_NOT_FOUND');
  });

  // r_bid model
  it('allows access to own bid', async () => {
    const userId = BigInt(10);
    mockFindUnique.mockResolvedValueOnce({ id_user: userId });
    const fn = requireOwnership('r_bid');
    const next = jest.fn();
    await fn(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('denies access to another user\'s bid', async () => {
    mockFindUnique.mockResolvedValueOnce({ id_user: BigInt(999) });
    const fn = requireOwnership('r_bid');
    const res = makeRes();
    await fn(makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  // r_asset model
  it('allows access to connected asset', async () => {
    const assetId = BigInt(100);
    mockFindMany.mockResolvedValueOnce([{ id_asset: assetId }]);
    const fn = requireOwnership('r_asset');
    const next = jest.fn();
    await fn(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('denies access to asset not in company connections', async () => {
    mockFindMany.mockResolvedValueOnce([{ id_asset: BigInt(999) }]);
    const fn = requireOwnership('r_asset');
    const res = makeRes();
    await fn(makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  // default model
  it('allows access for unknown (admin-only) models', async () => {
    const fn = requireOwnership('r_module');
    const next = jest.fn();
    await fn(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  // error path
  it('calls next(err) on unexpected error', async () => {
    const boom = new Error('db boom');
    mockFindUnique.mockRejectedValueOnce(boom);
    const fn = requireOwnership('r_user');
    const next = jest.fn();
    await fn(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});

// ─── filterByOwnership ───────────────────────────────────────────────────────

describe('filterByOwnership()', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindUnique.mockReset();
  });

  it('bypasses filter for admin users and calls next()', async () => {
    const fn = filterByOwnership('r_asset');
    const req = makeReq({ auth: makeAuth({ isAdmin: true }) });
    const next = jest.fn();
    await fn(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.ownershipFilter).toBeUndefined();
  });

  it('sets ownershipFilter for r_bid (filter by userId)', async () => {
    const fn = filterByOwnership('r_bid');
    const req = makeReq();
    await fn(req, makeRes(), jest.fn());
    expect(req.ownershipFilter).toEqual({ id_user: BigInt(10) });
  });

  it('sets ownershipFilter for r_asset with connected ids', async () => {
    const assetId = BigInt(42);
    mockFindMany.mockResolvedValueOnce([{ id_asset: assetId }]);
    const fn = filterByOwnership('r_asset');
    const req = makeReq();
    await fn(req, makeRes(), jest.fn());
    expect(req.ownershipFilter).toEqual({ id_asset: { in: [assetId] } });
  });

  it('sets empty-result filter for r_asset with no connections', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    const fn = filterByOwnership('r_asset');
    const req = makeReq();
    await fn(req, makeRes(), jest.fn());
    expect(req.ownershipFilter).toEqual({ id_asset: -1 });
  });

  it('sets ownershipFilter for r_user using company', async () => {
    mockFindUnique.mockResolvedValueOnce({ id_company: BigInt(5) });
    const fn = filterByOwnership('r_user');
    const req = makeReq();
    await fn(req, makeRes(), jest.fn());
    expect(req.ownershipFilter).toEqual({ id_company: BigInt(5) });
  });

  it('calls next(err) on unexpected error', async () => {
    const boom = new Error('filter boom');
    mockFindMany.mockRejectedValueOnce(boom);
    const fn = filterByOwnership('r_asset');
    const next = jest.fn();
    await fn(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
