const { prisma } = require('../db/prisma');
const { generateSecureToken, hashPassword } = require('../utils/crypto.utils');
const bcrypt = require('bcryptjs');

// Configuration
const TOKEN_EXPIRY_MINUTES = 15; // 15 minutes
const TOKEN_LENGTH = 32; // 32 bytes = 64 hex characters
const MAX_RESET_ATTEMPTS_PER_HOUR = 3;

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
async function hashResetToken(token) {
  return await hashPassword(token, 12);
}

/**
 * Verify a reset token against its hash
 * @param {string} token - Plain token
 * @param {string} hash - Hashed token
 * @returns {Promise<boolean>} Verification result
 */
async function verifyResetToken(token, hash) {
  return await bcrypt.compare(token, hash);
}

/**
 * Check if user has exceeded reset attempt limit
 * @param {string} email - User email
 * @returns {Promise<boolean>} True if limit exceeded
 */
async function hasExceededResetLimit(email) {
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
    const tokenHash = await hashResetToken(token);
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
    console.error('Error creating password reset token:', error);
    return {
      success: false,
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
    const activeTokens = await prisma.r_password_reset_token.findMany({
      where: {
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

    if (!activeTokens.length) {
      return {
        valid: false,
        message: 'Invalid or expired reset token.'
      };
    }

    let matchedToken = null;
    for (const candidate of activeTokens) {
      // bcrypt hashes are salted; compare against each active candidate
      // eslint-disable-next-line no-await-in-loop
      const isValid = await verifyResetToken(token, candidate.token_hash);
      if (isValid && !matchedToken) {
        matchedToken = candidate;
      }
    }

    if (!matchedToken) {
      return {
        valid: false,
        message: 'Invalid reset token.'
      };
    }

    return {
      valid: true,
      user: matchedToken.r_user,
      resetTokenId: matchedToken.id_token,
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

    // Hash new password
    const hashedPassword = await hashPassword(newPassword, 12);

    // Update user password
    await prisma.r_user.update({
      where: {
        id_user: user.id_user
      },
      data: {
        authentication: {
          ...user.authentication,
          password: hashedPassword
        },
        upd_at: new Date()
      }
    });

    const usedAt = new Date();

    // Mark token as used by primary key to guarantee single-use semantics
    await prisma.r_password_reset_token.update({
      where: {
        id_token: validation.resetTokenId
      },
      data: {
        used_at: usedAt,
        is_active: false
      }
    });

    // Revoke any other active tokens for the same user
    await prisma.r_password_reset_token.updateMany({
      where: {
        id_user: user.id_user,
        is_active: true,
        used_at: null
      },
      data: {
        used_at: usedAt,
        is_active: false
      }
    });

    // Clean up expired tokens
    await cleanupExpiredTokens();

    return {
      success: true,
      message: 'Password has been reset successfully.'
    };

  } catch (error) {
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
