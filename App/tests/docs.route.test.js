'use strict';

const request = require('supertest');

// Use the Prisma mock so isSystemConfigured() on GET / doesn't hit a real DB.
process.env.MOCK_PRISMA = '1';

const { createApp } = require('../src/app');
const { openApiSpec } = require('../src/docs/openapi');

const app = createApp();

describe('API documentation', () => {
  describe('openApiSpec object', () => {
    it('is a valid OpenAPI 3 document', () => {
      expect(openApiSpec.openapi).toMatch(/^3\./);
      expect(openApiSpec.info.title).toBe('ShowDeal API');
      expect(openApiSpec.info.version).toBeDefined();
    });

    it('documents the core endpoints', () => {
      const paths = Object.keys(openApiSpec.paths);
      expect(paths).toEqual(expect.arrayContaining([
        '/health',
        '/health/ready',
        '/setup-api/status',
        '/setup-api/bootstrap',
        '/auth/login',
        '/auth/me',
      ]));
    });

    it('defines security schemes for bearer and CSRF', () => {
      const schemes = openApiSpec.components.securitySchemes;
      expect(schemes.bearerAuth.scheme).toBe('bearer');
      expect(schemes.csrfToken.name).toBe('X-CSRF-Token');
    });
  });

  describe('GET /api-docs.json', () => {
    it('returns the raw OpenAPI spec as JSON', async () => {
      const res = await request(app).get('/api-docs.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.info.title).toBe('ShowDeal API');
    });
  });

  describe('GET /api-docs', () => {
    it('serves the Swagger UI HTML page', async () => {
      const res = await request(app).get('/api-docs/').redirects(1);
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/swagger-ui/i);
    });
  });
});
