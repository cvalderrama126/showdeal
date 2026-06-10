const { hasExceededResetLimit } = require('./password-reset.service');
const { incrementWithTTL } = require('../utils/redis.client');

const WINDOW_SECONDS = 60 * 60;
const MAX_ATTEMPTS = 3;

/**
 * Middleware to rate limit password reset requests
 * Limits to 3 attempts per hour per email
 */
async function passwordResetRateLimit(req, res, next) {
  try {
    const email = req.body.email;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }

    // Check database-level rate limiting
    const exceeded = await hasExceededResetLimit(email);
    if (exceeded) {
      return res.status(429).json({
        error: 'Too many password reset attempts. Please try again in an hour.'
      });
    }

    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const normalizedEmail = String(email).trim().toLowerCase();

    const ipAttempts = await incrementWithTTL(`pwd-reset:ip:${clientIP}`, WINDOW_SECONDS);
    if (typeof ipAttempts === 'number' && ipAttempts > MAX_ATTEMPTS) {
      return res.status(429).json({
        error: 'Too many password reset attempts from this IP. Please try again later.'
      });
    }

    const emailAttempts = await incrementWithTTL(`pwd-reset:email:${normalizedEmail}`, WINDOW_SECONDS);
    if (typeof emailAttempts === 'number' && emailAttempts > MAX_ATTEMPTS) {
      return res.status(429).json({
        error: 'Too many password reset attempts for this email. Please try again later.'
      });
    }

    next();

  } catch (error) {
    console.error('Error in password reset rate limiting:', error);
    return res.status(500).json({
      error: 'An error occurred while processing your request.'
    });
  }
}

module.exports = {
  passwordResetRateLimit
};