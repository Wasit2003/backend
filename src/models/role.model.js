const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    enum: ['admin', 'superadmin', 'support']
  },
  permissions: [{
    type: String,
    enum: [
      'manage_users',
      'view_transactions',
      'approve_purchases',
      'manage_rates',
      'manage_admins',
      'view_analytics',
      'manage_settings'
    ]
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Role', roleSchema); 