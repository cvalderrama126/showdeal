const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { passwordResetRateLimit } = require('./password-reset.middleware');
const {
  createPasswordResetToken,
  validatePasswordResetToken,
  resetPasswordWithToken,
  evaluatePasswordStrength
} = require('./password-reset.service');
const { isEmailConfigured, sendPasswordResetEmail } = require('./password-reset-email.service');

const router = express.Router();

const resetTokenActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many password reset attempts. Please try again later.'
  }
});

// Validation schemas
const requestResetSchema = z.object({
  email: z.string().trim().min(1, 'Email or username is required')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(1, 'Password is required')
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
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3001';

    // Create reset token
    const result = await createPasswordResetToken(email, clientIP, userAgent);

    if (result.success) {
      // In development, allow reset flow without SMTP by returning a local reset link.
      if (!isEmailConfigured()) {
        if (process.env.NODE_ENV !== 'production') {
          if (result.token) {
            const resetUrl = `${appBaseUrl.replace(/\/$/, '')}/reset-password.html?token=${encodeURIComponent(result.token)}`;
            return res.json({
              message: 'SMTP is not configured. Use the development reset link to continue.',
              devResetUrl: resetUrl,
            });
          }

          return res.json({
            message: 'SMTP is not configured and no reset link could be generated for this identity. Try with your username or verify your registered recovery email.',
          });
        }

        return res.status(503).json({
          error: 'PASSWORD_RESET_EMAIL_NOT_CONFIGURED',
          message: 'Password reset email service is not configured.'
        });
      }

      if (!result.deliveryEmail) {
        if (process.env.NODE_ENV !== 'production' && process.env.SMTP_USE_STREAM === 'true' && result.token) {
          const resetUrl = `${appBaseUrl.replace(/\/$/, '')}/reset-password.html?token=${encodeURIComponent(result.token)}`;
          return res.json({
            message: 'Generic local mail mode is active. Use this reset link to continue.',
            devResetUrl: resetUrl,
          });
        }

        return res.status(400).json({
          error: 'USER_EMAIL_NOT_CONFIGURED',
          message: 'The user does not have a registered recovery email.',
        });
      }

      if (result.token) {
        const mailResult = await sendPasswordResetEmail({ toEmail: result.deliveryEmail, token: result.token });
        if (!mailResult?.sent) {
          return res.status(502).json({
            error: 'PASSWORD_RESET_EMAIL_SEND_FAILED',
            message: mailResult?.message || 'Unable to send password reset email.'
          });
        }
      }

      res.json({
        message: result.message
      });
    } else {
      res.status(result.status || 400).json({
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
router.post('/validate', resetTokenActionLimiter, async (req, res) => {
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
router.post('/reset', resetTokenActionLimiter, async (req, res) => {
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

    const policyResult = evaluatePasswordStrength(password);
    if (!policyResult.ok) {
      return res.status(400).json({
        error: 'PASSWORD_POLICY_VIOLATION',
        details: policyResult.errors,
      });
    }

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