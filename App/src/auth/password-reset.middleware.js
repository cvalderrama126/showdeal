const { hasExceededResetLimit } = require('./password-reset.service');

// In-memory store for rate limiting (in production, use Redis)
const resetAttempts = new Map();

/**
 * Clean up old entries from the rate limiting store
 */
function cleanupOldEntries() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  for (const [key, data] of resetAttempts.entries()) {
    if (data.timestamp < oneHourAgo) {
      resetAttempts.delete(key);
    }
  }
}

/**
 * Middleware to rate limit password reset requests
 * Limits to 3 attempts per hour per email
 */
async function passwordResetRateLimit(req, res, next) {
  try {
    const email = req.body.email;
    const clientIP = req.ip || req.connection.remoteAddress;

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

    // Clean up old entries periodically
    cleanupOldEntries();

    // Additional IP-based rate limiting
    const ipKey = `ip_${clientIP}`;
    const emailKey = `email_${email.toLowerCase()}`;

    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const maxAttempts = 3;

    // Check IP rate limit
    const ipData = resetAttempts.get(ipKey);
    if (ipData && ipData.attempts >= maxAttempts && (now - ipData.timestamp) < windowMs) {
      return res.status(429).json({
        error: 'Too many password reset attempts from this IP. Please try again later.'
      });
    }

    // Check email rate limit
    const emailData = resetAttempts.get(emailKey);
    if (emailData && emailData.attempts >= maxAttempts && (now - emailData.timestamp) < windowMs) {
      return res.status(429).json({
        error: 'Too many password reset attempts for this email. Please try again later.'
      });
    }

    // Update attempt counters
    const updateAttempts = (key) => {
      const data = resetAttempts.get(key);
      if (!data || (now - data.timestamp) >= windowMs) {
        resetAttempts.set(key, { attempts: 1, timestamp: now });
      } else {
        data.attempts += 1;
        data.timestamp = now;
      }
    };

    updateAttempts(ipKey);
    updateAttempts(emailKey);

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