const express = require('express');
const request = require('supertest');

const mockQueryRaw = jest.fn();

jest.mock('../src/db/prisma', () => ({
  prisma: {
    $queryRaw: (...args) => mockQueryRaw(...args),
  },
}));

const healthRouter = require('../src/routes/health');

describe('health routes', () => {
  let app;

  beforeEach(() => {
    mockQueryRaw.mockReset();
    app = express();
    app.use('/health', healthRouter);
  });

  test('GET /health returns ok when db is reachable', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ ok: 1 }]);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe('ok');
    expect(res.body.mode).toBe('liveness');
  });

  test('GET /health returns degraded payload when db is down', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('db unavailable'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.error).toBe('DB_UNAVAILABLE');
    expect(res.body.mode).toBe('liveness');
  });

  test('GET /health/ready returns 503 when db is down', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('db unavailable'));

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.mode).toBe('readiness');
    expect(res.body.error).toBe('DB_UNAVAILABLE');
  });
});
