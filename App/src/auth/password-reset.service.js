const { prisma } = require('../db/prisma');
const { generateSecureToken, hashPassword } = require('../utils/crypto.utils');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Configuration
const TOKEN_EXPIRY_MINUTES = 15; // 15 minutes
const TOKEN_LENGTH = 32; // 32 bytes = 64 hex characters
const MAX_RESET_ATTEMPTS_PER_HOUR = 3;
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('showdeal-password-reset-dummy', 10);

/**
 * Generate a cryptographically secure reset token
 * @returns {string} Hex token
 */
function generateResetToken() {
  return generateSecureToken(TOKEN_LENGTH);
}

/**
 * Hash the reset token for storage
 * @param {string} token - Plain token
 * @returns {Promise<string>} Hashed token
 */
function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

/**
 * Verify a reset token against its hash
 * @param {string} token - Plain token
 * @param {string} hash - Hashed token
 * @returns {Promise<boolean>} Verification result
 */
async function verifyResetToken(token, hash) {
  const value = String(hash || '');

  if (/^\$2[aby]\$\d{2}\$/.test(value)) {
    // Backward compatibility for previously generated bcrypt token hashes.
    return await bcrypt.compare(String(token || ''), value);
  }

  const digest = hashResetToken(token);
  return digest.length === value.length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(value));
}

async function performConstantTimeDummyWork(token) {
  await bcrypt.compare(String(token || ''), DUMMY_BCRYPT_HASH);
}

function toIsoDateYmd(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildUpdatedAuthentication(authentication, hashedPassword) {
  const authArray = Array.isArray(authentication) ? [...authentication] : [];

  if (authArray.length === 0) {
    return [{
      password: hashedPassword,
      algorithm: 'bcrypt',
      created: toIsoDateYmd(),
      expired: null,
    }];
  }

  let targetIndex = -1;
  let bestTime = -1;

  for (let i = 0; i < authArray.length; i += 1) {
    const cred = authArray[i];
    if (!cred || typeof cred !== 'object' || !cred.password) continue;

    const ts = Date.parse(String(cred.created || ''));
    const score = Number.isFinite(ts) ? ts : i;
    if (score >= bestTime) {
      bestTime = score;
      targetIndex = i;
    }
  }

  if (targetIndex === -1) {
    authArray.push({
      password: hashedPassword,
      algorithm: 'bcrypt',
      created: toIsoDateYmd(),
      expired: null,
    });
    return authArray;
  }

  authArray[targetIndex] = {
    ...authArray[targetIndex],
    password: hashedPassword,
    algorithm: 'bcrypt',
    updated_at: new Date().toISOString(),
  };

  return authArray;
}

/**
 * Check if user has exceeded reset attempt limit
 * @param {string} email - User email
 * @returns {Promise<boolean>} True if limit exceeded
 */
async function hasExceededResetLimit(email) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentAttempts = await prisma.r_password_reset_token.count({
      where: {
        r_user: {
          user_1: email
        },
        ins_at: {
          gte: oneHourAgo
        }
      }
    });

    return recentAttempts >= MAX_RESET_ATTEMPTS_PER_HOUR;
  } catch (error) {
    if (error?.code === 'P2021') {
      // Missing table should not crash auth flows.
      return false;
    }
    throw error;
  }
}

/**
 * Create a password reset token for a user
 * @param {string} email - User email
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - Client user agent
 * @returns {Promise<{success: boolean, token?: string, message: string}>}
 */
