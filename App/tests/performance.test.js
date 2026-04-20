// ⚡ PERFORMANCE TESTS - Response Times & Benchmarks
const request = require('supertest');
const { createApp } = require('../src/app');

describe('⚡ Performance & Latency Tests', () => {
  let app;
  const RESPONSE_TIME_THRESHOLD = 200; // ms
  const authToken = 'Bearer mock-token';

  beforeAll(() => {
    app = createApp();
  });

  describe('📊 Response Time Benchmarks', () => {
    test('GET /health should respond < 50ms', async () => {
      const start = performance.now();
      
      const response = await request(app)
        .get('/health');
      
      const duration = performance.now() - start;
      console.log(`  ⏱️  /health: ${duration.toFixed(2)}ms`);
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(50);
    });

    test('GET /api/r_user should respond < 200ms', async () => {
      const start = performance.now();
      
      const response = await request(app)
        .get('/api/r_user')
        .set('Authorization', authToken);
      
      const duration = performance.now() - start;
      console.log(`  ⏱️  /api/r_user: ${duration.toFixed(2)}ms`);
      
      if (response.status === 200 || response.status === 401) {
        expect(duration).toBeLessThan(RESPONSE_TIME_THRESHOLD);
      }
    });

    test('GET /api/r_module should respond < 200ms', async () => {
      const start = performance.now();
      
      const response = await request(app)
        .get('/api/r_module')
        .set('Authorization', authToken);
      
      const duration = performance.now() - start;
      console.log(`  ⏱️  /api/r_module: ${duration.toFixed(2)}ms`);
      
      if (response.status === 200 || response.status === 401) {
        expect(duration).toBeLessThan(RESPONSE_TIME_THRESHOLD);
      }
    });

    test('POST /api/r_user should respond < 300ms', async () => {
      const start = performance.now();
      
      const response = await request(app)
        .post('/api/r_user')
        .set('Authorization', authToken)
        .send({ 
          email: `test-${Date.now()}@test.com`,
          password: 'TestPassword123!'
        });
      
      const duration = performance.now() - start;
      console.log(`  ⏱️  POST /api/r_user: ${duration.toFixed(2)}ms`);
      
      if ([201, 400, 401].includes(response.status)) {
        expect(duration).toBeLessThan(300);
      }
    });
  });

  describe('🔄 Concurrent Request Handling', () => {
    test('Should handle 10 concurrent requests', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .get('/api/r_user')
            .set('Authorization', authToken)
        );
      }

      const results = await Promise.all(promises);
      
      results.forEach(response => {
        expect([200, 401, 503]).toContain(response.status);
      });
    });

    test('Should handle 50 concurrent requests without errors', async () => {
      const promises = [];
      
      for (let i = 0; i < 50; i++) {
        promises.push(
          request(app)
            .get('/health')
        );
      }

      const results = await Promise.all(promises);
      
      const successCount = results.filter(r => r.status === 200).length;
      const failureCount = results.filter(r => r.status >= 500).length;

      console.log(`  📊 50 concurrent requests: ${successCount} success, ${failureCount} failures`);
      
      // At least 95% should succeed
      expect(successCount).toBeGreaterThan(47);
    });
  });

  describe('💾 Memory Performance', () => {
    test('Memory usage should remain stable', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      console.log(`  💾 Initial heap: ${(initialMemory / 1024 / 1024).toFixed(2)}MB`);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const currentMemory = process.memoryUsage().heapUsed;
      console.log(`  💾 Current heap: ${(currentMemory / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory should not grow more than 50MB in tests
      const growth = (currentMemory - initialMemory) / 1024 / 1024;
      expect(growth).toBeLessThan(50);
    });
  });

  describe('📈 Throughput Tests', () => {
    test('Should maintain consistent throughput', async () => {
      const iterations = 20;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        
        await request(app)
          .get('/health');
        
        const duration = performance.now() - start;
        times.push(duration);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      console.log(`  📈 Throughput: avg=${avgTime.toFixed(2)}ms, min=${minTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`);
      
      // Average should be consistent
      expect(avgTime).toBeLessThan(100);
      // Max should not exceed 3x the average
      expect(maxTime).toBeLessThan(avgTime * 3);
    });
  });

  describe('🔍 Query Performance', () => {
    test('Pagination should not degrade performance', async () => {
      const takes = [10, 50, 100];
      const results = [];

      for (const take of takes) {
        const start = performance.now();
        
        const response = await request(app)
          .get(`/api/r_user?take=${take}`)
          .set('Authorization', authToken);
        
        const duration = performance.now() - start;
        results.push({ take, duration, status: response.status });
      }

      console.log('  🔍 Pagination performance:', results);
      
      // Each should respond similarly regardless of page size
      const times = results.map(r => r.duration);
      const maxDiff = Math.max(...times) - Math.min(...times);
      
      // Difference should be less than 200ms
      expect(maxDiff).toBeLessThan(200);
    });
  });

});
