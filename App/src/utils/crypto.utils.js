/**
 * Secure Cryptography Utilities - Phase 4 Security Enhancement
 *
 * Provides secure cryptographic functions and prevents use of weak algorithms.
 */

const crypto = require('crypto');

/**
 * Secure random token generation
 * @param {number} length - Length in bytes (default: 32)
 * @returns {string} Hex-encoded random token
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate cryptographically secure random string (URL-safe)
 * @param {number} length - Length in bytes (default: 32)
 * @returns {string} URL-safe base64-encoded random string
 */
function generateSecureRandomString(length = 32) {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Secure password hashing using bcrypt
 * @param {string} password - Plain text password
 * @param {number} rounds - bcrypt rounds (default: 12)
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(password, rounds = 12) {
  const bcrypt = require('bcryptjs');
  return await bcrypt.hash(String(password || ''), rounds);
}

/**
 * Verify password against bcrypt hash
 * @param {string} password - Plain text password
 * @param {string} hash - bcrypt hash
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, hash) {
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(String(password || ''), hash);
}

/**
 * File integrity hashing (SHA-256 is acceptable for file integrity)
 * @param {Buffer|string} data - Data to hash
 * @returns {string} SHA-256 hash in hex
 */
function hashFileIntegrity(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate secure HMAC for data integrity
 * @param {string} data - Data to sign
 * @param {string} key - Secret key
 * @returns {string} HMAC-SHA256 in hex
 */
function generateHMAC(data, key) {
  return crypto.createHmac('sha256', key).update(String(data)).digest('hex');
}

/**
 * Verify HMAC for data integrity
 * @param {string} data - Original data
 * @param {string} key - Secret key
 * @param {string} hmac - HMAC to verify
 * @returns {boolean} True if HMAC matches
 */
function verifyHMAC(data, key, hmac) {
  const expected = generateHMAC(data, key);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(hmac, 'hex')
  );
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @param {string} key - Encryption key (32 bytes)
 * @returns {string} Encrypted data in format: iv:authTag:encrypted
 */
function encryptAES(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-gcm', key);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt data encrypted with encryptAES
 * @param {string} encryptedData - Data in format: iv:authTag:encrypted
 * @param {string} key - Decryption key (32 bytes)
 * @returns {string} Decrypted plain text
 */
function decryptAES(encryptedData, key) {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipher('aes-256-gcm', key);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a secure key for AES-256 encryption
 * @returns {string} 32-byte key in hex
 */
function generateAESKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(a, 'utf8'),
    Buffer.from(b, 'utf8')
  );
}

/**
 * Validate that a cryptographic key meets minimum requirements
 * @param {string} key - Key to validate
 * @param {number} minLength - Minimum length in bytes (default: 32)
 * @returns {boolean} True if key is valid
 */
function validateCryptoKey(key, minLength = 32) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // Check length (assuming hex encoding)
  if (Buffer.from(key, 'hex').length < minLength) {
    return false;
  }

  // Check for weak patterns
  const weakPatterns = [
    /^0+$/,           // All zeros
    /^f+$/i,          // All F's
    /^123/,           // Sequential
    /password/i,      // Contains password
    /secret/i,        // Contains secret
    /key/i,           // Contains key
  ];

  for (const pattern of weakPatterns) {
    if (pattern.test(key)) {
      return false;
    }
  }

  return true;
}

/**
 * Legacy SHA256 hash (only for migration purposes - DO NOT USE for new code)
 * @param {string} data - Data to hash
 * @returns {string} SHA256 hash in hex
 * @deprecated Use hashPassword() for passwords, hashFileIntegrity() for files
 */
function legacySha256(data) {
  console.warn('WARNING: Using legacy SHA256 hashing. Migrate to secure alternatives.');
  return crypto.createHash('sha256').update(String(data)).digest('hex');
}

module.exports = {
  generateSecureToken,
  generateSecureRandomString,
  hashPassword,
  verifyPassword,
  hashFileIntegrity,
  generateHMAC,
  verifyHMAC,
  encryptAES,
  decryptAES,
  generateAESKey,
  secureCompare,
  validateCryptoKey,
  legacySha256
};