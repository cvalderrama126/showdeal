// OpenAPI 3.0 specification for the ShowDeal API.
// Served via swagger-ui-express at GET /api-docs and raw JSON at GET /api-docs.json
//
// Kept as a plain JS object (rather than JSDoc annotations) so the spec is
// available without a build step and can be unit-tested directly.

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ShowDeal API',
    version: '1.0.0',
    description:
      'REST API for the ShowDeal auction platform. Authentication uses JWT ' +
      '(Bearer token or `sd_auth` cookie). State-changing requests require a ' +
      'CSRF token (`X-CSRF-Token` header matching the `sd_csrf` cookie).',
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Local development' },
    { url: 'https://showdeal.com', description: 'Production' },
  ],
  tags: [
    { name: 'Health', description: 'Liveness and readiness probes' },
    { name: 'Setup', description: 'First-run system provisioning' },
    { name: 'Auth', description: 'Authentication, OTP and password management' },
    { name: 'CRUD', description: 'Generic CRUD for r_* resources' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT issued by POST /auth/login (or via the sd_auth cookie).',
      },
      csrfToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'Must match the sd_csrf cookie. Obtain via GET /auth/csrf-token.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string', example: 'UNAUTHORIZED' },
          code: { type: 'string', example: 'UNAUTHORIZED' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      HealthStatus: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          healthy: { type: 'boolean' },
          status: { type: 'string', enum: ['ok', 'degraded', 'error'] },
          service: { type: 'string', example: 'showdeal-api' },
          db: { type: 'string', enum: ['ok', 'error'] },
          mode: { type: 'string', enum: ['liveness', 'readiness'] },
          time: { type: 'string', format: 'date-time' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['login', 'password'],
        properties: {
          login: { type: 'string', example: 'admin@showdeal.com' },
          password: { type: 'string', format: 'password' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          token: { type: 'string', description: 'Session JWT (absent if OTP required)' },
          challengeToken: { type: 'string', description: 'Present when OTP verification is required' },
          otpRequired: { type: 'boolean' },
        },
      },
      OtpVerifyRequest: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', example: '123456' },
        },
      },
      BootstrapRequest: {
        type: 'object',
        required: [
          'dbHost', 'dbPort', 'installerUser', 'installerPassword',
          'dbName', 'appDbUser', 'appDbPassword',
          'companyName', 'adminName', 'adminUser', 'adminPassword',
        ],
        properties: {
          dbHost: { type: 'string', example: 'localhost' },
          dbPort: { type: 'integer', example: 5432 },
          installerUser: { type: 'string', example: 'postgres' },
          installerPassword: { type: 'string', format: 'password' },
          dbName: { type: 'string', example: 'showdeal' },
          appDbUser: { type: 'string', example: 'showdeal' },
          appDbPassword: { type: 'string', format: 'password' },
          companyName: { type: 'string', example: 'ShowDeal Inc.' },
          adminName: { type: 'string', example: 'Administrator' },
          adminUser: { type: 'string', example: 'admin@showdeal.com' },
          adminPassword: { type: 'string', format: 'password' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Always returns 200. Reports `degraded` if the DB is unreachable.',
        responses: {
          200: {
            description: 'Service is alive',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthStatus' },
              },
            },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Returns 200 when DB is reachable, 503 otherwise. Used by container orchestration.',
        responses: {
          200: {
            description: 'Service is ready',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/HealthStatus' } },
            },
          },
          503: {
            description: 'Service not ready (DB unreachable)',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/HealthStatus' } },
            },
          },
        },
      },
    },
    '/setup-api/status': {
      get: {
        tags: ['Setup'],
        summary: 'Check if the system is configured',
        responses: {
          200: {
            description: 'Configuration status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    configured: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/setup-api/bootstrap': {
      post: {
        tags: ['Setup'],
        summary: 'Provision the database and create the first admin user',
        description: 'Only works once. Returns 409 if the system is already configured.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BootstrapRequest' },
            },
          },
        },
        responses: {
          201: { description: 'System provisioned successfully' },
          400: {
            description: 'Validation or DB connection error',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          409: {
            description: 'System already configured',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate with credentials',
        security: [{ csrfToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Authenticated (or OTP challenge issued)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
          },
          401: {
            description: 'Invalid credentials',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          429: { description: 'Too many login attempts (rate limited)' },
        },
      },
    },
    '/auth/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP code and obtain session token',
        security: [{ csrfToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/OtpVerifyRequest' } },
          },
        },
        responses: {
          200: { description: 'OTP verified, session token returned' },
          401: { description: 'Invalid or expired OTP code' },
        },
      },
    },
    '/auth/csrf-token': {
      get: {
        tags: ['Auth'],
        summary: 'Obtain a CSRF token',
        description: 'Sets the sd_csrf cookie and returns the token to echo in X-CSRF-Token.',
        responses: {
          200: { description: 'CSRF token issued' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the current authenticated user',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Current user payload' },
          401: {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Clear the session cookie',
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/api/{resource}': {
      get: {
        tags: ['CRUD'],
        summary: 'List records of a resource',
        description: 'Generic CRUD list endpoint. `resource` is an r_* model name (e.g. r_asset, r_auction, r_bid).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'resource', in: 'path', required: true,
            schema: { type: 'string', example: 'r_asset' },
          },
        ],
        responses: {
          200: { description: 'List of records' },
          401: { description: 'Not authenticated' },
        },
      },
      post: {
        tags: ['CRUD'],
        summary: 'Create a record',
        security: [{ bearerAuth: [], csrfToken: [] }],
        parameters: [
          {
            name: 'resource', in: 'path', required: true,
            schema: { type: 'string', example: 'r_asset' },
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          201: { description: 'Record created' },
          400: { description: 'Validation error' },
          401: { description: 'Not authenticated' },
          403: { description: 'CSRF token invalid or access denied' },
        },
      },
    },
    '/api/{resource}/{id}': {
      put: {
        tags: ['CRUD'],
        summary: 'Update a record by id',
        security: [{ bearerAuth: [], csrfToken: [] }],
        parameters: [
          { name: 'resource', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          200: { description: 'Record updated' },
          403: { description: 'CSRF token invalid or access denied' },
          404: { description: 'Record not found' },
        },
      },
      delete: {
        tags: ['CRUD'],
        summary: 'Delete a record by id',
        security: [{ bearerAuth: [], csrfToken: [] }],
        parameters: [
          { name: 'resource', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Record deleted' },
          403: { description: 'CSRF token invalid or access denied' },
          404: { description: 'Record not found' },
        },
      },
    },
  },
};

module.exports = { openApiSpec };
