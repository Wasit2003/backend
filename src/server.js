// Add at the very beginning of the file
console.log('\n\n');
console.log('='.repeat(80));
console.log('🔄🔄🔄 SERVER STARTING - ' + new Date().toISOString() + ' 🔄🔄🔄');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('='.repeat(80));
console.log('\n\n');

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const router = require('./routes/index.js');
const errorHandler = require('./middleware/error.middleware');
const { apiLimiter, adminLimiter, paymentLimiter, tokenVerificationLimiter } = require('./middleware/rate-limit.middleware');
const logger = require('./services/logger.service');
const requestLogger = require('./middleware/request-logger.middleware');
const securityMiddleware = require('./middleware/security.middleware');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Add near the beginning of the file after imports
console.log('🚀 DEBUG: Starting server...');

// Security headers
app.use(securityMiddleware);

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001', 'https://admin-7yyl.vercel.app', 'http://172.20.10.3:3000', 'http://10.0.2.2:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Apply appropriate rate limiters to different routes
app.use('/api', apiLimiter);
// Use a more permissive rate limiter for admin routes
app.use('/admin', adminLimiter);
app.use('/api/admin', adminLimiter);
// Special rate limiter for payment-related endpoints
app.use('/api/user/payment-address', paymentLimiter);
app.use('/api/auth/assign-address', paymentLimiter);
app.use('/api/auth/me', tokenVerificationLimiter);
app.use('/api/auth/verify-token', tokenVerificationLimiter);
app.use('/api/auth/refresh-token', tokenVerificationLimiter);

// Add before registering routes
console.log('🚀 DEBUG: Registering API routes...');

// Routes
app.use('/api', router);
app.use('/admin', adminRoutes);
app.use('/api/admin', adminRoutes);

// Print registered route patterns
console.log('🔑 DEBUG: Admin routes registered at:');
console.log('  - /admin/*');
console.log('  - /api/admin/*');
console.log('🌐 DEBUG: Main API routes registered at: /api/*');

// Route debugging - log all incoming requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔍 ${req.method} ${req.originalUrl}`);
  next();
});

// Add catch-all for unmatched routes
app.use('*', (req, res) => {
  console.log(`❌ 404: Route not found: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Error handling
app.use(errorHandler);

// Connect to MongoDB
console.log('🔌 DEBUG: Connecting to MongoDB: ' + (process.env.MONGODB_URI || '').substring(0, 20) + '...');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => {
    logger.error('MongoDB connection error:', err);
    console.error('❌ CRITICAL: Failed to connect to MongoDB:', err.message);
    // In production, we may want to exit and let the process manager restart the app
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Exiting due to MongoDB connection failure');
      process.exit(1);
    }
  });

const PORT = process.env.PORT || 3000;
// Listen on all network interfaces (0.0.0.0) instead of just localhost
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT} and listening on all interfaces`);
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📝 DEBUG: Server environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Print all registered routes (simplified version)
  console.log('🛣️ DEBUG: Registered routes:');
  const printRoutes = (prefix, routes) => {
    if (!routes.stack) return;
    routes.stack.forEach((middleware) => {
      if (middleware.route) {
        // This is a route middleware
        const methods = Object.keys(middleware.route.methods).join(', ');
        console.log(`🛣️ ${methods.toUpperCase()} ${prefix}${middleware.route.path}`);
      } else if (middleware.name === 'router') {
        // This is a router middleware
        printRoutes(prefix + middleware.regexp.toString().replace('\\/?(?=\\/|$)', '').replace(/^\\\//, '/'), middleware.handle);
      }
    });
  };
  
  // Try to print routes if possible
  try {
    printRoutes('', app._router);
  } catch (err) {
    console.log('⚠️ DEBUG: Could not print all routes:', err.message);
  }
}); 