const { PublicAddress } = require('../models/public-address.model');
const { User } = require('../models/user.model');

class PublicAddressController {
  // Get all public addresses
  async getAllAddresses(req, res) {
    try {
      const addresses = await PublicAddress.find()
        .populate('userId', 'name phoneNumber');
      
      const formattedAddresses = addresses.map(addr => ({
        _id: addr._id,
        address: addr.address,
        status: addr.status,
        network: addr.network,
        userId: addr.userId?._id || null,
        userName: addr.userId?.name || null,
        createdAt: addr.createdAt
      }));

      res.status(200).json({
        success: true,
        data: formattedAddresses
      });
    } catch (error) {
      console.error('Error getting addresses:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving addresses'
      });
    }
  }

  // Add a new public address
  async addAddress(req, res) {
    try {
      const { address } = req.body;

      // Validate the address format
      if (!address || typeof address !== 'string' || address.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Invalid address format'
        });
      }

      // Check if address already exists
      const existingAddress = await PublicAddress.findOne({ address: address.trim() });
      if (existingAddress) {
        return res.status(409).json({
          success: false,
          message: 'Address already exists in the database'
        });
      }

      const newAddress = new PublicAddress({
        address: address.trim(),
        status: 'available'
      });

      await newAddress.save();

      res.status(201).json({
        success: true,
        data: newAddress
      });
    } catch (error) {
      console.error('Error adding address:', error);
      // Check for duplicate key error
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Address already exists in the database (duplicate key error)'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error adding address'
      });
    }
  }

  // Assign address to user
  async assignAddressToUser(userId) {
    try {
      console.log(`[PublicAddressController] Attempting to assign address to user ${userId}`);
      
      // First check if user exists with more detailed error logging
      let user;
      try {
        // Try to find user by ID
        user = await User.findById(userId);
        console.log('[PublicAddressController] User lookup result:', user ? 'Found' : 'Not found');
        
        // If not found, try to find by string ID
        if (!user && typeof userId === 'string') {
          user = await User.findOne({ _id: userId });
          console.log('[PublicAddressController] Secondary user lookup result:', user ? 'Found' : 'Not found');
        }
      } catch (error) {
        console.error('[PublicAddressController] Error finding user:', error);
        throw new Error('Failed to find user');
      }

      if (!user) {
        throw new Error('User not found');
      }

      // Find an available address - use simpler query that was proven to work
      const availableAddress = await PublicAddress.findOne({ status: 'available' });

      if (!availableAddress) {
        throw new Error('No available addresses found');
      }

      console.log(`[PublicAddressController] Found available address: ${availableAddress.address}`);

      // Update the address with the user ID and change status
      availableAddress.userId = userId;
      availableAddress.status = 'assigned';
      await availableAddress.save();

      // Update user with both the address ID and the address string
      user.publicAddress = {
        addressId: availableAddress._id,
        address: availableAddress.address
      };
      
      console.log(`[PublicAddressController] Updating user ${userId} with address:`, {
        addressId: availableAddress._id,
        address: availableAddress.address
      });

      await user.save();

      console.log(`[PublicAddressController] Successfully assigned address ${availableAddress.address} to user ${userId}`);
      return availableAddress;
    } catch (error) {
      console.error('[PublicAddressController] Error in assignAddressToUser:', error);
      throw error;
    }
  }
}

module.exports = new PublicAddressController(); 