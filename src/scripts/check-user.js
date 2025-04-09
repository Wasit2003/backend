/**
 * Script to check if a user exists and show their details
 */

const mongoose = require('mongoose');
const { User } = require('../models/user.model');
const { PublicAddress } = require('../models/public-address.model');
require('dotenv').config();

async function checkUser() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the user
    const userId = '67b3853a51cb29da453ece41';
    const user = await User.findById(userId);
    console.log(`User exists: ${!!user}`);
    
    if (user) {
      console.log('User details:');
      console.log(JSON.stringify({
        _id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        publicAddress: user.publicAddress,
        isVerified: user.isVerified,
      }, null, 2));
      
      // Check if we can find any public addresses assigned to this user
      const address = await PublicAddress.findOne({ userId: user._id });
      console.log(`Public address assigned in PublicAddress collection: ${!!address}`);
      
      if (address) {
        console.log('Address details:');
        console.log(JSON.stringify({
          _id: address._id,
          address: address.address,
          status: address.status,
          userId: address.userId
        }, null, 2));
      }
    }
    
    // Get all users
    const allUsers = await User.find({});
    console.log(`\nTotal users in database: ${allUsers.length}`);
    
    for (const u of allUsers) {
      console.log(`User ${u._id}: ${u.name || 'unnamed'} (${u.phoneNumber}), publicAddress: ${JSON.stringify(u.publicAddress)}`);
    }
    
    // Get available addresses
    const availableAddresses = await PublicAddress.find({ status: 'available' });
    console.log(`\nAvailable addresses: ${availableAddresses.length}`);
    
    if (availableAddresses.length > 0) {
      console.log('Sample available address:', availableAddresses[0].address);
    }
    
  } catch (error) {
    console.error('Error checking user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the check
checkUser(); 