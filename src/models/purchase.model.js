const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  usdtAmount: {
    type: String, // Store as string due to BigInt
    required: true
  },
  sypAmount: {
    type: Number,
    required: true
  },
  exchangeRate: {
    type: Number,
    required: true
  },
  fee: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'awaitingPayment', 'paymentUploaded', 'verified', 'completed', 'rejected'],
    default: 'pending'
  },
  receiptUrl: {
    type: String
  },
  rejectionReason: {
    type: String
  },
  transactionHash: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
purchaseSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Purchase', purchaseSchema); 