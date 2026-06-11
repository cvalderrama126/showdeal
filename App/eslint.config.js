// ESLint 9 flat config — ShowDeal API (CommonJS, Node.js 18+)
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // ── Ignore patterns ────────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'uploads/**',
      'public/**',       // frontend files are not linted here
      'scripts/**',      // ad-hoc utility scripts — relaxed rules
    ],
  },

  // ── Base recommended rules ─────────────────────────────────────────────────
  js.configs.recommended,

  // ── Project-wide config ────────────────────────────────────────────────────
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },

    rules: {
      // --- Security (errors) -------------------------------------------------
      'no-eval':          'error',
      'no-implied-eval':  'error',
      'no-new-func':      'error',

      // --- Code quality (errors) ---------------------------------------------
      'eqeqeq':           ['error', 'always', { null: 'ignore' }],
      'no-var':           'error',
      'prefer-const':     ['error', { destructuring: 'all' }],

      // --- Warnings (fix progressively) -------------------------------------
      'no-unused-vars':   ['warn', {
        vars: 'all',
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_',
      }],

      // --- Intentional allowances -------------------------------------------
      'no-console':       'off',   // server logging uses console intentionally
    },
  },

  // ── Tests — relaxed config ─────────────────────────────────────────────────
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },
];
