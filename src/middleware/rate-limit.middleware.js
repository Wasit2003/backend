const rateLimit = require('express-rate-limit');

// Common options for all rate limiters
const commonOptions = {
  // Use the client's IP address from the X-Forwarded-For header
  // when running behind a proxy (like Render)
  trustProxy: true,
  // Customize the key generation to handle proxy environments
  keyGenerator: (req) => {
    // Use X-Forwarded-For header if available (proxy environments like Render)
    const xForwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    
    // Log the IP detection for debugging
    console.log('🔍 Rate limit IP detection:', {
      ip: req.ip,
      xForwardedFor: xForwardedFor || 'not set',
      realIp: realIp || 'not set'
    });
    
    // Use the most specific identifier available
    return xForwardedFor || realIp || req.ip;
  },
  // Log when rate limit is hit
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    console.log(`⚠️ Rate limit exceeded for ${req.ip} on ${req.originalUrl}`);
    res.status(options.statusCode).json({
      success: false,
      message: options.message || 'Too many requests, please try again later.'
    });
  }
};

// General API rate limiter - more permissive
const apiLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Admin rate limiter - more permissive for admin operations
const adminLimiter = rateLimit({
  ...commonOptions,
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 requests per windowMs
  message: 'Too many admin requests from this IP, please try again after 5 minutes'
});

// More restrictive rate limiter for payment-related endpoints
const paymentLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per windowMs
  message: 'Too many payment requests from this IP, please try again after an hour'
});

// Token verification rate limiter
const tokenVerificationLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per windowMs
  message: 'Too many token verification requests from this IP, please try again after 15 minutes'
});

module.exports = {
  apiLimiter,
  adminLimiter,
  paymentLimiter,
  tokenVerificationLimiter
}; 