const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clientUuid: {
    type: String,
    required: true,
    index: true // Add index for faster lookups
  },
  mainAccountName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['BUY', 'SELL', 'SEND', 'RECEIVE', 'WITHDRAW'],
    required: true
  },
  amount: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  txHash: {
    type: String,
  },
  fromAddress: {
    type: String,
  },
  toAddress: {
    type: String,
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  customerDetails: {
    name: String,
    phone: String,
    location: String
  },
  metadata: {
    type: Map,
    of: String,
    default: {}
  }
}, {
  timestamps: true
});

// Add compound index for faster lookups
transactionSchema.index({ clientUuid: 1, userId: 1 });

// Add a pre-save middleware to ensure mainAccountName is set
transactionSchema.pre('save', async function(next) {
  if (!this.mainAccountName && this.userId) {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(this.userId);
      if (user) {
        this.mainAccountName = user.username || user.name || user.phoneNumber;
      }
    } catch (err) {
      console.error('Error in transaction pre-save middleware:', err);
    }
  }
  next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = { Transaction };
