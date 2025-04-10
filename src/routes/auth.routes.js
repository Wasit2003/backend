const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { verificationLimiter } = require('../middleware/rate-limit.middleware');
const { 
  phoneNumberValidation, 
  verificationCodeValidation 
} = require('../middleware/validation.middleware');
const sanitizeInput = require('../middleware/sanitization.middleware');
const { PublicAddress } = require('../models/public-address.model');
const publicAddressController = require('../controllers/public-address.controller');
const { User } = require('../models/user.model');

// Public routes with validation and sanitization
router.post(
  '/login',
  sanitizeInput,
  phoneNumberValidation,
  authController.login
);

// Legacy verification routes
router.post(
  '/request-verification',
  sanitizeInput,
  phoneNumberValidation,
  authController.requestVerification
);

router.post(
  '/verify',
  sanitizeInput,
  verificationCodeValidation,
  authController.verifyCode
);

// User registration endpoint
router.post(
  '/register',
  sanitizeInput,
  phoneNumberValidation,
  authController.register
);

router.post(
  '/refresh-token',
  sanitizeInput,
  authController.refreshToken
);

// Protected routes
router.use(authMiddleware);

// Get user profile - handle both admin and user contexts
router.get('/me', (req, res) => {
  try {
    // If admin context
    if (req.isAdmin && req.admin) {
      return res.json({
        success: true,
        user: {
          id: req.admin._id,
          email: req.admin.email,
          role: req.admin.role,
          isAdmin: true
        }
      });
    }
    
    // If user context
    if (req.user) {
      return res.json({
        success: true,
        user: {
          id: req.user._id,
          phoneNumber: req.user.phoneNumber,
          name: req.user.name,
          isVerified: req.user.isVerified,
          isAdmin: false
        }
      });
    }

    // If neither admin nor user is found
    return res.status(401).json({
      success: false,
      message: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  } catch (error) {
    console.error('[AuthRoutes] Error in /me endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
});

// Endpoint to assign a new address
router.post('/assign-address', async (req, res) => {
  try {
    console.log('[AuthRoutes] Attempting to assign new address for user:', req.user._id);
    
    // Check if user already has an address
    const currentAddress = await req.user.getPublicAddress();
    if (currentAddress) {
      console.log('[AuthRoutes] User already has address:', currentAddress);
      return res.json({
        success: true,
        walletAddress: currentAddress
      });
    }
    
    // Assign new address
    const assignedAddress = await publicAddressController.assignAddressToUser(req.user._id);
    if (!assignedAddress) {
      console.error('[AuthRoutes] Failed to assign address to user:', req.user._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to assign public address. Please contact support.'
      });
    }
    
    // Update user's public address reference
    const success = await req.user.setPublicAddress(assignedAddress._id);
    if (!success) {
      console.error('[AuthRoutes] Failed to update user reference:', req.user._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to update user reference. Please contact support.'
      });
    }
    
    console.log('[AuthRoutes] Successfully assigned address:', assignedAddress.address);
    res.json({
      success: true,
      walletAddress: assignedAddress.address
    });
  } catch (error) {
    console.error('[AuthRoutes] Error assigning address:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning address'
    });
  }
});

router.post('/logout', authController.logout);

module.exports = router; 