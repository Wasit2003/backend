const mongoose = require('mongoose');

const publicAddressSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  status: {
    type: String,
    enum: ['available', 'assigned'],
    default: 'available',
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  network: {
    type: String,
    default: 'ETH'
  }
}, {
  timestamps: true
});

// Add compound index for faster queries
publicAddressSchema.index({ status: 1, userId: 1 });

// Add method to check if address is available
publicAddressSchema.methods.isAvailable = function() {
  return this.status === 'available' && !this.userId;
};

// Add method to assign to user
publicAddressSchema.methods.assignToUser = async function(userId) {
  if (!this.isAvailable()) {
    throw new Error('Address is not available for assignment');
  }
  
  this.status = 'assigned';
  this.userId = userId;
  await this.save();
  return this;
};

const PublicAddress = mongoose.model('PublicAddress', publicAddressSchema);

module.exports = { PublicAddress }; 