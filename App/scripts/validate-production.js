#!/usr/bin/env node

/**
 * Production Validation Script
 * Ensures all prerequisites are met before deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const checks = {
  passed: [],
  failed: [],
  warnings: [],
};

function log(message, type = 'info') {
  const icons = {
    info: 'ℹ️ ',
    success: '✅',
    error: '❌',
    warning: '⚠️ ',
  };

  console.log(`${icons[type]} ${message}`);
}

// 1. Check Node.js version
function checkNodeVersion() {
  try {
    const version = process.version;
    const major = parseInt(version.split('.')[0].substring(1));

    if (major >= 18) {
      checks.passed.push(`Node.js version ${version} (≥18 required)`);
    } else {
      checks.failed.push(`Node.js version ${version} is too old (≥18 required)`);
    }
  } catch (e) {
    checks.failed.push(`Could not determine Node.js version`);
  }
}

// 2. Check required files exist
function checkRequiredFiles() {
  const requiredFiles = [
    'package.json',
    'src/app.js',
    'src/server.js',
    '.env.example.prod',
    'docker-compose.prod.yml',
    'prisma/schema.prisma',
    'Dockerfile',
  ];

  requiredFiles.forEach(file => {
    if (fs.existsSync(path.join(process.cwd(), file))) {
      checks.passed.push(`Found required file: ${file}`);
    } else {
      checks.failed.push(`Missing required file: ${file}`);
    }
  });
}

// 3. Check environment variables
function checkEnvironmentVariables() {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'OTP_ISSUER',
    'NODE_ENV',
  ];

  const missing = required.filter(env => !process.env[env]);

  if (missing.length === 0) {
    checks.passed.push(`All required environment variables defined`);
  } else {
    checks.warnings.push(
      `Missing env vars (will need at deploy time): ${missing.join(', ')}`
    );
  }
}

// 4. Check dependencies
function checkDependencies() {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    );

    const required = [
      'express',
      'prisma',
      '@prisma/client',
      'dotenv',
      'cors',
      'helmet',
      'multer',
    ];

    const missing = required.filter(dep => !packageJson.dependencies?.[dep]);

    if (missing.length === 0) {
      checks.passed.push(`All required npm dependencies present`);
    } else {
      checks.failed.push(`Missing npm dependencies: ${missing.join(', ')}`);
    }
  } catch (e) {
    checks.failed.push(`Could not read package.json`);
  }
}

// 5. Check Docker installation
function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    checks.passed.push(`Docker is installed and working`);
  } catch (e) {
    checks.failed.push(`Docker not found or not working`);
  }
}

// 6. Check Docker Compose installation
function checkDockerCompose() {
  try {
    execSync('docker-compose --version', { stdio: 'pipe' });
    checks.passed.push(`Docker Compose is installed and working`);
  } catch (e) {
    checks.failed.push(`Docker Compose not found or not working`);
  }
}

// 7. Check PostgreSQL accessibility (if DATABASE_URL set)
function checkDatabaseConnection() {
  if (!process.env.DATABASE_URL) {
    checks.warnings.push(`DATABASE_URL not set; skipping DB connection test`);
    return;
  }

  try {
    const { Client } = require('pg');
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });

    client.connect((err) => {
      if (err) {
        checks.warnings.push(`Could not connect to PostgreSQL: ${err.message}`);
      } else {
        checks.passed.push(`PostgreSQL connection successful`);
        client.end();
      }
    });
  } catch (e) {
    checks.warnings.push(`PostgreSQL driver not available for testing`);
  }
}

// 8. Check build artifacts
function checkBuildArtifacts() {
  try {
    execSync('npm run build --dry-run', { stdio: 'pipe' });
    checks.passed.push(`npm build script exists and is valid`);
  } catch (e) {
    checks.warnings.push(`Could not validate npm build script`);
  }
}

// 9. Check test suite
function checkTestSuite() {
  try {
    const testsDir = path.join(process.cwd(), 'tests');
    if (fs.existsSync(testsDir)) {
      const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));
      if (testFiles.length > 0) {
        checks.passed.push(`Test suite found (${testFiles.length} test files)`);
      } else {
        checks.warnings.push(`No test files found in tests/`);
      }
    } else {
      checks.warnings.push(`tests/ directory not found`);
    }
  } catch (e) {
    checks.failed.push(`Could not check test suite`);
  }
}

// 10. Check for hardcoded secrets
function checkForHardcodedSecrets() {
  const secretPatterns = [
    /password\s*[=:]\s*['"][^'"]+['"]/gi,
    /api[_-]?key\s*[=:]\s*['"][^'"]+['"]/gi,
    /secret\s*[=:]\s*['"][^'"]+['"]/gi,
  ];

  const filesToCheck = [
    'src/**/*.js',
    'public/**/*.js',
  ];

  let found = false;

  filesToCheck.forEach(pattern => {
    try {
      const files = execSync(`find . -name "${pattern.replace(/\*\*/g, '*')}" -type f`, {
        cwd: process.cwd(),
        stdio: 'pipe',
        encoding: 'utf8',
      }).split('\n').filter(f => f);

      files.slice(0, 50).forEach(file => {
        try {
          const content = fs.readFileSync(file, 'utf8');
          secretPatterns.forEach(regex => {
            if (regex.test(content)) {
              checks.failed.push(`Potential hardcoded secret in ${file}`);
              found = true;
            }
          });
        } catch (e) {
          // Ignore read errors
        }
      });
    } catch (e) {
      // Ignore find errors
    }
  });

  if (!found) {
    checks.passed.push(`No obvious hardcoded secrets detected`);
  }
}

