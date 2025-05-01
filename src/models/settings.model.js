const mongoose = require('mongoose');

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
  const settings = await this.findOne();
  if (settings) {
    return settings;
  } 
  
  // If no settings exist, create default settings
  return this.create({
    networkFeePercentage: 1.0,
    exchangeRate: 1.0
  });
};

// Update timestamp on save
settingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Settings', settingsSchema); 