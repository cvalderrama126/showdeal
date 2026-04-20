#!/usr/bin/env node

/**
 * Health Check Script para ShowDeal Container
 * Verifica que la aplicación y sus dependencias estén disponibles
 * Se ejecuta desde el HEALTHCHECK del Dockerfile
 */

const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';
const HEALTH_ENDPOINT = '/health';

/**
 * Realiza una llamada HTTP GET al endpoint /health
 */
function checkHealth() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: HEALTH_ENDPOINT,
      method: 'GET',
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      // Cualquier código 2xx o 3xx es exitoso
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const health = JSON.parse(data);
            if (health.status === 'ok' || health.healthy === true) {
              resolve({ healthy: true, statusCode: res.statusCode });
            } else {
              reject(new Error(`Health status not ok: ${JSON.stringify(health)}`));
            }
          } catch (e) {
            // Si no es JSON válido pero es 2xx, consideramos que está bien
            resolve({ healthy: true, statusCode: res.statusCode });
          }
        });
      } else {
        reject(new Error(`Health check failed with status ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timeout'));
    });

    req.end();
  });
}

/**
 * Función principal
 */
async function main() {
  try {
    const result = await checkHealth();
    console.log(`✓ Health check passed (${result.statusCode})`);
    process.exit(0);
  } catch (error) {
    console.error(`✗ Health check failed: ${error.message}`);
    process.exit(1);
  }
}

main();