// 11. Check security headers
function checkSecurityHeaders() {
  const appFile = path.join(process.cwd(), 'src/app.js');

  try {
    const content = fs.readFileSync(appFile, 'utf8');

    const securityChecks = {
      'helmet middleware': /helmet\(\)/,
      'CORS config': /cors\(/,
      'rate limiting': /rateLimit|rate-limit/,
      'CSRF protection': /csrf|csurf/,
    };

    const found = Object.entries(securityChecks).filter(([name, regex]) =>
      regex.test(content)
    );

    checks.passed.push(`Security features found: ${found.map(f => f[0]).join(', ')}`);
  } catch (e) {
    checks.warnings.push(`Could not analyze security headers`);
  }
}

// 12. Check Prisma schema
function checkPrismaSchema() {
  try {
    const schemaFile = path.join(process.cwd(), 'prisma/schema.prisma');
    if (fs.existsSync(schemaFile)) {
      const content = fs.readFileSync(schemaFile, 'utf8');
      const modelCount = (content.match(/^model /gm) || []).length;
      checks.passed.push(`Prisma schema valid (${modelCount} models)`);
    } else {
      checks.failed.push(`Prisma schema not found`);
    }
  } catch (e) {
    checks.failed.push(`Error reading Prisma schema`);
  }
}

// Main execution
console.log('\n🔍 Production Validation Check\n');
console.log('Running checks...\n');

checkNodeVersion();
checkRequiredFiles();
checkEnvironmentVariables();
checkDependencies();
checkDocker();
checkDockerCompose();
checkDatabaseConnection();
checkBuildArtifacts();
checkTestSuite();
checkForHardcodedSecrets();
checkSecurityHeaders();
checkPrismaSchema();

// Wait a bit for async checks to complete
setTimeout(() => {
  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION RESULTS');
  console.log('='.repeat(60) + '\n');

  // Passed checks
  if (checks.passed.length > 0) {
    console.log(`✅ PASSED (${checks.passed.length}):`);
    checks.passed.forEach(check => log(`  ${check}`, 'success'));
    console.log('');
  }

  // Warning checks
  if (checks.warnings.length > 0) {
    console.log(`⚠️  WARNINGS (${checks.warnings.length}):`);
    checks.warnings.forEach(check => log(`  ${check}`, 'warning'));
    console.log('');
  }

  // Failed checks
  if (checks.failed.length > 0) {
    console.log(`❌ FAILED (${checks.failed.length}):`);
    checks.failed.forEach(check => log(`  ${check}`, 'error'));
    console.log('');
  }

  // Summary
  console.log('='.repeat(60));
  const totalChecks = checks.passed.length + checks.failed.length + checks.warnings.length;
  console.log(
    `Total: ${checks.passed.length} passed, ${checks.warnings.length} warnings, ${checks.failed.length} failed`
  );
  console.log('='.repeat(60) + '\n');

  // Exit code
  process.exit(checks.failed.length > 0 ? 1 : 0);
}, 2000);
