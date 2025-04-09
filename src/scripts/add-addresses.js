/**
 * Script to add more public addresses to the database
 */

const mongoose = require('mongoose');
const { PublicAddress } = require('../models/public-address.model');
require('dotenv').config();

async function addPublicAddresses() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Generate some new test addresses
    const newAddresses = [
      '0xF001234567890123456789012345678901234567',
      '0xF112345678901234567890123456789012345678',
      '0xF223456789012345678901234567890123456789',
      '0xF334567890123456789012345678901234567890',
      '0xF445678901234567890123456789012345678901',
      '0xF556789012345678901234567890123456789012',
      '0xF667890123456789012345678901234567890123',
      '0xF778901234567890123456789012345678901234',
      '0xF889012345678901234567890123456789012345',
      '0xF990123456789012345678901234567890123456'
    ];
    
    console.log('Adding new addresses to the database...');
    
    for (const address of newAddresses) {
      // Check if the address already exists
      const exists = await PublicAddress.findOne({ address });
      
      if (exists) {
        console.log(`Address ${address} already exists, skipping`);
      } else {
        // Create the new address
        const newAddress = new PublicAddress({
          address,
          status: 'available'
        });
        
        await newAddress.save();
        console.log(`Added new address: ${address}`);
      }
    }
    
    // Verify the addresses in the database
    const allAddresses = await PublicAddress.find();
    const availableAddresses = allAddresses.filter(addr => addr.status === 'available');
    
    console.log(`\nTotal addresses: ${allAddresses.length}`);
    console.log(`Available addresses: ${availableAddresses.length}`);
    
  } catch (error) {
    console.error('Error adding addresses:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
addPublicAddresses(); 