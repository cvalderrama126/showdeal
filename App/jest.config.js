module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test setup
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],

  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/tests/**/*.test.js',
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/uploads/'
  ],

  // Module paths
  moduleDirectories: ['node_modules', 'src'],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/server.js',
    '!src/db/**',
  ],

  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
  ],

  coverageThreshold: {
    // ─── Global baseline ────────────────────────────────────────────────────
    // Measured June 2026: stmts ~12%, branch ~2.5%, fns ~6%, lines ~13%.
    // These floors prevent regression without blocking CI.
    // Target milestones: 20 % → 35 % → 50 %.
    global: {
      branches: 2,
      functions: 5,
      lines: 12,
      statements: 11,
    },
    // ─── Critical-path files (keep these high) ───────────────────────────
    './src/routes/health.js': {
      statements: 60,
      functions: 50,
    },
    './src/app.js': {
      statements: 60,
    },
    './src/setup/setup.routes.js': {
      statements: 20,
    },
  },

  // Test timeout
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Bail on first test failure (useful for debugging)
  bail: false,

  // Max workers for parallel testing
  maxWorkers: '50%',

  // Error on deprecated
  errorOnDeprecated: true
};
