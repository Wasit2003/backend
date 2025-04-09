const { User } = require('../models/user.model');
const VerificationRequest = require('../models/verification-request.model');
const smsService = require('../services/sms.service');
const { generateToken, generateRefreshToken, verifyToken } = require('../utils/jwt');
const { generateVerificationCode, generateRequestId } = require('../utils/generators');
const sessionService = require('../services/session.service');
const { comparePassword } = require('../utils/auth');
const publicAddressController = require('./public-address.controller');
const { PublicAddress } = require('../models/public-address.model');
const AddressService = require('../services/address.service');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Configure bcrypt settings
const SALT_ROUNDS = 10;

class AuthController {
  async login(req, res) {
    try {
      const { phoneNumber, password } = req.body;
      
      console.log(`[AuthController] Login attempt for phone number: ${phoneNumber}`);
      
      // Clean up phone number and ensure +963 prefix
      const cleanNumber = phoneNumber.replace(/^\+?963/, '').replace(/\s+/g, '').trim();
      const formattedPhoneNumber = '+963' + cleanNumber;
      
      console.log(`[AuthController] Formatted phone number: ${formattedPhoneNumber}`);

      // Find user by phone number
      const user = await User.findOne({ phoneNumber: formattedPhoneNumber });
      
      if (!user) {
        console.log(`[AuthController] User not found for phone number: ${formattedPhoneNumber}`);
        return res.status(401).json({
          success: false,
          message: 'Invalid phone number or password'
        });
      }
      
      console.log(`[AuthController] User found: ${user._id}`);

      // Simplify password comparison to use only bcryptjs
      let isMatch = false;
      try {
        isMatch = await bcrypt.compare(password, user.password);
        console.log(`[AuthController] Password comparison result: ${isMatch ? 'MATCH' : 'NO MATCH'}`);
      } catch (error) {
        console.error('[AuthController] Error comparing passwords:', error);
      }

      if (!isMatch) {
        console.log(`[AuthController] Password mismatch for user: ${user._id}`);
        return res.status(401).json({
          success: false,
          message: 'Invalid phone number or password'
        });
      }

      // Generate JWT token
      const tokenPayload = { userId: user._id.toString() };
      console.log('[AuthController] Creating token with payload:', tokenPayload);
      
      const token = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      console.log(`[AuthController] Login successful for user: ${user._id}`);
      console.log(`[AuthController] Generated token: ${token.substring(0, 15)}...`);

      // Return success with token
      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          isVerified: user.isVerified
        }
      });
    } catch (error) {
      console.error('[AuthController] Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Error logging in'
      });
    }
  }

  async requestVerification(req, res) {
    try {
      const { phoneNumber } = req.body;

      // Generate verification code and request ID
      const code = generateVerificationCode();
      const requestId = generateRequestId();
      
      // Create or update verification request
      await VerificationRequest.create({
        phoneNumber,
        requestId,
        code,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
      });

      // Send SMS
      await smsService.sendVerificationCode(phoneNumber, code);

      res.json({ 
        success: true, 
        requestId,
        message: 'Verification code sent successfully'
      });
    } catch (error) {
      console.error('Verification request failed:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send verification code'
      });
    }
  }

  async verifyCode(req, res) {
    try {
      const { requestId, code } = req.body;
      console.log('[AuthController] Verifying code for request:', requestId);

      const verificationRequest = await VerificationRequest.findOne({
        requestId,
        verified: false,
        expiresAt: { $gt: new Date() }
      });

      if (!verificationRequest) {
        console.log('[AuthController] Verification failed: Invalid or expired request');
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired verification code'
        });
      }

      if (verificationRequest.code !== code) {
        verificationRequest.attempts += 1;
        await verificationRequest.save();
        console.log('[AuthController] Verification failed: Invalid code');
        return res.status(400).json({
          success: false,
          message: 'Invalid verification code'
        });
      }

      // Mark as verified
      verificationRequest.verified = true;
      await verificationRequest.save();
      console.log('[AuthController] Verification code validated successfully');

      // Find and update user
      const user = await User.findOne({ phoneNumber: verificationRequest.phoneNumber });
      if (!user) {
        console.error('[AuthController] User not found for verified phone number');
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update user verification status
      user.isVerified = true;
      await user.save();
      console.log('[AuthController] User marked as verified:', user._id);

      // Assign public address using the controller
      const assignedAddress = await publicAddressController.assignAddressToUser(user._id);
      if (!assignedAddress) {
        console.error('[AuthController] Failed to assign public address to user:', user._id);
        return res.status(500).json({
          success: false,
          message: 'Failed to assign public address. Please contact support.'
        });
      }
      console.log('[AuthController] Public address assigned:', assignedAddress.address);

      // Generate JWT token
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);
      
      // Create session
      await sessionService.createSession(user._id, token);
      console.log('[AuthController] Session created for user:', user._id);

      // Get fresh user data with populated public address
      const updatedUser = await User.findById(user._id).populate('publicAddress');

      res.json({
        success: true,
        token,
        refreshToken,
        user: {
          id: user._id,
          phoneNumber: user.phoneNumber,
          isVerified: user.isVerified,
          publicAddress: assignedAddress.address
        }
      });
    } catch (error) {
      console.error('[AuthController] Verification failed:', error);
      res.status(500).json({
        success: false,
        message: 'Verification failed',
        error: error.message
      });
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      
      // Verify the refresh token
      const decoded = verifyToken(refreshToken);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Get user and generate new tokens
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      const newToken = generateToken(user);
      const newRefreshToken = generateRefreshToken(user);

      res.json({
        success: true,
        token: newToken,
        refreshToken: newRefreshToken
      });
    } catch (error) {
      console.error('Token refresh failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to refresh token'
      });
    }
  }

  // Add logout endpoint
  async logout(req, res) {
    try {
      await sessionService.invalidateSession(req.user._id);
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to logout'
      });
    }
  }

  async register(req, res) {
    try {
      const { phoneNumber, name, password } = req.body;
      console.log('[AuthController] Registration request received:', { phoneNumber, name });

      // Clean up phone number and ensure +963 prefix
      const cleanNumber = phoneNumber.replace(/^\+?963/, '').replace(/\s+/g, '').trim();
      const formattedPhoneNumber = '+963' + cleanNumber;

      // Check if user already exists
      let existingUser = await User.findOne({ phoneNumber: formattedPhoneNumber });
      if (existingUser) {
        console.log('[AuthController] Registration failed: Phone number already exists');
        return res.status(400).json({ message: 'User already exists' });
      }

      // Hash the password if provided using bcryptjs
      let hashedPassword;
      if (password) {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        hashedPassword = await bcrypt.hash(password, salt);
        console.log('[AuthController] Password hashed successfully');
      } else {
        // Generate a temporary password that must be changed on first login
        const tempPassword = Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        hashedPassword = await bcrypt.hash(tempPassword, salt);
        console.log('[AuthController] Generated temporary password for user:', tempPassword);
      }

      // Create user with password
      const user = new User({
        phoneNumber: formattedPhoneNumber,
        name,
        password: hashedPassword,
        isVerified: false
      });

      // Generate verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      user.verificationCode = {
        code: verificationCode,
        expiresAt: codeExpiry
      };

      // Save the user
      await user.save();
      console.log('[AuthController] User created successfully:', user._id);

      // Create verification request
      const requestId = generateRequestId();
      await VerificationRequest.create({
        phoneNumber: formattedPhoneNumber,
        requestId,
        code: verificationCode,
        expiresAt: codeExpiry,
      });

      console.log('[AuthController] Verification request created:', requestId);

      // Send verification code via SMS (implement your SMS service here)
      // await SMSService.sendVerificationCode(phoneNumber, verificationCode);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully. Verification code sent.',
        requestId,
        userId: user._id
      });
    } catch (error) {
      console.error('[AuthController] Registration error:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Registration failed',
        error: error.message 
      });
    }
  }
}

module.exports = new AuthController(); 