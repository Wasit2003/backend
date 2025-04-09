const mongoose = require('mongoose');
const User = require('./src/models/user.model');
require('dotenv').config();

async function verifyUser() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet_dev';
    console.log('Connecting to MongoDB at:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    // Find the test user
    const user = await User.findById('507f1f77bcf86cd799439011');
    
    if (user) {
      console.log('Test user found:');
      console.log({
        id: user._id.toString(),
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
        name: user.name
      });
      console.log('This user ID matches the one in your mobile app JWT token');
    } else {
      console.log('Test user not found. Please run create-test-user.js again.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error verifying test user:', error.message);
    process.exit(1);
  }
}

verifyUser(); 