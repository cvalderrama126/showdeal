// ✅ Jest Configuration & Setup
const path = require('path');

// Set environment for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/showdeal_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-not-for-production';
process.env.JWT_CHALLENGE_SECRET = process.env.JWT_CHALLENGE_SECRET || 'test-jwt-challenge-secret';

// ─────────────────────────────────────────────────────────────────────────────
// Optional Prisma mock (enabled with MOCK_PRISMA=1).
//
// Why opt-in?
//   - In CI (.github/workflows/build-test.yml) we run with a real Postgres
//     service, so we want the *real* PrismaClient there.
//   - Locally / in sandboxes without a DB, set `MOCK_PRISMA=1 npm test` to
//     stub Prisma so the suite still runs end-to-end without 500s caused by
//     unreachable DB connections.
//
// The mock returns sensible empty defaults for every model in
// prisma/schema.prisma so route handlers can complete without throwing.
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.MOCK_PRISMA === '1') {
  jest.mock('@prisma/client', () => {
    const MODELS = [
      'r_access', 'r_asset', 'r_attach', 'r_auction', 'r_bid',
      'r_company', 'r_connection', 'r_event', 'r_invitation', 'r_log',
      'r_module', 'r_role', 'r_user', 'r_password_reset_token',
    ];

    const makeModelStub = () => {
      let nextId = 1;
      return {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
        findUnique: jest.fn(async () => null),
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data } = {}) => ({ id: nextId++, ...(data || {}) })),
        createMany: jest.fn(async ({ data } = {}) => ({ count: Array.isArray(data) ? data.length : 1 })),
        update: jest.fn(async ({ where, data } = {}) => ({ ...(where || {}), ...(data || {}) })),
        updateMany: jest.fn(async () => ({ count: 0 })),
        upsert: jest.fn(async ({ where, create, update } = {}) => ({ ...(where || {}), ...(create || update || {}) })),
        delete: jest.fn(async ({ where } = {}) => ({ ...(where || {}) })),
        deleteMany: jest.fn(async () => ({ count: 0 })),
        aggregate: jest.fn(async () => ({ _count: 0, _sum: {}, _avg: {}, _min: {}, _max: {} })),
        groupBy: jest.fn(async () => []),
      };
    };

    class PrismaClient {
      constructor() {
        for (const m of MODELS) this[m] = makeModelStub();
      }
      async $connect() { return; }
      async $disconnect() { return; }
      async $queryRaw() { return [{ ok: 1 }]; }
      async $queryRawUnsafe() { return [{ ok: 1 }]; }
      async $executeRaw() { return 0; }
      async $executeRawUnsafe() { return 0; }
      async $transaction(arg) {
        if (typeof arg === 'function') return arg(this);
        if (Array.isArray(arg)) return Promise.all(arg);
        return arg;
      }
    }

    return { PrismaClient, Prisma: { PrismaClientKnownRequestError: class {} } };
  });
}

// Increase test timeout for integration tests with DB
jest.setTimeout(30000);

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: console.error,
};

// Global test utilities
global.testUtils = {
  cleanupDB: async () => {
    // Placeholder for DB cleanup
  },
  generateTestUser: () => ({
    email: `test-${Date.now()}@test.com`,
    password: 'TestPassword123!',
    name: 'Test User'
  }),
  generateTestData: (model, override = {}) => {
    const defaults = {
      r_user: { email: `user-${Date.now()}@test.com`, password_hash: 'hashed' },
      r_module: { name: `module-${Date.now()}` },
      r_role: { name: `role-${Date.now()}` },
    };
    return { ...(defaults[model] || {}), ...override };
  }
};
