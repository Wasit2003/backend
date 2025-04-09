const mongoose = require('mongoose');

const verificationRequestSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true
  },
  requestId: {
    type: String,
    required: true,
    unique: true
  },
  code: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  verified: {
    type: Boolean,
    default: false
  }
});

const VerificationRequest = mongoose.model('VerificationRequest', verificationRequestSchema);
module.exports = VerificationRequest; 