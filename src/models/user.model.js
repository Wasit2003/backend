const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: false,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  securityQuestion: {
    question: {
      type: String,
      required: true
    },
    answer: {
      type: String,
      required: true
    }
  },
  publicAddress: {
    addressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PublicAddress',
      default: null
    },
    address: {
      type: String,
      default: null
    }
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    code: String,
    expiresAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'superadmin'],
    default: 'user'
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  adminMetadata: {
    lastLogin: Date,
    loginHistory: [{
      timestamp: Date,
      ipAddress: String,
      userAgent: String
    }],
    passwordChangedAt: Date
  }
});

// Add pre-save hook to validate publicAddress structure
userSchema.pre('save', function(next) {
  // If publicAddress exists but is not in the proper structure
  if (this.publicAddress && 
     (typeof this.publicAddress === 'string' || 
      this.publicAddress instanceof mongoose.Types.ObjectId || 
      this.publicAddress.buffer)) {
    
    console.log(`[UserModel] Converting legacy publicAddress format for user ${this._id}`);
    // Convert to proper structure
    const addressValue = 
      typeof this.publicAddress === 'string' ? this.publicAddress : 
      this.publicAddress instanceof mongoose.Types.ObjectId ? this.publicAddress : null;
      
    if (addressValue) {
      this.publicAddress = {
        addressId: addressValue,
        address: null // This will need to be populated separately
      };
    } else {
      // Reset if we can't determine the value
      this.publicAddress = {
        addressId: null,
        address: null
      };
    }
  }
  
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Method to get user's public address
userSchema.methods.getPublicAddress = function() {
  if (this.publicAddress) {
    if (this.publicAddress.address) {
      return this.publicAddress.address;
    }
  }
  return null;
};

// Method to set user's public address
userSchema.methods.setPublicAddress = async function(addressId) {
  try {
    this.publicAddress = addressId;
    await this.save();
    return true;
  } catch (error) {
    console.error('[UserModel] Error setting public address:', error);
    return false;
  }
};

// Add method to check verification code
userSchema.methods.isValidVerificationCode = function(code) {
  return this.verificationCode.code === code && 
         this.verificationCode.expiresAt > new Date();
};

// Add method to check specific permission
userSchema.methods.hasPermission = function(permission) {
  // Map roles to permissions
  const rolePermissions = {
    'user': ['read_own_profile', 'create_transaction'],
    'admin': ['read_own_profile', 'create_transaction', 'read_users', 'manage_transactions'],
    'superadmin': ['read_own_profile', 'create_transaction', 'read_users', 'manage_transactions', 'manage_users', 'manage_system']
  };
  
  // Get permissions for this user's role
  const permissions = rolePermissions[this.role] || [];
  
  // Check if the permission exists
  return permissions.includes(permission);
};

// Bcrypt password hashing middleware
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  // AND if it doesn't already look like a bcrypt hash
  if (!this.isModified('password')) return next();
  
  // Check if the password is already a bcrypt hash
  if (this.password.startsWith('$2')) {
    return next();
  }

  try {
    // Generate a salt
    const salt = await bcrypt.genSalt(10);
    // Hash the password along with the new salt
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

const User = mongoose.model('User', userSchema);

module.exports = { User }; 