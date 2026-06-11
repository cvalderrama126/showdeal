'use strict';

const request = require('supertest');

process.env.MOCK_PRISMA = '1';

const { createApp } = require('../src/app');

const app = createApp();

describe('Setup API guard', () => {
  const originalDisable = process.env.DISABLE_SETUP;
  const originalToken = process.env.SETUP_TOKEN;

  afterEach(() => {
    if (originalDisable === undefined) delete process.env.DISABLE_SETUP;
    else process.env.DISABLE_SETUP = originalDisable;
    if (originalToken === undefined) delete process.env.SETUP_TOKEN;
    else process.env.SETUP_TOKEN = originalToken;
  });

  describe('GET /setup-api/status', () => {
    it('returns the configuration status (not guarded)', async () => {
      const res = await request(app).get('/setup-api/status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('configured');
    });
  });

  describe('POST /setup-api/bootstrap guard', () => {
    it('returns 404 when DISABLE_SETUP=true', async () => {
      process.env.DISABLE_SETUP = 'true';
      delete process.env.SETUP_TOKEN;
      const res = await request(app).post('/setup-api/bootstrap').send({});
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ ok: false, error: 'NOT_FOUND' });
    });

    it('returns 403 when SETUP_TOKEN is required but not provided', async () => {
      delete process.env.DISABLE_SETUP;
      process.env.SETUP_TOKEN = 'install-secret';
      const res = await request(app).post('/setup-api/bootstrap').send({});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ ok: false, error: 'SETUP_TOKEN_REQUIRED' });
    });

    it('returns 403 when SETUP_TOKEN does not match', async () => {
      delete process.env.DISABLE_SETUP;
      process.env.SETUP_TOKEN = 'install-secret';
      const res = await request(app)
        .post('/setup-api/bootstrap')
        .set('x-setup-token', 'wrong')
        .send({});
      expect(res.status).toBe(403);
    });

    it('passes the guard with a matching token (then fails validation)', async () => {
      delete process.env.DISABLE_SETUP;
      process.env.SETUP_TOKEN = 'install-secret';
      const res = await request(app)
        .post('/setup-api/bootstrap')
        .set('x-setup-token', 'install-secret')
        .send({});
      // Guard passed; empty payload fails Zod validation with 400.
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('ok', false);
    });
  });
});
