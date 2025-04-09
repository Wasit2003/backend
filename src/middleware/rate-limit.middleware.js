const rateLimit = require('express-rate-limit');

// Rate limiter for verification requests
const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // limit each IP to 5 verification requests per window
  message: {
    success: false,
    message: 'Too many verification attempts. Please try again later.'
  }
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // increased from 100 to 200 requests per window
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Admin API rate limiter - more permissive
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // higher limit for admin routes
  message: {
    success: false,
    message: 'Too many admin requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Token verification limiter - very permissive for transaction flows
const tokenVerificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 200, // Increased to 200 requests per minute
  message: {
    success: false,
    message: 'Too many token verification requests, please try again in a minute.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.ip + '_' + req.user?.id
});

// Payment-related endpoints need higher limits to handle retries from mobile app
const paymentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 150, // Increased to 150 requests per minute
  message: {
    success: false,
    message: 'Too many payment requests, please try again in a minute.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Add sliding window for better burst handling
  skipSuccessfulRequests: true, // Don't count successful requests against the limit
  keyGenerator: (req) => req.ip + '_' + req.user?.id // Separate limits per user
});

module.exports = {
  verificationLimiter,
  apiLimiter,
  adminLimiter,
  paymentLimiter,
  tokenVerificationLimiter
}; 