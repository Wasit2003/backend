require('dotenv').config();

const config = {
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wallet_dev',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your_secure_jwt_secret_here',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  sms: {
    provider: process.env.SMS_PROVIDER || 'console', // default to console for development
    apiKey: process.env.SMS_API_KEY || '',
    from: process.env.SMS_FROM_NUMBER || '',
    enabled: process.env.SMS_ENABLED === 'true' || false,
  }
};

// Validate required environment variables
const validateConfig = () => {
  const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      console.warn(`Warning: ${key} is not set, using default value`);
    }
  }
};

validateConfig();

module.exports = config;