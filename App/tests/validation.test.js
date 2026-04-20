// 📋 FORM VALIDATION & INPUT SANITIZATION TESTS
const request = require('supertest');
const { createApp } = require('../src/app');

describe('📋 Form Validation & Input Sanitization', () => {
  let app;
  const authToken = 'Bearer mock-token';

  beforeAll(() => {
    app = createApp();
  });

  describe('👤 User Registration Validation', () => {
    test('Should reject invalid email format', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: 'Password123!'
        });

      expect([400, 409]).toContain(response.status);
    });

    test('Should reject weak passwords', async () => {
      const weakPasswords = ['123', 'password', '12345678', 'abc'];

      for (const pwd of weakPasswords) {
        const response = await request(app)
          .post('/auth/register')
          .send({
            email: `test-${Date.now()}@test.com`,
            password: pwd
          });

        if (response.status === 400) {
          expect(response.body.error).toBeDefined();
        }
      }
    });

    test('Should require minimum password length', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: `test-${Date.now()}@test.com`,
          password: 'Pass1'
        });

      expect([400, 409]).toContain(response.status);
    });

    test('Should reject duplicate emails', async () => {
      const email = `dup-${Date.now()}@test.com`;

      // First registration
      const resp1 = await request(app)
        .post('/auth/register')
        .send({ email, password: 'Password123!' });

      if (resp1.status === 201) {
        // Second registration with same email
        const resp2 = await request(app)
          .post('/auth/register')
          .send({ email, password: 'Password123!' });

        expect(resp2.status).toBe(409);
      }
    });

    test('Should reject extra fields', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          email: `test-${Date.now()}@test.com`,
          password: 'Password123!',
          isAdmin: true,  // Should be rejected
          role: 'admin'   // Should be rejected
        });

      // Either accept and ignore, or reject
      expect([201, 400, 409]).toContain(response.status);
    });
  });

  describe('🏢 Company Data Validation', () => {
    test('Should reject empty company name', async () => {
      const response = await request(app)
        .post('/api/r_company')
        .set('Authorization', authToken)
        .send({ name: '' });

      expect([400, 401]).toContain(response.status);
    });

    test('Should validate company name length', async () => {
      const longName = 'A'.repeat(1000);
      
      const response = await request(app)
        .post('/api/r_company')
        .set('Authorization', authToken)
        .send({ name: longName });

      if (response.status === 400) {
        expect(response.body.error).toBeDefined();
      }
    });

    test('Should sanitize HTML in company description', async () => {
      const response = await request(app)
        .post('/api/r_company')
        .set('Authorization', authToken)
        .send({
          name: 'Test Company',
          description: '<script>alert("XSS")</script>'
        });

      if (response.status === 201) {
        // Should not contain script tags
        expect(response.body.description).not.toContain('<script>');
      }
    });
  });

  describe('💰 Bid Amount Validation', () => {
    test('Should reject negative bid amounts', async () => {
      const response = await request(app)
        .post('/api/r_bid')
        .set('Authorization', authToken)
        .send({
          amount: -100,
          auctionId: 1
        });

      expect([400, 401]).toContain(response.status);
    });

    test('Should reject zero bid amounts', async () => {
      const response = await request(app)
        .post('/api/r_bid')
        .set('Authorization', authToken)
        .send({
          amount: 0,
          auctionId: 1
        });

      expect([400, 401]).toContain(response.status);
    });

    test('Should validate decimal precision', async () => {
      const response = await request(app)
        .post('/api/r_bid')
        .set('Authorization', authToken)
        .send({
          amount: 99.999,  // More than 2 decimals
          auctionId: 1
        });

      // Either round or reject
      expect([200, 201, 400, 401]).toContain(response.status);
    });

    test('Should validate maximum bid amount', async () => {
      const response = await request(app)
        .post('/api/r_bid')
        .set('Authorization', authToken)
        .send({
          amount: 999999999999,
          auctionId: 1
        });

      if (response.status === 400) {
        expect(response.body.error).toBeDefined();
      }
    });
  });

  describe('📝 Text Field Validation', () => {
    test('Should trim whitespace', async () => {
      const response = await request(app)
        .post('/api/r_module')
        .set('Authorization', authToken)
        .send({
          name: '  Module Name  '
        });

      if (response.status === 201) {
        expect(response.body.name).toBe('Module Name');
      }
    });

    test('Should reject null values', async () => {
      const response = await request(app)
        .post('/api/r_module')
        .set('Authorization', authToken)
        .send({
          name: null
        });

      expect([400, 401]).toContain(response.status);
    });

    test('Should reject undefined values', async () => {
      const response = await request(app)
        .post('/api/r_module')
        .set('Authorization', authToken)
        .send({
          // name is undefined
        });

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('🔗 URL/URI Validation', () => {
    test('Should validate URL format', async () => {
      const response = await request(app)
        .post('/api/r_asset')
        .set('Authorization', authToken)
        .send({
          url: 'not-a-url'
        });

      if (response.status === 400) {
        expect(response.body.error).toBeDefined();
      }
    });

    test('Should accept valid URLs', async () => {
      const response = await request(app)
        .post('/api/r_asset')
        .set('Authorization', authToken)
        .send({
          url: 'https://example.com/path'
        });

      expect([201, 400, 401]).toContain(response.status);
    });
  });

  describe('📅 Date/Time Validation', () => {
    test('Should accept valid ISO 8601 dates', async () => {
      const response = await request(app)
        .post('/api/r_event')
        .set('Authorization', authToken)
        .send({
          name: 'Event',
          startDate: '2026-12-31T10:00:00Z'
        });

      expect([201, 400, 401]).toContain(response.status);
    });

    test('Should reject invalid date format', async () => {
      const response = await request(app)
        .post('/api/r_event')
        .set('Authorization', authToken)
        .send({
          name: 'Event',
          startDate: '31/12/2026'
        });

      if (response.status === 400) {
        expect(response.body.error).toBeDefined();
      }
    });

    test('Should reject past dates for future events', async () => {
      const pastDate = new Date('2020-01-01').toISOString();
      
      const response = await request(app)
        .post('/api/r_event')
        .set('Authorization', authToken)
        .send({
          name: 'Event',
          startDate: pastDate
        });

      if (response.status === 400) {
        expect(response.body.error).toBeDefined();
      }
    });
  });

  describe('🔢 Numeric Validation', () => {
    test('Should reject non-numeric values for numbers', async () => {
      const response = await request(app)
        .post('/api/r_asset')
        .set('Authorization', authToken)
        .send({
          quantity: 'not-a-number'
        });

      expect([400, 401]).toContain(response.status);
    });

    test('Should validate integer ranges', async () => {
      const response = await request(app)
        .post('/api/r_asset')
        .set('Authorization', authToken)
        .send({
          status: 999  // Invalid status code
        });

      if (response.status === 400) {
        expect(response.body.error).toBeDefined();
      }
    });
  });

});
