const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const sanitizeInput = require('../middleware/sanitization.middleware');
const authMiddleware = require('../middleware/auth.middleware');
const { User } = require('../models/user.model');
const { PublicAddress } = require('../models/public-address.model');
const publicAddressController = require('../controllers/public-address.controller');

// Public routes
router.post(
  '/register',
  sanitizeInput,
  userController.register
);

router.post('/set-password', userController.setPassword);
router.post('/set-security-question', userController.setSecurityQuestion);
router.post('/get-security-question', userController.getSecurityQuestion);
router.post('/reset-password', userController.resetPasswordWithSecurityQuestion);

// Protected routes
router.use(authMiddleware);

// User info route
router.get('/me', userController.getMe);

// Get wallet address for payments
router.get('/payment-address', async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`[UserRoutes] Payment screen fetching wallet address for user ${userId}`);
    
    // First check PublicAddress collection directly
    const publicAddressRecord = await PublicAddress.findOne({ 
      userId: userId,
      status: 'assigned'
    });
    
    if (publicAddressRecord) {
      console.log(`[UserRoutes] Found address in PublicAddress collection: ${publicAddressRecord.address}`);
      return res.status(200).json({
        success: true,
        data: {
          walletAddress: publicAddressRecord.address
        }
      });
    }
    
    // If no direct record found, check user record
    const user = await User.findById(userId).populate('publicAddress');
    if (!user) {
      console.log(`[UserRoutes] User not found: ${userId}`);
      return res.status(404).json({
        success: false, 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    console.log(`[UserRoutes] User found: ${user._id}, checking for address`);
    console.log(`[UserRoutes] User publicAddress field:`, user.publicAddress);
    
    // Extract wallet address from user record if exists
    let walletAddress = null;
    
    if (user.publicAddress) {
      if (typeof user.publicAddress === 'object' && user.publicAddress.address) {
        walletAddress = user.publicAddress.address;
        console.log(`[UserRoutes] Found address in user.publicAddress.address: ${walletAddress}`);
      } else if (typeof user.publicAddress === 'object' && user.publicAddress.addressId) {
        const addressDoc = await PublicAddress.findById(user.publicAddress.addressId);
        if (addressDoc) {
          walletAddress = addressDoc.address;
          console.log(`[UserRoutes] Found address by reference: ${walletAddress}`);
        }
      } else if (typeof user.publicAddress === 'string') {
        walletAddress = user.publicAddress;
        console.log(`[UserRoutes] Found address in legacy format: ${walletAddress}`);
      }
    }
    
    // If we found a wallet address, return it
    if (walletAddress) {
      return res.status(200).json({
        success: true,
        data: {
          walletAddress: walletAddress
        }
      });
    }
    
    // If no address was found, try to assign one
    console.log(`[UserRoutes] No address found, attempting to assign one`);
    const availableAddress = await PublicAddress.findOne({ 
      status: 'available',
      userId: { $exists: false }
    });
    
    if (availableAddress) {
      console.log(`[UserRoutes] Found available address to assign: ${availableAddress.address}`);
      
      // Update address status
      availableAddress.userId = user._id;
      availableAddress.status = 'assigned';
      await availableAddress.save();
      
      // Update user with address
      user.publicAddress = {
        addressId: availableAddress._id,
        address: availableAddress.address
      };
      await user.save();
      
      console.log(`[UserRoutes] Successfully assigned address ${availableAddress.address} to user ${user._id}`);
      return res.status(200).json({
        success: true,
        data: {
          walletAddress: availableAddress.address
        }
      });
    }
    
    // If we get here, no address was found or assigned
    console.log(`[UserRoutes] No address available to assign to user ${user._id}`);
    return res.status(404).json({
      success: false,
      message: 'No wallet address has been assigned to your account. Please contact support.',
      code: 'NO_WALLET_ADDRESS'
    });
  } catch (error) {
    console.error('[UserRoutes] Error in payment-address endpoint:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving wallet address',
      code: 'SERVER_ERROR'
    });
  }
});

// Withdrawal routes
router.post('/withdrawals', sanitizeInput, userController.createWithdrawal);

module.exports = router; 