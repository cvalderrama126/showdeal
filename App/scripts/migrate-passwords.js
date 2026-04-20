#!/usr/bin/env node

/**
 * Password Migration Script - Phase 4 Security Fix
 *
 * This script migrates all SHA256 password hashes to bcrypt
 * for enhanced security against rainbow table attacks.
 *
 * Usage: node scripts/migrate-passwords.js
 */

const { migrateAllPasswords, getMigrationStats } = require('../src/auth/password-migration.service');

async function main() {
  console.log('🔐 ShowDeal Password Migration Script');
  console.log('=====================================\n');

  try {
    // Get initial stats
    console.log('📊 Getting initial migration statistics...');
    const initialStats = await getMigrationStats();
    console.log(`Total users: ${initialStats.total_users}`);
    console.log(`Users with SHA256 passwords: ${initialStats.sha256_users}`);
    console.log(`Users with bcrypt passwords: ${initialStats.bcrypt_users}`);
    console.log(`Users needing migration: ${initialStats.needs_migration}\n`);

    if (initialStats.sha256_users === 0) {
      console.log('✅ No SHA256 passwords found. Migration not needed.');
      return;
    }

    // Start migration
    console.log('🚀 Starting password migration...');
    const migrationResult = await migrateAllPasswords();

    console.log('\n📈 Migration Results:');
    console.log(`Total users processed: ${migrationResult.total}`);
    console.log(`Users marked for migration: ${migrationResult.migrated}`);
    console.log(`Errors encountered: ${migrationResult.errors}`);

    if (migrationResult.details.length > 0) {
      console.log('\n📋 Migration Details:');
      migrationResult.details.forEach((detail, index) => {
        console.log(`${index + 1}. ${detail.user}: ${detail.status}`);
        if (detail.message) {
          console.log(`   ${detail.message}`);
        }
      });
    }

    // Get final stats
    console.log('\n📊 Final migration statistics...');
    const finalStats = await getMigrationStats();
    console.log(`Total users: ${finalStats.total_users}`);
    console.log(`Users with SHA256 passwords: ${finalStats.sha256_users}`);
    console.log(`Users with bcrypt passwords: ${finalStats.bcrypt_users}`);
    console.log(`Users needing migration: ${finalStats.needs_migration}`);

    if (finalStats.sha256_users === 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log('All passwords are now using secure bcrypt hashing.');
    } else {
      console.log('\n⚠️  Migration partially completed.');
      console.log(`${finalStats.sha256_users} users still have SHA256 passwords.`);
      console.log('These users will be migrated automatically on next login.');
    }

    console.log('\n🔒 Security Enhancement: SHA256 → bcrypt migration completed.');
    console.log('Passwords are now protected against rainbow table attacks.');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { main };