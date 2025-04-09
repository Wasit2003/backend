const jwt = require('jsonwebtoken');
const { User } = require('../models/user.model');
const { Admin } = require('../models/admin.model');
const fs = require('fs');
const path = require('path');

// Add a logging function for withdrawal debugging
const logWithdrawal = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [WITHDRAW] [AUTH] ${message} ${JSON.stringify(data)}`;
  
  console.log(logMessage);
  
  // Write to log file
  const logDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'withdraw_logs.txt');
  fs.appendFileSync(logFile, logMessage + '\n');
};

const authMiddleware = async (req, res, next) => {
  try {
    // Check for authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided',
        code: 'NO_TOKEN'
      });
    }

    // Extract token
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    
    // Prevent test tokens from causing loops
    if (token.startsWith('test_auth_')) {
      return res.status(401).json({
        success: false,
        message: 'Test tokens are not allowed in production',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.error('[AuthMiddleware] JWT verification failed:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Check if this is an admin token
    if (decoded.role === 'ADMIN') {
      const admin = await Admin.findById(decoded.userId);
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Admin not found',
          code: 'ADMIN_NOT_FOUND'
        });
      }
      
      // Store admin separately from user
      req.admin = admin;
      req.isAdmin = true;
      return next();
    }
    
    // Handle user token
    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Attach user to request (only for non-admin routes)
    req.user = user;
    req.isAdmin = false;
    return next();
  } catch (error) {
    console.error('[AuthMiddleware] Unexpected error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
      code: 'AUTH_ERROR'
    });
  }
};

module.exports = authMiddleware; 