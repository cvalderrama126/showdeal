#!/usr/bin/env node

/**
 * Production Health Check Script
 * Validates that all critical systems are operational
 */

const http = require('http');
const https = require('https');
const { Client } = require('pg');

const CHECKS = {
  API_HEALTH: 'API Server Health',
  DATABASE: 'Database Connectivity',
  REDIS: 'Redis Cache',
  SSL: 'SSL/TLS Certificate',
  PERFORMANCE: 'Performance Benchmarks',
  SECURITY: 'Security Headers',
};

const results = {};
let passCount = 0;
let failCount = 0;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. API Health Check
async function checkApiHealth() {
  return new Promise((resolve) => {
    const protocol = process.env.API_URL?.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      results[CHECKS.API_HEALTH] = { status: 'FAIL', error: 'Timeout (>5s)' };
      failCount++;
      resolve();
    }, 5000);

    const req = protocol.get(
      `${process.env.API_URL || 'http://localhost:3001'}/health`,
      (res) => {
        clearTimeout(timeout);
        let data = '';

        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.ok && json.status === 'ready') {
              results[CHECKS.API_HEALTH] = { status: 'PASS', version: json.version };
              passCount++;
            } else {
              results[CHECKS.API_HEALTH] = { status: 'FAIL', response: json };
              failCount++;
            }
          } catch (e) {
            results[CHECKS.API_HEALTH] = { status: 'FAIL', error: 'Invalid JSON response' };
            failCount++;
          }
          resolve();
        });
      }
    );

    req.on('error', (err) => {
      clearTimeout(timeout);
      results[CHECKS.API_HEALTH] = { status: 'FAIL', error: err.message };
      failCount++;
      resolve();
    });
  });
}

// 2. Database Check
async function checkDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const result = await client.query('SELECT version(), NOW()');
    
    if (result.rows.length > 0) {
      results[CHECKS.DATABASE] = {
        status: 'PASS',
        version: result.rows[0].version.split(',')[0],
      };
      passCount++;
    } else {
      results[CHECKS.DATABASE] = { status: 'FAIL', error: 'No response from query' };
      failCount++;
    }

    await client.end();
  } catch (error) {
    results[CHECKS.DATABASE] = { status: 'FAIL', error: error.message };
    failCount++;
  }
}

// 3. Redis Check
async function checkRedis() {
  const redis = require('redis');
  const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: { connectTimeout: 5000 },
  });

  try {
    await client.connect();
    const pong = await client.ping();

    if (pong === 'PONG') {
      results[CHECKS.REDIS] = { status: 'PASS', ping: pong };
      passCount++;
    } else {
      results[CHECKS.REDIS] = { status: 'FAIL', error: 'Unexpected PING response' };
      failCount++;
    }

    await client.disconnect();
  } catch (error) {
    results[CHECKS.REDIS] = { status: 'FAIL', error: error.message };
    failCount++;
  }
}

// 4. SSL Check
async function checkSSL() {
  if (!process.env.API_URL?.startsWith('https')) {
    results[CHECKS.SSL] = { status: 'SKIP', reason: 'Not HTTPS' };
    return;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      results[CHECKS.SSL] = { status: 'FAIL', error: 'Timeout' };
      failCount++;
      resolve();
    }, 5000);

    const req = https.get(process.env.API_URL, { rejectUnauthorized: false }, (res) => {
      clearTimeout(timeout);
      const cert = res.socket.getPeerCertificate();

      if (cert && cert.valid_from && cert.valid_to) {
        const expiryDate = new Date(cert.valid_to);
        const daysUntilExpiry = Math.floor((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) {
          results[CHECKS.SSL] = { status: 'FAIL', error: 'Certificate expired' };
          failCount++;
        } else if (daysUntilExpiry < 30) {
          results[CHECKS.SSL] = { status: 'WARN', days_until_expiry: daysUntilExpiry };
          passCount++;
        } else {
          results[CHECKS.SSL] = { status: 'PASS', days_until_expiry: daysUntilExpiry };
          passCount++;
        }
      } else {
        results[CHECKS.SSL] = { status: 'FAIL', error: 'No certificate' };
        failCount++;
      }

      resolve();
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      results[CHECKS.SSL] = { status: 'FAIL', error: err.message };
      failCount++;
      resolve();
    });
  });
}

