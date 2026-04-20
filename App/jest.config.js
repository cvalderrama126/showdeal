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
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
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
