const mongoose = require('mongoose');
require('dotenv').config();

async function initializeSettings() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ ERROR: MONGODB_URI environment variable is not defined!');
      process.exit(1);
    }
    
    // Hide connection string details when logging
    const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//****:****@');
    console.log('Using connection string:', sanitizedUri);
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Get the Settings model
    const Settings = require('../src/models/settings.model');
    console.log('📋 Loaded Settings model');
    
    // Check if settings exist
    const existingSettings = await mongoose.model('Settings').findOne();
    
    if (existingSettings) {
      console.log('ℹ️ Settings document already exists:', {
        networkFeePercentage: existingSettings.networkFeePercentage,
        exchangeRate: existingSettings.exchangeRate,
        updatedAt: existingSettings.updatedAt
      });
      
      // Update to ensure fields are properly set
      existingSettings.networkFeePercentage = existingSettings.networkFeePercentage || 1.0;
      existingSettings.exchangeRate = existingSettings.exchangeRate || 1.0;
      existingSettings.updatedAt = Date.now();
      
      await existingSettings.save();
      console.log('✅ Updated existing settings');
    } else {
      // Create default settings
      const newSettings = await Settings.create({
        networkFeePercentage: 1.0,
        exchangeRate: 1.0,
        updatedAt: Date.now()
      });
      
      console.log('✅ Created new settings:', {
        networkFeePercentage: newSettings.networkFeePercentage,
        exchangeRate: newSettings.exchangeRate,
        updatedAt: newSettings.updatedAt
      });
    }
    
    console.log('✅ Settings initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing settings:', error);
    process.exit(1);
  }
}

initializeSettings();