// 5. Performance Check
async function checkPerformance() {
  const apiUrl = process.env.API_URL || 'http://localhost:3001';
  const protocol = apiUrl.startsWith('https') ? https : http;
  const iterations = 5;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();

    await new Promise((resolve) => {
      const req = protocol.get(`${apiUrl}/health`, () => {
        times.push(Date.now() - start);
        resolve();
      });

      req.on('error', () => {
        times.push(Infinity);
        resolve();
      });

      setTimeout(() => resolve(), 2000);
    });
  }

  const validTimes = times.filter(t => t !== Infinity);
  const avgTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
  const maxTime = Math.max(...validTimes);

  if (avgTime < 500 && maxTime < 1000) {
    results[CHECKS.PERFORMANCE] = {
      status: 'PASS',
      avg_ms: avgTime.toFixed(2),
      max_ms: maxTime,
    };
    passCount++;
  } else {
    results[CHECKS.PERFORMANCE] = {
      status: 'WARN',
      avg_ms: avgTime.toFixed(2),
      max_ms: maxTime,
      target_ms: 500,
    };
    passCount++;
  }
}

// 6. Security Headers Check
async function checkSecurityHeaders() {
  const apiUrl = process.env.API_URL || 'http://localhost:3001';
  const protocol = apiUrl.startsWith('https') ? https : http;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      results[CHECKS.SECURITY] = { status: 'FAIL', error: 'Timeout' };
      failCount++;
      resolve();
    }, 5000);

    const req = protocol.get(apiUrl, (res) => {
      clearTimeout(timeout);

      const requiredHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
      ];

      const missingHeaders = requiredHeaders.filter(h => !res.headers[h]);

      if (missingHeaders.length === 0) {
        results[CHECKS.SECURITY] = {
          status: 'PASS',
          headers_present: requiredHeaders.length,
        };
        passCount++;
      } else {
        results[CHECKS.SECURITY] = {
          status: 'WARN',
          missing_headers: missingHeaders,
        };
        passCount++;
      }

      resolve();
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      results[CHECKS.SECURITY] = { status: 'FAIL', error: err.message };
      failCount++;
      resolve();
    });
  });
}

// Main execution
async function main() {
  console.log('\n🏥 ShowDeal Production Health Check\n');
  console.log(`API URL: ${process.env.API_URL || 'http://localhost:3001'}`);
  console.log(`Database: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[1] || 'showdeal_prod'}`);
  console.log('');

  // Run checks in sequence
  await checkApiHealth();
  console.log(`✓ ${CHECKS.API_HEALTH}`);

  await checkDatabase();
  console.log(`✓ ${CHECKS.DATABASE}`);

  await checkRedis();
  console.log(`✓ ${CHECKS.REDIS}`);

  await checkSSL();
  console.log(`✓ ${CHECKS.SSL}`);

  await checkPerformance();
  console.log(`✓ ${CHECKS.PERFORMANCE}`);

  await checkSecurityHeaders();
  console.log(`✓ ${CHECKS.SECURITY}`);

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('HEALTH CHECK RESULTS');
  console.log('='.repeat(60) + '\n');

  Object.entries(results).forEach(([check, result]) => {
    const statusIcon =
      result.status === 'PASS' ? '✅' :
      result.status === 'WARN' ? '⚠️ ' :
      result.status === 'SKIP' ? '⊘ ' : '❌';

    console.log(`${statusIcon} ${check}`);
    console.log(`   Status: ${result.status}`);

    Object.entries(result).forEach(([key, value]) => {
      if (key !== 'status') {
        console.log(`   ${key}: ${JSON.stringify(value)}`);
      }
    });
    console.log('');
  });

  console.log('='.repeat(60));
  console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
  console.log('='.repeat(60) + '\n');

  // Exit code
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Health check script error:', err);
  process.exit(1);
});
