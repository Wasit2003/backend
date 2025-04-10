const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const adminAuthMiddleware = require('../middleware/adminAuth.middleware');
const publicAddressController = require('../controllers/public-address.controller');
const { User } = require('../models/user.model');
const { PublicAddress } = require('../models/public-address.model');
const { Transaction } = require('../models/transaction.model');

console.log('🔧 DEBUG: Loading admin routes module...');

// Auth routes (public)
router.post('/login', adminController.login);

// Apply admin authentication middleware to all protected routes
router.use(adminAuthMiddleware);

// Admin profile
router.get('/me', adminController.getProfile);

// Dashboard routes
router.get('/dashboard/stats', adminController.getDashboardStats);

// User management routes
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.delete('/users/:id', adminController.deleteUser);

// Transaction routes
router.get('/transactions/recent', adminController.getRecentTransactions);
router.get('/transactions', adminController.getAllTransactions);
router.get('/transactions/:id', adminController.getTransactionById);
router.put('/transactions/:id/approve', adminController.approveTransaction);
router.put('/transactions/:id/reject', adminController.rejectTransaction);
router.put('/transactions/:id/rejection-reason', adminController.updateRejectionReason);
router.put('/transactions/:id/remittance', adminController.updateRemittanceNumber);
// Delete all transactions route
router.delete('/transactions', async (req, res) => {
  try {
    console.log('[AdminRoutes] Deleting all transactions...');
    
    const result = await Transaction.deleteMany({});
    
    console.log(`[AdminRoutes] Successfully deleted ${result.deletedCount} transactions`);
    
    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} transactions`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('[AdminRoutes] Error deleting all transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting all transactions',
      error: error.message
    });
  }
});

// Purchase routes
router.get('/purchases', adminController.getAllPurchases);
router.get('/purchases/:id', adminController.getPurchaseById);

// Public address management routes
router.get('/public-addresses', publicAddressController.getAllAddresses);
router.post('/public-addresses', adminController.addPublicAddress);
router.delete('/public-addresses/:addressId', async (req, res) => {
  try {
    const { addressId } = req.params;
    
    // Find the address
    const address = await PublicAddress.findById(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Public address not found'
      });
    }
    
    // If address is assigned to a user, remove the reference
    if (address.userId) {
      await User.findByIdAndUpdate(address.userId, {
        $unset: { publicAddress: 1 }
      });
    }
    
    // Delete the address
    await address.deleteOne();
    
    return res.status(200).json({
      success: true,
      message: 'Public address deleted successfully'
    });
  } catch (error) {
    console.error('[AdminRoutes] Error deleting public address:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting public address'
    });
  }
});

router.get('/addresses', adminController.getAllPublicAddresses);
router.get('/addresses/available', adminController.getAvailableAddresses);
router.post('/users/:userId/assign-address', adminController.assignPublicAddressToUser);
router.post('/addresses/:userId/release', adminController.releaseAddress);

// Add route to manually assign public address to user
router.post('/assign-public-address', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    console.log(`[AdminRoutes] Manually assigning public address to user ${userId}`);
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Find an available address
    const availableAddress = await PublicAddress.findOne({ 
      status: 'available',
      userId: { $exists: false }
    });

    if (!availableAddress) {
      return res.status(404).json({
        success: false,
        message: 'No available addresses found'
      });
    }
    
    // Update the address with the user ID and change status
    availableAddress.userId = userId;
    availableAddress.status = 'assigned';
    await availableAddress.save();
    
    // Update user with both the address ID and string
    user.publicAddress = {
      addressId: availableAddress._id,
      address: availableAddress.address
    };
    
    await user.save();
    
    console.log(`[AdminRoutes] Successfully assigned address ${availableAddress.address} to user ${userId}`);
    
    return res.status(200).json({
      success: true,
      message: 'Public address assigned successfully',
      data: {
        userId: user._id,
        userName: user.name,
        publicAddress: availableAddress.address
      }
    });
  } catch (error) {
    console.error('[AdminRoutes] Error assigning public address:', error);
    return res.status(500).json({
      success: false,
      message: 'Error assigning public address'
    });
  }
});

// Modify the settings routes with better debug logs
router.get('/settings', async (req, res) => {
  console.log('⚙️ DEBUG: GET /admin/settings or /api/admin/settings endpoint hit');
  console.log('⚙️ DEBUG: Full URL:', req.originalUrl);
  console.log('⚙️ DEBUG: Headers:', req.headers);
  
  try {
    const Settings = require('../models/settings.model');
    console.log('⚙️ DEBUG: Settings model loaded');
    
    const settings = await Settings.getSettings();
    console.log('⚙️ DEBUG: Settings fetched:', settings);
    
    res.status(200).json({
      success: true,
      settings: {
        networkFeePercentage: settings.networkFeePercentage || 1.0,
        exchangeRate: settings.exchangeRate || 1.0,
        updatedAt: settings.updatedAt
      }
    });
    console.log('⚙️ DEBUG: Settings response sent successfully');
  } catch (error) {
    console.error('❌ DEBUG: Error fetching admin settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
});

router.put('/settings', async (req, res) => {
  console.log('⚙️ DEBUG: PUT /admin/settings or /api/admin/settings endpoint hit');
  console.log('⚙️ DEBUG: Full URL:', req.originalUrl);
  console.log('⚙️ DEBUG: Body:', req.body);
  console.log('⚙️ DEBUG: Headers:', req.headers);
  
  try {
    const { networkFeePercentage, exchangeRate } = req.body;
    const Settings = require('../models/settings.model');
    
    // Validate inputs
    if (networkFeePercentage !== undefined && (isNaN(networkFeePercentage) || networkFeePercentage < 0 || networkFeePercentage > 100)) {
      console.log('❌ DEBUG: Invalid network fee percentage:', networkFeePercentage);
      return res.status(400).json({
        success: false,
        message: 'Network fee percentage must be between 0 and 100'
      });
    }

    if (exchangeRate !== undefined && (isNaN(exchangeRate) || exchangeRate <= 0)) {
      console.log('❌ DEBUG: Invalid exchange rate:', exchangeRate);
      return res.status(400).json({
        success: false,
        message: 'Exchange rate must be greater than 0'
      });
    }
    
    // Update settings
    console.log('⚙️ DEBUG: Fetching current settings');
    const settings = await Settings.getSettings();
    
    if (networkFeePercentage !== undefined) {
      console.log(`⚙️ DEBUG: Updating network fee from ${settings.networkFeePercentage} to ${networkFeePercentage}`);
      settings.networkFeePercentage = networkFeePercentage;
    }
    
    if (exchangeRate !== undefined) {
      console.log(`⚙️ DEBUG: Updating exchange rate from ${settings.exchangeRate} to ${exchangeRate}`);
      settings.exchangeRate = exchangeRate;
    }
    
    if (req.user && req.user._id) {
      console.log(`⚙️ DEBUG: Setting updatedBy to user ${req.user._id}`);
      settings.updatedBy = req.user._id;
    }
    
    console.log('⚙️ DEBUG: Saving settings');
    await settings.save();
    console.log('⚙️ DEBUG: Settings saved successfully');
    
    res.status(200).json({
      success: true,
      settings: {
        networkFeePercentage: settings.networkFeePercentage,
        exchangeRate: settings.exchangeRate,
        updatedAt: settings.updatedAt
      }
    });
  } catch (error) {
    console.error('❌ DEBUG: Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message
    });
  }
});

console.log('✅ DEBUG: Admin routes module loaded successfully');

module.exports = router;