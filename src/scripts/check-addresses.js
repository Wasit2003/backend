/**
 * Script to check all public addresses in the database
 */

const mongoose = require('mongoose');
const { PublicAddress } = require('../models/public-address.model');
const { User } = require('../models/user.model');
require('dotenv').config();

async function checkAddresses() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all public addresses
    const addresses = await PublicAddress.find();
    console.log(`Total public addresses: ${addresses.length}`);
    
    // Count addresses by status
    const availableCount = addresses.filter(addr => addr.status === 'available').length;
    const assignedCount = addresses.filter(addr => addr.status === 'assigned').length;
    const otherCount = addresses.filter(addr => addr.status !== 'available' && addr.status !== 'assigned').length;
    
    console.log(`Available addresses: ${availableCount}`);
    console.log(`Assigned addresses: ${assignedCount}`);
    console.log(`Other status addresses: ${otherCount}`);
    
    // Check for addresses showing as available but with userId
    const availableWithUserIds = addresses.filter(addr => addr.status === 'available' && addr.userId);
    console.log(`\nAvailable addresses with userIds (inconsistent): ${availableWithUserIds.length}`);
    
    if (availableWithUserIds.length > 0) {
      console.log('Fixing inconsistent addresses...');
      for (const addr of availableWithUserIds) {
        console.log(`Fixing address ${addr._id} (${addr.address})`);
        // Check if the user exists
        const user = await User.findById(addr.userId);
        if (user) {
          console.log(`User ${user._id} exists, updating address status to 'assigned'`);
          addr.status = 'assigned';
          await addr.save();
        } else {
          console.log(`User ${addr.userId} does not exist, removing userId from address`);
          addr.userId = undefined;
          await addr.save();
        }
      }
    }
    
    // Check for addresses showing as assigned but without userId
    const assignedWithoutUserIds = addresses.filter(addr => addr.status === 'assigned' && !addr.userId);
    console.log(`\nAssigned addresses without userIds (inconsistent): ${assignedWithoutUserIds.length}`);
    
    if (assignedWithoutUserIds.length > 0) {
      console.log('Fixing inconsistent addresses...');
      for (const addr of assignedWithoutUserIds) {
        console.log(`Fixing address ${addr._id} (${addr.address})`);
        addr.status = 'available';
        await addr.save();
      }
    }
    
    // Create some test addresses if none exist or if all are assigned
    if (addresses.length === 0 || availableCount === 0) {
      console.log('\nCreating test addresses...');
      const testAddresses = [
        '0xA123456789012345678901234567890123456789',
        '0xB123456789012345678901234567890123456789',
        '0xC123456789012345678901234567890123456789',
        '0xD123456789012345678901234567890123456789',
        '0xE123456789012345678901234567890123456789'
      ];
      
      for (const address of testAddresses) {
        // Check if address already exists
        const exists = await PublicAddress.findOne({ address });
        if (!exists) {
          const newAddress = new PublicAddress({
            address,
            status: 'available'
          });
          await newAddress.save();
          console.log(`Created address: ${address}`);
        }
      }
    }
    
    // Final count after fixes
    const updatedAddresses = await PublicAddress.find();
    const updatedAvailableCount = updatedAddresses.filter(addr => addr.status === 'available').length;
    console.log(`\nAfter fixes: Total addresses: ${updatedAddresses.length}, Available: ${updatedAvailableCount}`);
    
  } catch (error) {
    console.error('Error checking addresses:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the check
checkAddresses(); 