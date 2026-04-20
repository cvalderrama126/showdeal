const { prisma } = require('../db/prisma');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Configuration
const BCRYPT_ROUNDS = 12; // Industry standard for password hashing

/**
 * Hash a password using SHA256 (legacy - for migration purposes only)
 * @param {string} password - Plain text password
 * @returns {string} SHA256 hash in hex format
 */
function sha256Hex(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

/**
 * Hash a password using bcrypt (secure)
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Bcrypt hash
 */
async function bcryptHash(password) {
  return await bcrypt.hash(String(password || ''), BCRYPT_ROUNDS);
}

/**
 * Verify if a stored password hash is using the legacy SHA256 format
 * @param {string} storedHash - The stored password hash
 * @returns {boolean} True if it's SHA256, false if bcrypt
 */
function isSha256Hash(storedHash) {
  const hash = String(storedHash || '');
  // SHA256 hashes are 64 character hex strings, bcrypt starts with $2a$, $2b$, or $2y$
  return /^[a-f0-9]{64}$/i.test(hash) && !/^\$2[aby]\$\d{2}\$/.test(hash);
}

/**
 * Verify if a stored password hash is using bcrypt
 * @param {string} storedHash - The stored password hash
 * @returns {boolean} True if it's bcrypt
 */
function isBcryptHash(storedHash) {
  return /^\$2[aby]\$\d{2}\$/.test(String(storedHash || ''));
}

/**
 * Migrate a single user's password from SHA256 to bcrypt
 * @param {bigint} userId - User ID
 * @param {string} plainPassword - Plain text password for re-hashing
 * @returns {Promise<{success: boolean, migrated: boolean, message: string}>}
 */
async function migrateUserPassword(userId, plainPassword) {
  try {
    // Get current user
    const user = await prisma.r_user.findUnique({
      where: { id_user: userId },
      select: {
        id_user: true,
        authentication: true,
        user_1: true
      }
    });

    if (!user) {
      return { success: false, migrated: false, message: 'User not found' };
    }

    const credentials = user.authentication;
    if (!credentials || !Array.isArray(credentials)) {
      return { success: false, migrated: false, message: 'No authentication data found' };
    }

    // Find the latest credential
    const latestCred = credentials
      .filter(cred => cred && typeof cred === 'object' && cred.password)
      .sort((a, b) => {
        const dateA = a.created ? new Date(a.created) : new Date(0);
        const dateB = b.created ? new Date(b.created) : new Date(0);
        return dateB.getTime() - dateA.getTime();
      })[0];

    if (!latestCred) {
      return { success: false, migrated: false, message: 'No password credential found' };
    }

    // Check if already migrated
    if (isBcryptHash(latestCred.password)) {
      return { success: true, migrated: false, message: 'Password already migrated to bcrypt' };
    }

    // Verify the provided password matches the stored hash
    let passwordMatches = false;
    if (isSha256Hash(latestCred.password)) {
      const inputHash = sha256Hex(plainPassword);
      passwordMatches = inputHash.toLowerCase() === latestCred.password.toLowerCase();
    } else if (isBcryptHash(latestCred.password)) {
      passwordMatches = await bcrypt.compare(plainPassword, latestCred.password);
    }

    if (!passwordMatches) {
      return { success: false, migrated: false, message: 'Provided password does not match stored hash' };
    }

    // Hash the password with bcrypt
    const newHash = await bcryptHash(plainPassword);

    // Update the credential
    const updatedCredentials = credentials.map(cred => {
      if (cred === latestCred) {
        return {
          ...cred,
          password: newHash,
          migrated_from_sha256: true,
          migrated_at: new Date().toISOString()
        };
      }
      return cred;
    });

    // Update user in database
    await prisma.r_user.update({
      where: { id_user: userId },
      data: {
        authentication: updatedCredentials,
        upd_at: new Date()
      }
    });

    console.log(`Password migrated for user ${user.user_1} (ID: ${userId})`);
    return { success: true, migrated: true, message: 'Password successfully migrated to bcrypt' };

  } catch (error) {
    console.error('Error migrating user password:', error);
    return { success: false, migrated: false, message: 'Migration failed: ' + error.message };
  }
}

/**
 * Migrate all users with SHA256 passwords to bcrypt
 * This function should be run during deployment/maintenance
 * @returns {Promise<{total: number, migrated: number, errors: number, details: Array}>}
 */
async function migrateAllPasswords() {
  console.log('Starting password migration from SHA256 to bcrypt...');

  try {
    // Get all users
    const users = await prisma.r_user.findMany({
      select: {
        id_user: true,
        user_1: true,
        authentication: true
      }
    });

    let total = 0;
    let migrated = 0;
    let errors = 0;
    const details = [];

    for (const user of users) {
      const credentials = user.authentication;
      if (!credentials || !Array.isArray(credentials)) continue;

      // Check if user has SHA256 password
      const hasSha256 = credentials.some(cred =>
        cred && typeof cred === 'object' && isSha256Hash(cred.password)
      );

      if (!hasSha256) continue;

      total++;

      // For migration without user interaction, we need to mark these users
      // as requiring password reset or manual migration
      try {
        // Update authentication to mark as needing migration
        const updatedCredentials = credentials.map(cred => {
          if (cred && typeof cred === 'object' && isSha256Hash(cred.password)) {
            return {
              ...cred,
              needs_migration: true,
              migration_required: true
            };
          }
          return cred;
        });

        await prisma.r_user.update({
          where: { id_user: user.id_user },
          data: {
            authentication: updatedCredentials,
            upd_at: new Date()
          }
        });

        migrated++;
        details.push({
          user: user.user_1,
          status: 'marked_for_migration',
          message: 'User marked for password migration (requires manual intervention)'
        });

      } catch (error) {
        errors++;
        details.push({
          user: user.user_1,
          status: 'error',
          message: error.message
        });
      }
    }

    console.log(`Password migration completed: ${migrated}/${total} users marked for migration, ${errors} errors`);
    return { total, migrated, errors, details };

  } catch (error) {
    console.error('Error in bulk password migration:', error);
    throw error;
  }
}

/**
 * Get migration statistics
 * @returns {Promise<{total_users: number, sha256_users: number, bcrypt_users: number, needs_migration: number}>}
 */
async function getMigrationStats() {
  try {
    const users = await prisma.r_user.findMany({
      select: {
        authentication: true
      }
    });

    let totalUsers = users.length;
    let sha256Users = 0;
    let bcryptUsers = 0;
    let needsMigration = 0;

    for (const user of users) {
      const credentials = user.authentication;
      if (!credentials || !Array.isArray(credentials)) continue;

      let hasSha256 = false;
      let hasBcrypt = false;
      let needsMigrationFlag = false;

      for (const cred of credentials) {
        if (!cred || typeof cred !== 'object') continue;

        if (isSha256Hash(cred.password)) hasSha256 = true;
        if (isBcryptHash(cred.password)) hasBcrypt = true;
        if (cred.needs_migration || cred.migration_required) needsMigrationFlag = true;
      }

      if (hasSha256) sha256Users++;
      if (hasBcrypt) bcryptUsers++;
      if (needsMigrationFlag) needsMigration++;
    }

    return {
      total_users: totalUsers,
      sha256_users: sha256Users,
      bcrypt_users: bcryptUsers,
      needs_migration: needsMigration
    };

  } catch (error) {
    console.error('Error getting migration stats:', error);
    throw error;
  }
}

module.exports = {
  sha256Hex,
  bcryptHash,
  isSha256Hash,
  isBcryptHash,
  migrateUserPassword,
  migrateAllPasswords,
  getMigrationStats
};