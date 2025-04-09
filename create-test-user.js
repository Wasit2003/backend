const mongoose = require('mongoose');
const User = require('./src/models/user.model');
require('dotenv').config();

async function createTestUser() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wallet_dev';
    console.log('Connecting to MongoDB at:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    // Check if test user already exists
    const existingUser = await User.findById('507f1f77bcf86cd799439011');
    if (existingUser) {
      console.log('Test user already exists:');
      console.log({
        id: existingUser._id.toString(),
        phone: existingUser.phoneNumber,
        isVerified: existingUser.isVerified
      });
      process.exit(0);
    }

    // Try to create the user with a specific ObjectId
    // This matches the ID used in your mobile app's JWT token
    const newUser = new User({
      _id: '507f1f77bcf86cd799439011',
      phoneNumber: '1234567890',
      isVerified: true,
      name: 'Test User'
    });
    
    await newUser.save();
    console.log('Test user created successfully with ID:', newUser._id.toString());
    console.log('This ID matches the one in your mobile app JWT token');
    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error.message);
    if (error.name === 'BSONError' || error.name === 'CastError') {
      console.error('Invalid MongoDB ObjectId format. Please check the ID format.');
    }
    process.exit(1);
  }
}

createTestUser(); 