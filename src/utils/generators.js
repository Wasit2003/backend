const crypto = require('crypto');

function generateVerificationCode(length = 6) {
  // Generate a random 6-digit number
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateRequestId() {
  // Generate a unique request ID
  return crypto.randomBytes(16).toString('hex');
}

module.exports = {
  generateVerificationCode,
  generateRequestId
}; 