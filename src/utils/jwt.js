const jwt = require('jsonwebtoken');
const config = require('../config/config');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = config.jwt.expiresIn || '7d';
const REFRESH_TOKEN_EXPIRES_IN = '30d'; // Refresh tokens last longer

// Add a logging function for withdrawal debugging
const logWithdrawal = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [WITHDRAW] [JWT] ${message} ${JSON.stringify(data)}`;
  
  console.log(logMessage);
  
  // Write to log file
  const logDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'withdraw_logs.txt');
  fs.appendFileSync(logFile, logMessage + '\n');
};

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      phoneNumber: user.phoneNumber,
      isVerified: user.isVerified
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    {
      id: user._id,
      type: 'refresh'
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

function verifyToken(token) {
  try {
    // Log basic token info without exposing the full token
    const tokenInfo = {
      length: token.length,
      prefix: token.substring(0, 10) + '...',
      secretKeyLength: JWT_SECRET.length,
      expiresIn: JWT_EXPIRES_IN
    };
    
    logWithdrawal('Verifying JWT token', tokenInfo);
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Log successful verification
    logWithdrawal('JWT verification successful', {
      userId: decoded.id,
      phoneNumber: decoded.phoneNumber,
      issuedAt: new Date(decoded.iat * 1000).toISOString(),
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });
    
    return decoded;
  } catch (error) {
    // Log verification failure
    logWithdrawal('JWT verification failed', {
      errorName: error.name,
      message: error.message,
      expiredAt: error.expiredAt ? new Date(error.expiredAt).toISOString() : null
    });
    
    return null;
  }
}

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken
}; 