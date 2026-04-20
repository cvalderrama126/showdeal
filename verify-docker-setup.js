#!/usr/bin/env node

/**
 * ShowDeal Docker Solution - Verification Script
 * Verifica que todos los archivos necesarios estén presentes
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

// Archivos esperados
const requiredFiles = {
  'Docker Core': [
    'App/Dockerfile',
    'App/docker-compose.yml',
    'App/.dockerignore',
    'App/healthcheck.js',
    'App/.env.docker'
  ],
  'Configuration': [
    'App/docker/init-db.sql'
  ],
  'Documentation': [
    'DOCKER.md',
    'DOCKER_QUICK_REFERENCE.md',
    'GITHUB_ACTIONS_SETUP.md',
    'DEPLOYMENT_GUIDE.md',
    'DOCKER_SOLUTION_SUMMARY.md'
  ],
  'CI/CD Workflows': [
    '.github/workflows/build-test.yml',
    '.github/workflows/deploy-staging.yml',
    '.github/workflows/deploy-production.yml'
  ],
  'Utilities': [
    'docker-dev.ps1'
  ]
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath) {
  return fs.existsSync(path.join(projectRoot, filePath));
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(path.join(projectRoot, filePath));
    return `${(stats.size / 1024).toFixed(1)}KB`;
  } catch (e) {
    return '0KB';
  }
}

// Main verification
log('\n╔════════════════════════════════════════════════════════════════╗', 'cyan');
log('║     ShowDeal Docker Solution - Verification Report            ║', 'cyan');
log('╚════════════════════════════════════════════════════════════════╝\n', 'cyan');

let totalFiles = 0;
let foundFiles = 0;

for (const category in requiredFiles) {
  log(`\n${category}:`, 'bold');
  
  requiredFiles[category].forEach(file => {
    totalFiles++;
    const exists = checkFile(file);
    const size = exists ? getFileSize(file) : 'N/A';
    
    if (exists) {
      foundFiles++;
      log(`  ✅ ${file} (${size})`);
    } else {
      log(`  ❌ ${file} - NOT FOUND`, 'red');
    }
  });
}

// Summary
log(`\n${'─'.repeat(64)}`, 'cyan');
log(`Result: ${foundFiles}/${totalFiles} files found`, foundFiles === totalFiles ? 'green' : 'red');

if (foundFiles === totalFiles) {
  log('\n✅ All files are in place! Ready to go.', 'green');
  
  log('\n📋 Next steps:', 'cyan');
  log('  1. Copy .env.docker to .env:');
  log('     cp App/.env.docker App/.env\n');
  log('  2. Start the stack:');
  log('     docker-compose -f App/docker-compose.yml up -d\n');
  log('  3. See DOCKER_SOLUTION_SUMMARY.md for complete guide\n');
  
  process.exit(0);
} else {
  log('\n❌ Some files are missing!', 'red');
  log('  Please check the files listed above.', 'red');
  process.exit(1);
}
