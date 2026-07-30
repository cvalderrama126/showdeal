const { prisma } = require('../db/prisma');
const { generateSecureToken, hashPassword } = require('../utils/crypto.utils');
const { mergeAdditional } = require('../utils/common');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Configuration
const TOKEN_EXPIRY_MINUTES = 15; // 15 minutes
const TOKEN_LENGTH = 32; // 32 bytes = 64 hex characters
const MAX_RESET_ATTEMPTS_PER_HOUR = 3;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('showdeal-password-reset-dummy', 10);

function normalizeIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function evaluatePasswordStrength(password, user = null) {
  const value = String(password || '');
  const checks = [];

  if (value.length < MIN_PASSWORD_LENGTH) {
    checks.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    checks.push(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long.`);
  }
  if (!/[a-z]/.test(value)) checks.push('Password must contain at least one lowercase letter.');
  if (!/[A-Z]/.test(value)) checks.push('Password must contain at least one uppercase letter.');
  if (!/\d/.test(value)) checks.push('Password must contain at least one number.');
  if (!/[^A-Za-z0-9]/.test(value)) checks.push('Password must contain at least one special character.');
  if (/\s/.test(value)) checks.push('Password must not contain spaces.');

  const lowered = value.toLowerCase();
  const weakFragments = ['password', '123456', 'qwerty', 'admin', 'showdeal'];
  if (weakFragments.some((w) => lowered.includes(w))) {
    checks.push('Password contains common weak patterns.');
  }

  if (/(.)\1{3,}/.test(value)) {
    checks.push('Password must not contain repeated characters (4+).');
  }

  if (user?.user_1 && lowered.includes(String(user.user_1).toLowerCase())) {
    checks.push('Password must not contain your username.');
  }

  return {
    ok: checks.length === 0,
    errors: checks,
  };
}

async function resolveUserIdFromIdentity(identity) {
  const rawIdentity = String(identity || '').trim();
  const normalizedEmailIdentity = rawIdentity.toLowerCase();
  if (!rawIdentity) return null;

  const user = await prisma.r_user.findFirst({
    where: {
      is_active: true,
      OR: [
        { user_1: { equals: rawIdentity, mode: 'insensitive' } },
        { additional: { path: ['email'], equals: normalizedEmailIdentity } },
      ],
    },
    select: { id_user: true },
  });

  return user?.id_user || null;
}

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
 * @param {bigint|string|number} userIdOrIdentity - User id or identity
 * @returns {Promise<boolean>} True if limit exceeded
 */
async function hasExceededResetLimit(userIdOrIdentity) {
  try {
    let userId = null;

    if (typeof userIdOrIdentity === 'bigint') {
      userId = userIdOrIdentity;
    } else if (typeof userIdOrIdentity === 'number' && Number.isInteger(userIdOrIdentity) && userIdOrIdentity > 0) {
      userId = BigInt(userIdOrIdentity);
    } else {
      const raw = String(userIdOrIdentity || '').trim();
      if (/^\d+$/.test(raw)) {
        userId = BigInt(raw);
      } else {
        userId = await resolveUserIdFromIdentity(raw);
      }
    }

    if (!userId) {
      return false;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentAttempts = await prisma.r_password_reset_token.count({
      where: {
        id_user: userId,
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
 * @param {string} identity - User email or username
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - Client user agent
 * @returns {Promise<{success: boolean, token?: string, deliveryEmail?: string, message: string}>}
 */
async function createPasswordResetToken(identity, ipAddress = null, userAgent = null) {
  try {
    const rawIdentity = String(identity || '').trim();
    const normalizedEmailIdentity = rawIdentity.toLowerCase();

    // Find user by login or registered notification email.
    const user = await prisma.r_user.findFirst({
      where: {
        is_active: true,
        OR: [
          { user_1: { equals: rawIdentity, mode: 'insensitive' } },
          { additional: { path: ['email'], equals: normalizedEmailIdentity } },
        ],
      },
      select: {
        id_user: true,
        user_1: true,
        additional: true,
        is_active: true
      }
    });

    if (!user) {
      // Don't reveal if email exists or not for security
      await performConstantTimeDummyWork(rawIdentity);
      return {
        success: true,
        message: 'If the email exists, a reset link has been sent.'
      };
    }

    const deliveryEmail = normalizeIdentity(user?.additional?.email);
    const hasDeliveryEmail = Boolean(deliveryEmail && deliveryEmail.includes('@'));

    // Check rate limiting
    if (await hasExceededResetLimit(user.id_user)) {
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
      deliveryEmail: hasDeliveryEmail ? deliveryEmail : null,
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

    const passwordPolicy = evaluatePasswordStrength(newPassword, user);
    if (!passwordPolicy.ok) {
      return {
        success: false,
        message: `Password policy violation: ${passwordPolicy.errors.join(' ')}`,
      };
    }

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
          additional: mergeAdditional(user.additional, {
            login_security: {
              failed_attempts: 0,
              locked_until: null,
              last_password_reset_at: new Date().toISOString(),
            },
          }),
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
  hasExceededResetLimit,
  evaluatePasswordStrength
};