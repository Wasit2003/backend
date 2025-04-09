const mongoose = require('mongoose');
const { User } = require('../models/user.model');
require('dotenv').config();

async function monitorRegistrations() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    console.log('Monitoring for new user registrations...');
    console.log('Press Ctrl+C to stop monitoring\n');

    // Watch for changes in the users collection
    const changeStream = User.watch([
      { $match: { operationType: { $in: ['insert', 'update'] } } }
    ]);

    changeStream.on('change', async (change) => {
      if (change.operationType === 'insert') {
        const newUser = change.fullDocument;
        console.log('\n=== New User Registration ===');
        console.log('Time:', new Date().toLocaleString());
        console.log('Name:', newUser.name);
        console.log('Phone:', newUser.phoneNumber);
        console.log('Password Hash:', newUser.password.substring(0, 20) + '...');
        console.log('Verified:', newUser.isVerified);
        console.log('===========================\n');
      }
    });

    // Keep the script running
    process.stdin.resume();

  } catch (error) {
    console.error('Error:', error);
  }
}

monitorRegistrations(); 