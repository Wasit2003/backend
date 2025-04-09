const mongoose = require('mongoose');
const { User } = require('../models/user.model');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetPassword() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find claude's account
    const user = await User.findOne({ name: 'claude' });
    if (!user) {
      console.log('User claude not found');
      return;
    }
    
    console.log(`Found user: ${user._id}, Phone: ${user.phoneNumber}`);
    console.log('Current password hash:', user.password);
    
    // Reset password to "123456"
    const newPassword = "123456";
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Test password comparison before saving
    const testCompare = await bcrypt.compare(newPassword, hashedPassword);
    console.log('\nTesting password comparison:');
    console.log('New password:', newPassword);
    console.log('New hash:', hashedPassword);
    console.log('Test comparison result:', testCompare ? 'MATCH' : 'NO MATCH');
    
    // Update password
    user.password = hashedPassword;
    await user.save();
    
    console.log('\nPassword reset successfully');
    console.log(`New password for ${user.name}: ${newPassword}`);
    
    // Verify the saved password
    const savedUser = await User.findOne({ name: 'claude' });
    const verifyCompare = await bcrypt.compare(newPassword, savedUser.password);
    console.log('\nVerifying saved password:');
    console.log('Saved hash:', savedUser.password);
    console.log('Verification result:', verifyCompare ? 'MATCH' : 'NO MATCH');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

resetPassword(); 