// ✅ Jest Configuration & Setup
const path = require('path');

// Set environment for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/showdeal_test';

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
