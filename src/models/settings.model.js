const mongoose = require('mongoose');

console.log('💾 DEBUG: Loading settings model');

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

// There should only be one settings document
settingsSchema.statics.getSettings = async function() {
  try {
    console.log('💾 Attempting to find existing settings');
    const settings = await this.findOne();
    
    if (settings) {
      console.log('💾 Found existing settings document');
      return settings;
    }
    
    // If no settings exist, create default settings
    console.log('💾 No settings found, creating default settings');
    const defaultSettings = await this.create({
      networkFeePercentage: 1.0,
      exchangeRate: 1.0,
      updatedAt: new Date()
    });
    
    console.log('💾 Default settings created:', defaultSettings);
    return defaultSettings;
  } catch (error) {
    console.error('💾 Error in getSettings method:', error);
    console.error('💾 Stack trace:', error.stack);
    
    // Provide richer error information
    const enhancedError = new Error(`Failed to get or create settings: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.code = 'SETTINGS_ERROR';
    throw enhancedError;
  }
};

// Update timestamp on save
settingsSchema.pre('save', function(next) {
  console.log('💾 Updating settings timestamp before save');
  this.updatedAt = Date.now();
  next();
});

// Safety mechanism to handle potential model registration issues
let Settings;
try {
  // Try to get the model if it's already registered
  Settings = mongoose.model('Settings');
  console.log('💾 Settings model retrieved from registry');
} catch (error) {
  // If not registered, create the model
  Settings = mongoose.model('Settings', settingsSchema);
  console.log('💾 Settings model created and registered');
}

module.exports = Settings; 