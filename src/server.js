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

// Configure express to trust proxies (required for Render and other PaaS providers)
app.set('trust proxy', 1);

// Add near the beginning of the file after imports
console.log('🚀 DEBUG: Starting server...');

// Security headers
app.use(securityMiddleware);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      console.log('🌐 CORS: Allowing request with no origin');
      return callback(null, true);
    }
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'https://admin-7yyl.vercel.app',
      'https://admin-seven-psi.vercel.app'
    ];
    
    // Check if the origin is allowed
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      console.log(`🌐 CORS: Allowing request from ${origin}`);
      return callback(null, true);
    }
    
    // Log denied origins
    console.log(`🌐 CORS: Denying request from ${origin}`);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

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

// Add a root route handler
app.get('/', (req, res) => {
  console.log('📝 Root path requested');
  res.status(200).json({
    success: true,
    message: 'Wasit Backend API is running',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    documentation: 'Use /api endpoints to access API resources'
  });
});

// Print registered route patterns
console.log('🔑 DEBUG: Admin routes registered at:');
console.log('  - /admin/*');
console.log('  - /api/admin/*');
console.log('🌐 DEBUG: Main API routes registered at: /api/*');

// Route debugging - log all incoming requests
app.use((req, res, next) => {
  console.log('📥 INCOMING REQUEST:');
  console.log(`  URL: ${req.method} ${req.originalUrl}`);
  console.log(`  Origin: ${req.headers.origin || 'Unknown'}`);
  console.log(`  User-Agent: ${req.headers['user-agent'] || 'Unknown'}`);
  console.log(`  Authorization: ${req.headers.authorization ? 'Present' : 'Not present'}`);
  console.log(`  Content-Type: ${req.headers['content-type'] || 'Not specified'}`);
  
  // Store original response methods to add debugging
  const originalSend = res.send;
  const originalJson = res.json;
  const originalStatus = res.status;
  
  // Override status to log response codes
  res.status = function(code) {
    console.log(`📤 RESPONSE STATUS: ${code}`);
    return originalStatus.apply(this, arguments);
  };
  
  // Override json to log response data
  res.json = function(body) {
    console.log(`📤 RESPONSE JSON: ${JSON.stringify(body).substring(0, 200)}${JSON.stringify(body).length > 200 ? '...' : ''}`);
    return originalJson.apply(this, arguments);
  };
  
  // Override send to log response data
  res.send = function(body) {
    if (typeof body === 'object') {
      console.log(`📤 RESPONSE BODY: ${JSON.stringify(body).substring(0, 200)}${JSON.stringify(body).length > 200 ? '...' : ''}`);
    } else if (typeof body === 'string') {
      console.log(`📤 RESPONSE BODY: ${body.substring(0, 200)}${body.length > 200 ? '...' : ''}`);
    }
    return originalSend.apply(this, arguments);
  };
  
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