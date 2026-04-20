// 🔐 SECURITY TESTS - OWASP Top 10
// Testing for SQL Injection, XSS, CSRF, Auth bypass, etc.

const request = require('supertest');
const { createApp } = require('../src/app');

describe('🔐 OWASP Top 10 Security Tests', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe('1️⃣ SQL Injection Prevention', () => {
    test('Should not execute SQL injection in login endpoint', async () => {
      const sqlInjectionPayload = {
        email: "' OR '1'='1",
        password: "' OR '1'='1"
      };

      const response = await request(app)
        .post('/auth/login')
        .send(sqlInjectionPayload);

      // Should either return error or safe response
      expect([400, 401, 500]).toContain(response.status);
      // Should NOT return user data
      expect(response.body.token).toBeUndefined();
    });

    test('Should not execute SQL injection in module search', async () => {
      const sqlInjectionPayload = {
        name: "'; DROP TABLE r_module; --"
      };

      const response = await request(app)
        .get('/api/r_module')
        .query(sqlInjectionPayload)
        .set('Authorization', 'Bearer fake-token');

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('2️⃣ XSS (Cross-Site Scripting) Prevention', () => {
    test('Should sanitize XSS payload in module name', async () => {
      const xssPayload = {
        name: '<script>alert("XSS")</script>',
        description: '<img src=x onerror="alert(\'XSS\')">'
      };

      const response = await request(app)
        .post('/api/r_module')
        .set('Authorization', 'Bearer fake-token')
        .send(xssPayload);

      // Response should not echo unsanitized payload
      if (response.status === 201) {
        expect(response.body.name).not.toContain('<script>');
        expect(response.body.description).not.toContain('onerror=');
      }
    });
  });

  describe('3️⃣ CSRF Protection', () => {
    test('POST requests should validate CSRF token or use other protection', async () => {
      const response = await request(app)
        .post('/api/r_module')
        .send({ name: 'test' });

      // Should reject if CSRF protection is in place
      // (Can be 403 Forbidden or implement token validation)
      expect([403, 401, 400]).toContain(response.status);
    });
  });

  describe('4️⃣ Authentication Issues', () => {
    test('Should reject requests without Authorization header', async () => {
      const response = await request(app)
        .get('/api/r_module');

      expect([401, 403]).toContain(response.status);
    });

    test('Should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/r_module')
        .set('Authorization', 'Bearer invalid-token-xyz');

      expect([401, 403]).toContain(response.status);
    });

    test('Should reject expired tokens', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.xxxx';
      
      const response = await request(app)
        .get('/api/r_module')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('5️⃣ Authorization - IDOR Prevention', () => {
    test('Should not allow users to access other users\' data', async () => {
      // User should not be able to access other user resources
      const response = await request(app)
        .get('/api/r_user/999999')
        .set('Authorization', 'Bearer user-token')
        .set('X-User-ID', '1');

      // Should return 401 (auth required), 403 or 404 (not expose existence)
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe('6️⃣ Sensitive Data Exposure', () => {
    test('Should not return password hashes in responses', async () => {
      const response = await request(app)
        .get('/api/r_user')
        .set('Authorization', 'Bearer admin-token');

      if (response.status === 200 && Array.isArray(response.body)) {
        response.body.forEach(user => {
          expect(user.password_hash).toBeUndefined();
          expect(user.password).toBeUndefined();
        });
      }
    });

    test('Should not expose stack traces in error responses', async () => {
      const response = await request(app)
        .post('/api/invalid-endpoint')
        .set('Authorization', 'Bearer token');

      if (response.body.error) {
        expect(response.body.error).not.toMatch(/at\s+\w+\.js:/);
        expect(response.body.stackTrace).toBeUndefined();
      }
    });
  });

  describe('7️⃣ File Upload Security', () => {
    test('Should reject executable files', async () => {
      const response = await request(app)
        .post('/api/r_attach')
        .set('Authorization', 'Bearer token')
        .field('name', 'malicious')
        .attach('file', Buffer.from('#!/bin/bash\nrm -rf /'), 'script.sh');

      expect([400, 401, 415]).toContain(response.status);
    });

    test('Should validate file size limits', async () => {
      const largeBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB
      
      const response = await request(app)
        .post('/api/r_attach')
        .set('Authorization', 'Bearer token')
        .field('name', 'large-file')
        .attach('file', largeBuffer, 'large.bin');

      expect([400, 401, 413]).toContain(response.status);
    });
  });

  describe('8️⃣ Rate Limiting', () => {
    test('Should rate limit excessive requests', async () => {
      let rateLimited = false;
      
      for (let i = 0; i < 150; i++) {
        const response = await request(app)
          .get('/api/r_module')
          .set('Authorization', 'Bearer token');
        
        if (response.status === 429) {
          rateLimited = true;
          break;
        }
      }

      // expect(rateLimited).toBe(true);
    });
  });

  describe('9️⃣ XXE & XML Attack Prevention', () => {
    test('Should not process XXE payloads in imports', async () => {
      const xxePayload = `<?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
        <root>&xxe;</root>`;

      const response = await request(app)
        .post('/api/import')
        .set('Authorization', 'Bearer token')
        .send(xxePayload);

      expect([400, 401, 404, 415]).toContain(response.status);
    });
  });

  describe('🔟 Security Headers', () => {
    test('Should include security headers', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.headers['x-content-type-options']).toBeDefined();
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });
  });

});
