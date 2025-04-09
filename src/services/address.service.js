const { PublicAddress } = require('../models/public-address.model');
const { User } = require('../models/user.model');

class AddressService {
  /**
   * Assigns an available public address to a user
   * @param {string} userId - The ID of the user to assign an address to
   * @returns {Promise<Object>} The assigned public address
   * @throws {Error} If no addresses are available
   */
  static async assignAddressToUser(userId) {
    // Find an available public address
    const availableAddress = await PublicAddress.findOne({ status: 'available' });
    
    if (!availableAddress) {
      throw new Error('No public addresses available for assignment');
    }

    // Update the address status and assign it to the user
    availableAddress.status = 'assigned';
    availableAddress.userId = userId;
    await availableAddress.save();

    // Update the user with the assigned address
    await User.findByIdAndUpdate(userId, { publicAddress: availableAddress._id });

    return availableAddress;
  }

  /**
   * Gets all available public addresses
   * @returns {Promise<Array>} List of available addresses
   */
  static async getAvailableAddresses() {
    return await PublicAddress.find({ status: 'available' });
  }

  /**
   * Gets the public address assigned to a user
   * @param {string} userId - The ID of the user
   * @returns {Promise<Object>} The user's public address
   */
  static async getUserAddress(userId) {
    return await PublicAddress.findOne({ userId });
  }

  /**
   * Releases a public address from a user
   * @param {string} userId - The ID of the user
   * @returns {Promise<Object>} The released address
   */
  static async releaseAddress(userId) {
    const address = await PublicAddress.findOne({ userId });
    if (address) {
      address.status = 'available';
      address.userId = null;
      await address.save();

      await User.findByIdAndUpdate(userId, { $unset: { publicAddress: 1 } });
    }
    return address;
  }
}

module.exports = AddressService; 