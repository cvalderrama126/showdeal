const express = require('express');
const { z } = require('zod');
const { passwordResetRateLimit } = require('./password-reset.middleware');
const {
  createPasswordResetToken,
  validatePasswordResetToken,
  resetPasswordWithToken
} = require('./password-reset.service');

const router = express.Router();

// Validation schemas
const requestResetSchema = z.object({
  email: z.string().email('Invalid email format')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number')
});

const validateTokenSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

/**
 * POST /auth/password-reset/request
 * Request a password reset token
 */
router.post('/request', passwordResetRateLimit, async (req, res) => {
  try {
    // Validate input
    const validation = requestResetSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.errors
      });
    }

    const { email } = validation.data;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    // Create reset token
    const result = await createPasswordResetToken(email, clientIP, userAgent);

    if (result.success) {
      // In a real application, you would send an email here
      // For now, we'll return the token for testing purposes
      // TODO: Implement email sending service

      res.json({
        message: result.message,
        // Remove this in production - only for testing
        ...(process.env.NODE_ENV === 'development' && result.token && {
          resetToken: result.token,
          note: 'This token is only shown in development mode for testing'
        })
      });
    } else {
      res.status(400).json({
        error: result.message
      });
    }

  } catch (error) {
    console.error('Error in password reset request:', error);
    res.status(500).json({
      error: 'An error occurred while processing your request.'
    });
  }
});

/**
 * POST /auth/password-reset/validate
 * Validate a password reset token
 */
router.post('/validate', async (req, res) => {
  try {
    // Validate input
    const validation = validateTokenSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.errors
      });
    }

    const { token } = validation.data;

    // Validate token
    const result = await validatePasswordResetToken(token);

    if (result.valid) {
      res.json({
        valid: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        valid: false,
        error: result.message
      });
    }

  } catch (error) {
    console.error('Error validating password reset token:', error);
    res.status(500).json({
      error: 'An error occurred while validating the token.'
    });
  }
});

/**
 * POST /auth/password-reset/reset
 * Reset password using a valid token
 */
router.post('/reset', async (req, res) => {
  try {
    // Validate input
    const validation = resetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.errors
      });
    }

    const { token, password } = validation.data;

    // Reset password
    const result = await resetPasswordWithToken(token, password);

    if (result.success) {
      res.json({
        message: result.message
      });
    } else {
      res.status(400).json({
        error: result.message
      });
    }

  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      error: 'An error occurred while resetting your password.'
    });
  }
});

module.exports = router;