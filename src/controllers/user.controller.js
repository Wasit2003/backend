const { User } = require('../models/user.model');
const { Web3 } = require('web3');
const { Transaction } = require('../models/transaction.model');
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../utils/auth');
const publicAddressController = require('./public-address.controller');
const { PublicAddress } = require('../models/public-address.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Add a logging function for withdrawal debugging
const logWithdrawal = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [WITHDRAW] ${message} ${JSON.stringify(data)}`;
  
  console.log(logMessage);
  
  // Write to log file
  const logDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'withdraw_logs.txt');
  fs.appendFileSync(logFile, logMessage + '\n');
};

// Function to generate random Ethereum wallet address
function generateWalletAddress() {
  const web3 = new Web3();
  const account = web3.eth.accounts.create();
  return account.address;
}

class UserController {
  async register(req, res) {
    try {
      console.log('Registration request received from mobile app');
      
      const { phoneNumber, name, password, securityQuestion, securityAnswer } = req.body;
      
      // Clean up phone number and ensure +963 prefix
      const cleanNumber = phoneNumber.replace(/^\+?963/, '').replace(/\s+/g, '').trim();
      const formattedPhoneNumber = '+963' + cleanNumber;

      // Check if phone number already exists
      const existingUser = await User.findOne({ phoneNumber: formattedPhoneNumber });
      if (existingUser) {
        console.log('Registration failed: Phone number already exists');
        return res.status(400).json({
          success: false,
          message: 'Phone number already exists',
          messageAr: 'رقم الهاتف موجود بالفعل'
        });
      }

      // Hash the password
      const hashedPassword = await hashPassword(password);

      // Create the new user
      const newUser = new User({
        phoneNumber: formattedPhoneNumber,
        name,
        password: hashedPassword,
        isVerified: false,
        securityQuestion: {
          question: securityQuestion,
          answer: securityAnswer
        }
        // role will use the default 'user' value
      });

      // Save the user to the database
      await newUser.save();
      console.log(`User registered: ${newUser._id}, Phone: ${formattedPhoneNumber}, Name: ${name}`);

      // Try to assign a public address to the user, but don't fail registration if it fails
      try {
        console.log(`[PublicAddressController] Attempting to assign address to user ${newUser._id}`);
        const assignedAddress = await publicAddressController.assignAddressToUser(newUser._id);
        console.log(`[UserController] Successfully assigned address ${assignedAddress.address} to new user ${newUser._id}`);
      } catch (addressError) {
        console.error(`[PublicAddressController] Error in assignAddressToUser:`, addressError);
        // Don't fail registration, just log the error
        console.log(`Registration successful but address assignment failed: ${addressError.message}`);
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: newUser._id },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token,
        user: {
          id: newUser._id,
          phoneNumber: newUser.phoneNumber,
          name: newUser.name,
          isVerified: newUser.isVerified
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Error during registration'
      });
    }
  }

  async createWithdrawal(req, res) {
    logWithdrawal('Withdrawal request received', { headers: req.headers });
    
    try {
      logWithdrawal('Processing withdrawal request', { body: req.body });
      
      // Extract data from request body
      const { amount, walletAddress, userName, userPhone, userLocation, withdrawId } = req.body;
      
      // Get the user ID from the authenticated request
      // If admin is making the request (from mobile app), use a placeholder userId
      let userId;
      
      if (req.user.isAdmin) {
        logWithdrawal('Admin-initiated withdrawal', { 
          adminId: req.user._id,
          role: req.user.role
        });
        
        // For admin-initiated withdrawals, we'll use the admin ID but mark it specially
        userId = req.user._id;
      } else {
        userId = req.user._id;
        logWithdrawal('User-initiated withdrawal', { userId });
      }
      
      // Validate required fields
      if (!amount) {
        logWithdrawal('Missing required fields', { missingFields: 'amount' });
        return res.status(400).json({ success: false, message: 'Amount is required' });
      }
      
      logWithdrawal('Creating withdrawal transaction', { 
        amount, 
        walletAddress, 
        userId,
        withdrawId,
        initiatedBy: req.user.isAdmin ? 'ADMIN' : 'USER'
      });
      
      // Create a new transaction record for the withdrawal
      const transaction = new Transaction({
        userId,
        type: 'WITHDRAW',
        amount: amount.toString(),
        status: 'PENDING',
        txHash: `withdraw_${Date.now()}`,
        // Store the wallet address in the fromAddress field
        fromAddress: walletAddress,
        metadata: {
          withdrawId,
          userName,
          userPhone,
          userLocation,
          initiatedBy: req.user.isAdmin ? 'ADMIN' : 'USER',
          // Also keep it in metadata for backward compatibility
          walletAddress
        }
      });
      
      // Save the transaction
      await transaction.save();
      logWithdrawal('Withdrawal transaction created successfully', { 
        transactionId: transaction._id,
        status: transaction.status
      });
      
      return res.status(201).json({
        success: true,
        message: 'Withdrawal request created successfully',
        _id: transaction._id,
        status: transaction.status,
        type: transaction.type,
        amount: transaction.amount
      });
      
    } catch (error) {
      logWithdrawal('Error creating withdrawal', { 
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Error creating withdrawal request',
        error: error.message
      });
    }
  }

  async setPassword(req, res) {
    try {
      const { phoneNumber, password } = req.body;

      // Clean up phone number and ensure +963 prefix
      const cleanNumber = phoneNumber.replace(/^\+?963/, '').replace(/\s+/g, '').trim();
      const formattedPhoneNumber = '+963' + cleanNumber;

      // Find the user by phone number
      const user = await User.findOne({ phoneNumber: formattedPhoneNumber });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Hash the password before saving
      const hashedPassword = await hashPassword(password);
      user.password = hashedPassword;
      await user.save();

      console.log(`Password set for user: ${user._id}`);
      
      // Return success
      return res.status(200).json({
        success: true,
        message: 'Password set successfully',
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          isVerified: user.isVerified
        }
      });
    } catch (error) {
      console.error('Error setting password:', error.message);
      res.status(500).json({
        success: false,
        message: 'Error setting password'
      });
    }
  }

  async setSecurityQuestion(req, res) {
    try {
      const { phoneNumber, question, answer } = req.body;

      // Find the user by phone number
      const user = await User.findOne({ phoneNumber });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Set the security question and answer
      user.securityQuestion = {
        question,
        answer
      };
      await user.save();

      console.log(`Security question set for user: ${user._id}`);
      
      // Return success
      return res.status(200).json({
        success: true,
        message: 'Security question set successfully',
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          isVerified: user.isVerified
        }
      });
    } catch (error) {
      console.error('Error setting security question:', error.message);
      res.status(500).json({
        success: false,
        message: 'Error setting security question'
      });
    }
  }

  // Get current user information
  async getMe(req, res) {
    try {
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Format the response to include the public address
      let publicAddress = null;
      let publicAddressId = null;
      
      // Handle both old and new schema structures
      if (user.publicAddress) {
        if (user.publicAddress.address) {
          // New structure
          publicAddress = user.publicAddress.address;
          publicAddressId = user.publicAddress.addressId;
          console.log(`[UserController] Found address in new format: ${publicAddress}`);
        } else if (typeof user.publicAddress === 'string') {
          // Old structure with string
          publicAddress = user.publicAddress;
          console.log(`[UserController] Found address in string format: ${publicAddress}`);
        }
      }
      
      // If we still don't have an address, look it up
      if (!publicAddress) {
        console.log(`[UserController] No address found in user object, looking up in PublicAddress collection`);
        const addressRecord = await PublicAddress.findOne({ userId: user._id, status: 'assigned' });
        if (addressRecord) {
          publicAddress = addressRecord.address;
          publicAddressId = addressRecord._id;
          console.log(`[UserController] Found address in PublicAddress collection: ${publicAddress}`);
          
          // Update user with new structure
          user.publicAddress = {
            addressId: addressRecord._id,
            address: addressRecord.address
          };
          await user.save();
          console.log(`[UserController] Updated user with new address structure`);
        } else {
          console.log(`[UserController] No assigned address found for user ${user._id}`);
          
          // Try to assign a new address
          try {
            console.log(`[UserController] Attempting to assign a new address to user ${user._id}`);
            const availableAddress = await PublicAddress.findOne({ 
              status: 'available',
              userId: { $exists: false }
            });
            
            if (availableAddress) {
              console.log(`[UserController] Found available address to assign: ${availableAddress.address}`);
              
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
              
              publicAddress = availableAddress.address;
              publicAddressId = availableAddress._id;
              console.log(`[UserController] Assigned new address ${publicAddress} to user ${user._id}`);
            } else {
              console.log(`[UserController] No available addresses found to assign`);
            }
          } catch (assignError) {
            console.error(`[UserController] Error assigning address:`, assignError);
          }
        }
      }

      const userResponse = {
        _id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        isVerified: user.isVerified,
        publicAddress: publicAddress,
        walletAddress: publicAddress, // Add an alias for mobile app compatibility
        createdAt: user.createdAt
      };

      console.log('[UserController] Returning user info:', {
        userId: user._id,
        publicAddress: publicAddress
      });

      res.status(200).json({
        success: true,
        data: userResponse
      });
    } catch (error) {
      console.error('[UserController] Error in getMe:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving user information'
      });
    }
  }

  async getSecurityQuestion(req, res) {
    try {
      const { phoneNumber } = req.body;

      // Clean up phone number and ensure +963 prefix
      const cleanNumber = phoneNumber.replace(/^\+?963/, '').replace(/\s+/g, '').trim();
      const formattedPhoneNumber = '+963' + cleanNumber;

      // Find the user by phone number
      const user = await User.findOne({ phoneNumber: formattedPhoneNumber });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user has a security question
      if (!user.securityQuestion || !user.securityQuestion.question) {
        return res.status(400).json({
          success: false,
          message: 'No security question set for this user'
        });
      }

      // Return the security question
      return res.status(200).json({
        success: true,
        question: user.securityQuestion.question
      });
    } catch (error) {
      console.error('Error getting security question:', error.message);
      res.status(500).json({
        success: false,
        message: 'Error getting security question'
      });
    }
  }

  async resetPasswordWithSecurityQuestion(req, res) {
    try {
      const { phoneNumber, answer, newPassword } = req.body;

      // Clean up phone number and ensure +963 prefix
      const cleanNumber = phoneNumber.replace(/^\+?963/, '').replace(/\s+/g, '').trim();
      const formattedPhoneNumber = '+963' + cleanNumber;

      // Find the user by phone number
      const user = await User.findOne({ phoneNumber: formattedPhoneNumber });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user has a security question and answer
      if (!user.securityQuestion || !user.securityQuestion.answer) {
        return res.status(400).json({
          success: false,
          message: 'No security question set for this user'
        });
      }

      // Verify the answer
      if (user.securityQuestion.answer !== answer) {
        return res.status(401).json({
          success: false,
          message: 'Incorrect security question answer'
        });
      }

      // Hash the new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update the password
      user.password = hashedPassword;
      await user.save();

      console.log(`Password reset successfully for user: ${user._id}`);
      
      return res.status(200).json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      console.error('Error resetting password:', error.message);
      res.status(500).json({
        success: false,
        message: 'Error resetting password'
      });
    }
  }
}

module.exports = new UserController();