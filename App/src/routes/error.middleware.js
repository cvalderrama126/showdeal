/**
 * Error Sanitization Middleware - Phase 4 Security Fix
 *
 * Prevents information disclosure through error messages
 * and provides consistent error responses.
 */

/**
 * Sanitize error messages to prevent information disclosure
 * @param {Error} error - The original error
 * @returns {Object} Sanitized error object
 */
function sanitizeError(error) {
  const sanitized = {
    ok: false,
    error: 'An error occurred while processing your request.',
    timestamp: new Date().toISOString()
  };

  // Handle specific error types with appropriate messages
  if (error.name === 'ValidationError' || error.message?.includes('validation')) {
    sanitized.error = 'Invalid input data provided.';
    sanitized.code = 'VALIDATION_ERROR';
  } else if (error.name === 'UnauthorizedError' || error.message?.includes('Unauthorized')) {
    sanitized.error = 'Authentication required.';
    sanitized.code = 'UNAUTHORIZED';
  } else if (error.name === 'ForbiddenError' || error.message?.includes('Forbidden')) {
    sanitized.error = 'Access denied.';
    sanitized.code = 'FORBIDDEN';
  } else if (error.code === 'P2002') {
    // Prisma unique constraint violation
    sanitized.error = 'A record with this information already exists.';
    sanitized.code = 'DUPLICATE_RECORD';
  } else if (error.code === 'P2025') {
    // Prisma record not found
    sanitized.error = 'The requested record was not found.';
    sanitized.code = 'NOT_FOUND';
  } else if (error.code === 'P1001' || error.code === 'P1017') {
    // Database connection issues
    sanitized.error = 'Database temporarily unavailable.';
    sanitized.code = 'DATABASE_ERROR';
  } else if (error.message?.includes('JWT') || error.message?.includes('token')) {
    sanitized.error = 'Invalid or expired authentication token.';
    sanitized.code = 'INVALID_TOKEN';
  } else if (error.message?.includes('bcrypt') || error.message?.includes('password')) {
    sanitized.error = 'Authentication failed.';
    sanitized.code = 'AUTHENTICATION_ERROR';
  }

  // Add error code if it's a known safe code
  if (error.code && typeof error.code === 'string' && error.code.length < 20) {
    sanitized.code = error.code;
  }

  // In development, include more details for debugging
  if (process.env.NODE_ENV !== 'production') {
    sanitized.originalError = error.message;
    sanitized.stack = error.stack;
  }

  return sanitized;
}

/**
 * Enhanced error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  // Log the full error for server-side debugging
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Determine status code
  let status = err.status || err.statusCode || 500;

  // Map known Prisma errors to correct HTTP statuses
  if (err.code === 'P2002') status = 409;
  if (err.code === 'P2025') status = 404;
  if (err.code === 'P1001' || err.code === 'P1017') status = 503;

  // Sanitize status codes to prevent unusual responses
  if (status < 400 || status > 599) {
    status = 500;
  }

  // Special handling for certain status codes
  if (status === 500) {
    // For 500 errors, always return generic message
    const sanitized = sanitizeError(err);
    return res.status(500).json(sanitized);
  }

  // For other errors, try to provide appropriate sanitized response
  const sanitized = sanitizeError(err);

  // Override error message for client errors if it's too revealing
  if (status >= 400 && status < 500) {
    const originalMessage = err.message || '';
    // Check if message contains sensitive information
    // Safe uppercase codes (e.g. FILE_REQUIRED, INVALID_ID_ASSET) are always safe to expose
    const isSafeCode = /^[A-Z][A-Z0-9_]{2,}$/.test(originalMessage);
    if (isSafeCode) {
      sanitized.error = originalMessage;
    } else if (originalMessage.includes('SQL') ||
        originalMessage.includes('database') ||
        originalMessage.includes('prisma') ||
        originalMessage.includes('password') ||
        originalMessage.includes('hash') ||
        originalMessage.includes('token') ||
        originalMessage.includes('secret') ||
        originalMessage.includes('key') ||
        originalMessage.includes('path')) {
      // Use sanitized message
    } else {
      // Keep original message if it seems safe
      sanitized.error = originalMessage;
    }
  }

  res.status(status).json(sanitized);
}

/**
 * 404 Not Found handler
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    ok: false,
    error: 'The requested resource was not found.',
    path: req.path,
    timestamp: new Date().toISOString()
  });
}

/**
 * Wrap async route handlers to catch unhandled promise rejections
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  sanitizeError,
  asyncHandler
};