async function createPasswordResetToken(email, ipAddress = null, userAgent = null) {
  try {
    // Find user by email
    const user = await prisma.r_user.findFirst({
      where: {
        user_1: email,
        is_active: true
      }
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      await performConstantTimeDummyWork(email);
      return {
        success: true,
        message: 'If the email exists, a reset link has been sent.'
      };
    }

    // Check rate limiting
    if (await hasExceededResetLimit(email)) {
      return {
        success: false,
        message: 'Too many reset attempts. Please try again later.'
      };
    }

    // Generate token
    const token = generateResetToken();
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    // Save token to database
    await prisma.r_password_reset_token.create({
      data: {
        id_user: user.id_user,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent
      }
    });

    // Clean up expired tokens
    await cleanupExpiredTokens();

    return {
      success: true,
      token: token,
      message: 'Password reset token created successfully.'
    };

  } catch (error) {
    if (error?.code === 'P2021') {
      return {
        success: false,
        status: 503,
        message: 'Password reset is temporarily unavailable.'
      };
    }

    console.error('Error creating password reset token:', error);
    return {
      success: false,
      status: 500,
      message: 'An error occurred while processing your request.'
    };
  }
}

/**
 * Validate a password reset token
 * @param {string} token - Reset token
 * @returns {Promise<{valid: boolean, user?: object, message: string}>}
 */
async function validatePasswordResetToken(token) {
  try {
    const tokenHash = hashResetToken(token);

    // Deterministic lookup for current tokens.
    let resetToken = await prisma.r_password_reset_token.findFirst({
      where: {
        token_hash: tokenHash,
        is_active: true,
        used_at: null,
        expires_at: {
          gt: new Date()
        }
      },
      include: {
        r_user: true
      }
    });

    // Backward compatibility for legacy bcrypt token hashes.
    if (!resetToken) {
      const legacyCandidates = await prisma.r_password_reset_token.findMany({
        where: {
          is_active: true,
          used_at: null,
          expires_at: {
            gt: new Date()
          }
        },
        include: {
          r_user: true
        },
        orderBy: {
          ins_at: 'desc'
        },
        take: 50
      });

      for (const candidate of legacyCandidates) {
        // eslint-disable-next-line no-await-in-loop
        const matched = await verifyResetToken(token, candidate.token_hash);
        if (matched) {
          resetToken = candidate;
          break;
        }
      }
    }

    if (!resetToken) {
      await performConstantTimeDummyWork(token);
      return {
        valid: false,
        message: 'Invalid or expired reset token.'
      };
    }

    return {
      valid: true,
      tokenId: resetToken.id_token,
      user: resetToken.r_user,
      message: 'Token is valid.'
    };

  } catch (error) {
    console.error('Error validating password reset token:', error);
    return {
      valid: false,
      message: 'An error occurred while validating the token.'
    };
  }
}

/**
 * Reset user password using a valid token
 * @param {string} token - Reset token
 * @param {string} newPassword - New password
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function resetPasswordWithToken(token, newPassword) {
  try {
    // Validate token first
    const validation = await validatePasswordResetToken(token);

    if (!validation.valid) {
      return {
        success: false,
        message: validation.message
      };
    }

    const user = validation.user;
    const tokenId = validation.tokenId;

    // Hash new password
    const hashedPassword = await hashPassword(newPassword, 12);

    // Consume token and update password atomically to prevent race conditions.
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.r_password_reset_token.updateMany({
        where: {
          id_token: tokenId,
          is_active: true,
          used_at: null,
          expires_at: {
            gt: new Date()
          }
        },
        data: {
          used_at: new Date(),
          is_active: false,
          upd_at: new Date()
        }
      });

      if (consumed.count !== 1) {
        throw new Error('RESET_TOKEN_ALREADY_USED_OR_EXPIRED');
      }

      await tx.r_user.update({
        where: {
          id_user: user.id_user
        },
        data: {
          authentication: buildUpdatedAuthentication(user.authentication, hashedPassword),
          upd_at: new Date()
        }
      });
    });

    // Clean up expired tokens
    await cleanupExpiredTokens();

    return {
      success: true,
      message: 'Password has been reset successfully.'
    };

  } catch (error) {
    if (error?.message === 'RESET_TOKEN_ALREADY_USED_OR_EXPIRED') {
      return {
        success: false,
        message: 'Invalid or expired reset token.'
      };
    }

    console.error('Error resetting password:', error);
    return {
      success: false,
      message: 'An error occurred while resetting your password.'
    };
  }
}

/**
 * Clean up expired password reset tokens
 * @returns {Promise<void>}
 */
async function cleanupExpiredTokens() {
  try {
    await prisma.r_password_reset_token.updateMany({
      where: {
        expires_at: {
          lt: new Date()
        },
        is_active: true
      },
      data: {
        is_active: false
      }
    });
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
  }
}

module.exports = {
  createPasswordResetToken,
  validatePasswordResetToken,
  resetPasswordWithToken,
  cleanupExpiredTokens,
  hasExceededResetLimit
};