/**
 * This script ensures that the Settings document exists in the database.
 * Run this after deployment to make sure the fees page will work properly.
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function ensureSettings() {
  console.log('==========================================');
  console.log('SETTINGS INITIALIZATION SCRIPT');
  console.log('==========================================');

  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get database connection state
    const dbState = mongoose.connection.readyState;
    console.log('MongoDB connection state:', dbState);
    
    // Get or create the Settings model
    let Settings;
    try {
      Settings = mongoose.model('Settings');
      console.log('✅ Settings model already registered');
    } catch (error) {
      console.log('Registering Settings model...');
      
      // Create the schema
      const settingsSchema = new mongoose.Schema({
        networkFeePercentage: {
          type: Number,
          required: true,
          min: 0,
          max: 100,
          default: 1.0
        },
        exchangeRate: {
          type: Number,
          required: true,
          default: 1.0
        },
        updatedAt: {
          type: Date,
          default: Date.now
        },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Admin',
          required: false
        }
      });
      
      // Register model
      Settings = mongoose.model('Settings', settingsSchema);
      console.log('✅ Settings model registered');
    }
    
    // Check if settings document exists
    const existingSettings = await Settings.findOne();
    
    if (existingSettings) {
      console.log('✅ Settings document already exists:', existingSettings);
      
      // Update any fields that might be missing
      let updated = false;
      
      if (existingSettings.networkFeePercentage === undefined) {
        existingSettings.networkFeePercentage = 1.0;
        updated = true;
      }
      
      if (existingSettings.exchangeRate === undefined) {
        existingSettings.exchangeRate = 1.0;
        updated = true;
      }
      
      if (updated) {
        existingSettings.updatedAt = new Date();
        await existingSettings.save();
        console.log('✅ Updated existing settings with missing fields:', existingSettings);
      }
    } else {
      // Create default settings
      const newSettings = new Settings({
        networkFeePercentage: 1.0,
        exchangeRate: 1.0,
        updatedAt: new Date()
      });
      
      await newSettings.save();
      console.log('✅ Created new settings document:', newSettings);
    }
    
    console.log('✅ Settings initialization complete!');
    
  } catch (error) {
    console.error('❌ Error during settings initialization:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    // Close the MongoDB connection
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    } catch (err) {
      console.error('❌ Error closing MongoDB connection:', err);
    }
    
    console.log('==========================================');
    console.log('SCRIPT FINISHED');
    console.log('==========================================');
  }
}

// Run the function
ensureSettings(); 