const mongoose = require('mongoose');
const { User } = require('../models/user.model');
const { Role } = require('../models/role.model');
const jwt = require('jsonwebtoken');
const { hashPassword, comparePassword } = require('../utils/auth');
const { Transaction } = require('../models/transaction.model');
const { Admin } = require('../models/admin.model');
const { PublicAddress } = require('../models/public-address.model');
const AddressService = require('../services/address.service');
const publicAddressController = require('./public-address.controller');
const EventBus = require('../utils/eventBus');

class AdminController {
  // Admin login
  async login(req, res) {
    console.log('==== ADMIN LOGIN DEBUG ====');
    try {
      const { email, password } = req.body;
      console.log('DEBUG: Login attempt for email:', email);
      
      // Find admin user
      const admin = await Admin.findOne({ email });
      if (!admin) {
        console.log('DEBUG: Login failed - Admin not found');
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Verify password
      const isPasswordValid = await admin.comparePassword(password);
      if (!isPasswordValid) {
        console.log('DEBUG: Login failed - Invalid password');
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: admin._id, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      console.log('DEBUG: Login successful for admin:', admin.email);
      res.json({ token, user: admin.toJSON() });
    } catch (error) {
      console.error('DEBUG: Login error:', error);
      res.status(500).json({ message: 'Server error' });
    }
    console.log('==== END ADMIN LOGIN DEBUG ====');
  }

  // Create admin user
  async createAdmin(req, res) {
    try {
      const { email, password, roleId } = req.body;

      // Check if email exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }

      // Verify role exists
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role'
        });
      }

      // Create admin user
      const hashedPassword = await hashPassword(password);
      const admin = new User({
        email,
        password: hashedPassword,
        role: roleId,
        isAdmin: true,
        adminMetadata: {
          passwordChangedAt: new Date()
        }
      });

      await admin.save();

      res.status(201).json({
        success: true,
        admin: {
          id: admin._id,
          email: admin.email,
          role: role
        }
      });
    } catch (error) {
      console.error('Create admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create admin'
      });
    }
  }

  // Get admin profile
  async getProfile(req, res) {
    try {
      const admin = await Admin.findById(req.admin.id).select('-password');
      res.json(admin);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Update admin permissions
  async updatePermissions(req, res) {
    try {
      const { adminId } = req.params;
      const { roleId } = req.body;

      // Verify role exists
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role'
        });
      }

      const admin = await User.findById(adminId);
      if (!admin || !admin.isAdmin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      admin.role = roleId;
      await admin.save();

      res.json({
        success: true,
        admin: {
          id: admin._id,
          email: admin.email,
          role: role
        }
      });
    } catch (error) {
      console.error('Update permissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update permissions'
      });
    }
  }

  // Get dashboard statistics
  async getDashboardStats(req, res) {
    try {
      console.log('Getting dashboard stats...');
      
      // Debug: Check if User model is properly imported
      console.log('User model:', User ? 'Available' : 'Not available');
      
      // Debug: Log the MongoDB connection state
      console.log('MongoDB connection state:', mongoose.connection.readyState);
      
      // Debug: Count users directly
      const userCount = await User.countDocuments();
      console.log('User count:', userCount);
      
      // Debug: List a few users if any
      const sampleUsers = await User.find().limit(5);
      console.log('Sample users:', sampleUsers.map(u => ({ id: u._id, phone: u.phoneNumber })));

      const [totalUsers, totalTransactions, pendingTransactions, volumeStats] = await Promise.all([
        User.countDocuments(),
        Transaction.countDocuments(),
        Transaction.countDocuments({ status: 'PENDING' }),
        Transaction.aggregate([
          { $match: { status: 'APPROVED' } },
          { $group: { _id: null, totalVolume: { $sum: { $toDouble: '$amount' } } } }
        ])
      ]);
      
      console.log('Stats calculated:', { totalUsers, totalTransactions, pendingTransactions });
      
      res.json({
        totalUsers,
        totalTransactions,
        pendingTransactions,
        totalVolume: volumeStats[0]?.totalVolume || 0
      });
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Format receipt URL to ensure it's a valid full URL
  formatReceiptUrl(receiptUrl, req) {
    if (!receiptUrl) return null;
    
    // If it's already a full URL, return it
    if (receiptUrl.startsWith('http://') || receiptUrl.startsWith('https://')) {
      return receiptUrl;
    }
    
    // If it's a relative path, add the host
    if (receiptUrl.startsWith('/')) {
      const protocol = req ? req.protocol : 'http';
      const host = req ? req.get('host') : 'localhost:3000';
      return `${protocol}://${host}${receiptUrl}`;
    }
    
    // Otherwise, assume it's a relative path without leading slash
    const protocol = req ? req.protocol : 'http';
    const host = req ? req.get('host') : 'localhost:3000';
    return `${protocol}://${host}/${receiptUrl}`;
  }

  // Get all transactions with enhanced data
  async getAllTransactions(req, res) {
    try {
      // Add logging
      console.log('DEBUG_ADMIN: Fetching all transactions');
      
      // Get transactions from database
      const transactions = await Transaction.find()
        .sort({ createdAt: -1 }) // Most recent first
        .lean(); // Convert to plain JavaScript objects
      
      // Process transactions before sending
      const processedTransactions = transactions.map(transaction => {
        // Create a copy of the transaction to avoid modifying the original
        const processedTransaction = { ...transaction };
        
        // Helper function to convert Map objects to plain objects recursively
        const convertMapToObject = (item) => {
          if (item instanceof Map) {
            // Convert Map to plain object
            const obj = {};
            item.forEach((value, key) => {
              // Recursively convert nested Maps
              obj[key] = convertMapToObject(value);
            });
            return obj;
          } else if (item && typeof item === 'object' && !Array.isArray(item)) {
            // Process nested objects
            const obj = {};
            Object.keys(item).forEach(key => {
              obj[key] = convertMapToObject(item[key]);
            });
            return obj;
          } else if (Array.isArray(item)) {
            // Process arrays
            return item.map(element => convertMapToObject(element));
          }
          
          // Return primitive values as-is
          return item;
        };
        
        // Process metadata if it exists
        if (processedTransaction.metadata) {
          // Check if metadata is a Map (MongoDB object)
          if (processedTransaction.metadata instanceof Map) {
            console.log('DEBUG_METADATA: Transaction metadata is a Map, converting to object');
            processedTransaction.metadata = convertMapToObject(processedTransaction.metadata);
          } 
          // Check if metadata is a string (JSON)
          else if (typeof processedTransaction.metadata === 'string') {
            console.log('DEBUG_METADATA: Transaction metadata is a string, parsing as JSON');
            try {
              processedTransaction.metadata = JSON.parse(processedTransaction.metadata);
            } catch (e) {
              console.log('DEBUG_METADATA: Failed to parse metadata string:', e);
            }
          }
          
          // Log wallet address if found in metadata
          if (processedTransaction.metadata.walletAddress) {
            console.log('DEBUG_WALLET: Found wallet address in transaction metadata:', processedTransaction.metadata.walletAddress);
          }
          
          // Check for alternative wallet address field names
          const metadataKeys = Object.keys(processedTransaction.metadata);
          const walletAddressKey = metadataKeys.find(key => 
            key.toLowerCase().includes('wallet') || 
            (key.toLowerCase().includes('address') && !key.toLowerCase().includes('email'))
          );
          
          if (walletAddressKey && !processedTransaction.metadata.walletAddress) {
            console.log(`DEBUG_WALLET: Found wallet address using alternative key "${walletAddressKey}":`, 
              processedTransaction.metadata[walletAddressKey]);
            
            // Add a standardized walletAddress field
            processedTransaction.metadata.walletAddress = processedTransaction.metadata[walletAddressKey];
          }
        }
        
        return processedTransaction;
      });
      
      // Return successful response
      return res.status(200).json({
        success: true,
        transactions: processedTransactions
      });
    } catch (error) {
      console.error('Error in getAllTransactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error in getting transactions'
      });
    }
  }

  // Get recent transactions
  async getRecentTransactions(req, res) {
    try {
      console.log('Starting getRecentTransactions');
      
      // Check if wallet address filter is provided
      const walletAddress = req.query.walletAddress;
      console.log('Filtering transactions by wallet address:', walletAddress);
      
      // Ensure Transaction model is available
      if (!Transaction) {
        console.error('Transaction model is not properly imported');
        return res.status(500).json({
          success: false,
          message: 'Internal server error - Transaction model not available'
        });
      }
      
      console.log('Transaction model available:', !!Transaction);
      
      // Build query object
      const query = {};
      
      // Add wallet address filter if provided
      if (walletAddress) {
        // Case-insensitive wallet address match
        query.$or = [
          { fromAddress: new RegExp(walletAddress, 'i') },
          { walletAddress: new RegExp(walletAddress, 'i') },
          { 'userId.walletAddress': new RegExp(walletAddress, 'i') }
        ];
      }
      
      // Only filter by status if includeAllStatuses is not true
      const includeAllStatuses = req.query.includeAllStatuses === 'true';
      console.log('Include all statuses:', includeAllStatuses);
      
      if (!includeAllStatuses) {
        // Default behavior - only return pending transactions
        query.status = 'PENDING';
      }
      
      const transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('userId', 'username email walletAddress');
      
      console.log(`Found ${transactions?.length || 0} recent transactions${walletAddress ? ` for wallet ${walletAddress}` : ''}`);
      
      // Load Purchase model directly to avoid any import issues
      const Purchase = require('../models/purchase.model');
      
      // Make sure we have the Purchase model properly
      const purchaseModel = typeof Purchase === 'object' && Purchase.hasOwnProperty('default') 
        ? Purchase.default 
        : Purchase;
        
      console.log('Purchase model available:', !!purchaseModel);
      
      // Fetch purchases with receipt URLs to map them to transactions
      const purchases = await purchaseModel.find({
        status: { $in: ['paymentUploaded', 'completed'] },
        receiptUrl: { $exists: true, $ne: null }
      }).select('transactionHash receiptUrl customerInfo');
      
      console.log(`Found ${purchases?.length || 0} purchases with receipts`);
      
      // Create a map of transaction hashes to receipt URLs from purchases
      const txHashToReceiptUrl = new Map();
      const txHashToCustomerInfo = new Map();
      
      purchases.forEach(purchase => {
        if (purchase.transactionHash && purchase.receiptUrl) {
          txHashToReceiptUrl.set(purchase.transactionHash, purchase.receiptUrl);
        }
        
        if (purchase.transactionHash && purchase.customerInfo && purchase.customerInfo.name) {
          txHashToCustomerInfo.set(purchase.transactionHash, purchase.customerInfo);
        }
      });
      
      // Function to format receipt URL
      const formatReceiptUrl = (url, req) => {
        if (!url) return null;
        
        // If it's already a full URL, return it
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
        
        // If it's a relative path, create full URL
        const protocol = req.protocol;
        const host = req.get('host');
        return `${protocol}://${host}${url.startsWith('/') ? '' : '/'}${url}`;
      };
      
      // Enhance transactions with receipt URLs and customer info
      const enhancedTransactions = transactions.map(transaction => {
        const txData = transaction.toObject();
        
        // Debug log for transaction metadata
        console.log(`Transaction ${txData._id} metadata:`, txData.metadata);
        if (txData.metadata) {
          console.log(`Transaction ${txData._id} metadata.userName:`, txData.metadata.userName);
          console.log(`Transaction ${txData._id} metadata keys:`, txData.metadata.keys ? [...txData.metadata.keys()].join(', ') : 'N/A');
        }
        
        // Add wallet address from transaction or from user
        if (txData.fromAddress) {
          txData.walletAddress = txData.fromAddress;
        } else if (txData.userId && txData.userId.walletAddress) {
          txData.walletAddress = txData.userId.walletAddress;
        } else if (txData.type === 'WITHDRAW' && txData.metadata) {
          // For withdrawal transactions, check metadata for wallet address
          let metadataWalletAddress = null;
          
          if (txData.metadata instanceof Map) {
            metadataWalletAddress = txData.metadata.get('walletAddress');
          } else if (typeof txData.metadata === 'object') {
            metadataWalletAddress = txData.metadata.walletAddress;
          }
          
          if (metadataWalletAddress) {
            txData.walletAddress = metadataWalletAddress;
            console.log(`Found wallet address in metadata for withdrawal ${txData._id}: ${metadataWalletAddress}`);
          }
        }
        
        // Check for receipt URL in the purchase mapping or metadata
        if (txData.txHash && txHashToReceiptUrl.has(txData.txHash)) {
          txData.receiptUrl = formatReceiptUrl(txHashToReceiptUrl.get(txData.txHash), req);
        } else if (txData.metadata) {
          const receiptUrl = txData.metadata instanceof Map 
            ? txData.metadata.get('receiptUrl')
            : txData.metadata.receiptUrl;
            
          if (receiptUrl) {
            txData.receiptUrl = formatReceiptUrl(receiptUrl, req);
          }
        }
        
        // Check for user name in purchase mapping or transaction metadata
        if (txData.txHash && txHashToCustomerInfo.has(txData.txHash)) {
          const customerInfo = txHashToCustomerInfo.get(txData.txHash);
          txData.customerName = customerInfo.name;
          txData.userName = customerInfo.name; // Set both fields for compatibility
          txData.customerPhone = customerInfo.phone;
          txData.customerLocation = customerInfo.location;
        } else if (txData.metadata) {
          // Handle metadata - it could be a Map or already converted to a plain object
          if (txData.metadata instanceof Map) {
            // If it's still a Map
            txData.userName = txData.metadata.get('userName') || txData.metadata.get('displayName');
            txData.customerName = txData.metadata.get('userName') || txData.metadata.get('displayName');
            txData.customerPhone = txData.metadata.get('userPhone');
            txData.customerLocation = txData.metadata.get('userLocation');
          } else {
            // If it's already converted to a plain object
            txData.userName = txData.metadata.userName || txData.metadata.displayName;
            txData.customerName = txData.metadata.userName || txData.metadata.displayName;
            txData.customerPhone = txData.metadata.userPhone;
            txData.customerLocation = txData.metadata.userLocation;
          }
          
          // Debug log after setting userName/customerName
          console.log(`Transaction ${txData._id} after mapping: userName=${txData.userName}, customerName=${txData.customerName}`);
        }
        
        // If no user name found but we have a user object with username, use that
        if (!txData.customerName && txData.userId && txData.userId.username) {
          txData.customerName = txData.userId.username;
          txData.userName = txData.userId.username; // Set both fields for compatibility
        }
        
        // If still no user name, provide a default
        if (!txData.customerName) {
          txData.customerName = "No user";
          txData.userName = "No user"; // Set both fields for compatibility
        }
        
        // Adjust amount if it's 0 and metadata contains amount
        if ((txData.amount === 0 || txData.amount === '0') && txData.metadata) {
          try {
            let metadataAmount = null;
            
            if (txData.metadata instanceof Map) {
              metadataAmount = txData.metadata.get('amount');
            } else {
              metadataAmount = txData.metadata.amount;
            }
            
            if (metadataAmount) {
              const parsedAmount = parseFloat(metadataAmount);
              if (!isNaN(parsedAmount)) {
                txData.amount = parsedAmount;
                console.log(`Adjusted amount for transaction ${txData._id} from 0 to ${parsedAmount}`);
              }
            }
          } catch (parseError) {
            console.error(`Error parsing metadata amount for transaction ${txData._id}:`, parseError);
          }
        }
        
        return txData;
      });
      
      res.status(200).json({
        success: true,
        data: enhancedTransactions
      });
    } catch (error) {
      console.error('Error getting recent transactions:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving recent transactions',
        error: error.message
      });
    }
  }

  // Get transaction by ID
  async getTransactionById(req, res) {
    try {
      console.log('Getting transaction by ID:', req.params.id);
      
      const { id } = req.params;
      
      const transaction = await Transaction.findById(id)
        .populate('userId', 'username email');
        
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }
      
      console.log('Found transaction:', transaction._id);
      
      const transactionData = transaction.toObject();
      
      // Function to format receipt URL
      const formatReceiptUrl = (url, req) => {
        if (!url) return null;
        
        // If it's already a full URL, return it
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
        
        // If it's a relative path, create full URL
        const protocol = req.protocol;
        const host = req.get('host');
        return `${protocol}://${host}${url.startsWith('/') ? '' : '/'}${url}`;
      };
      
      // Check for purchase with receipt URL
      let receiptUrl = null;
      let customerName = null;
      let customerPhone = null;
      let customerLocation = null;
      
      // Check if the transaction has a purchase reference in metadata
      if (transaction.metadata && transaction.metadata.purchaseId) {
        try {
      const Purchase = require('../models/purchase.model');
          
          // Make sure we have the Purchase model properly
          const purchaseModel = typeof Purchase === 'object' && Purchase.hasOwnProperty('default') 
            ? Purchase.default 
            : Purchase;
            
          const purchase = await purchaseModel.findById(transaction.metadata.purchaseId);
          
          if (purchase && purchase.receiptUrl) {
            receiptUrl = formatReceiptUrl(purchase.receiptUrl, req);
            console.log(`Found receipt URL from purchase: ${receiptUrl}`);
            
            // Get customer info if available
            if (purchase.customerInfo) {
              customerName = purchase.customerInfo.name;
              customerPhone = purchase.customerInfo.phone;
              customerLocation = purchase.customerInfo.location;
            }
          }
        } catch (purchaseError) {
          console.error('Error getting purchase for transaction:', purchaseError);
        }
      }
      
      // If not found in purchase, check transaction metadata
      if (!receiptUrl && transaction.metadata && transaction.metadata.receiptUrl) {
        receiptUrl = formatReceiptUrl(transaction.metadata.receiptUrl, req);
        console.log(`Found receipt URL from metadata: ${receiptUrl}`);
      }
      
      // Get user name from transaction metadata if available
      if (!customerName && transaction.metadata) {
        // Use displayName if available (specifically set for admin dashboard)
        if (transaction.metadata.displayName) {
          customerName = transaction.metadata.displayName;
        } else if (transaction.metadata.userName) {
          customerName = transaction.metadata.userName;
        }
        
        // Get other user details if available
        if (transaction.metadata.userPhone) {
          customerPhone = transaction.metadata.userPhone;
        }
        if (transaction.metadata.userLocation) {
          customerLocation = transaction.metadata.userLocation;
        }
      }
      
      // If no user name found but we have a user object with username, use that
      if (!customerName && transactionData.userId && transactionData.userId.username) {
        customerName = transactionData.userId.username;
      }
      
      // If still no user name, provide a default
      if (!customerName) {
        customerName = "No user";
      }
      
      // Add user information to transaction data
      transactionData.customerName = customerName;
      transactionData.customerPhone = customerPhone;
      transactionData.customerLocation = customerLocation;
      
      // Add wallet address
      if (transaction.fromAddress) {
        transactionData.walletAddress = transaction.fromAddress;
      } else if (transaction.userId && transaction.userId.walletAddress) {
        transactionData.walletAddress = transaction.userId.walletAddress;
      } else if (transaction.type === 'WITHDRAW' && transaction.metadata) {
        // For withdrawal transactions, check metadata for wallet address
        const metadataWalletAddress = transaction.metadata.walletAddress;
        if (metadataWalletAddress) {
          transactionData.walletAddress = metadataWalletAddress;
          console.log(`Found wallet address in metadata for withdrawal ${transaction._id}: ${metadataWalletAddress}`);
        }
      }
      
      // Keep userName for backward compatibility
      transactionData.userName = customerName;
      
      // Adjust amount if it's 0 and metadata contains amount
      if ((transactionData.amount === '0' || transactionData.amount === 0) && transaction.metadata && transaction.metadata.amount) {
        try {
          transactionData.amount = transaction.metadata.amount;
          console.log(`Adjusted amount for transaction ${id} from 0 to ${transaction.metadata.amount}`);
        } catch (parseError) {
          console.error(`Error parsing metadata amount for transaction ${id}:`, parseError);
        }
      }
      
      // Add receipt URL to transaction data
      transactionData.receiptUrl = receiptUrl;
      
      return res.status(200).json({
        success: true,
        data: transactionData
      });
    } catch (error) {
      console.error('Error getting transaction by ID:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving transaction',
        error: error.message
      });
    }
  }

  // Get all purchase requests
  async getAllPurchases(req, res) {
    try {
      const Purchase = require('../models/purchase.model');
      const purchases = await Purchase.find()
        .sort({ createdAt: -1 });
      
      res.json(purchases);
    } catch (error) {
      console.error('Error fetching purchases:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch purchases' 
      });
    }
  }

  // Get purchase by ID
  async getPurchaseById(req, res) {
    try {
      const Purchase = require('../models/purchase.model');
      const purchase = await Purchase.findById(req.params.id);
      
      if (!purchase) {
        return res.status(404).json({ 
          success: false, 
          message: 'Purchase not found' 
        });
      }
      
      res.json(purchase);
    } catch (error) {
      console.error('Error fetching purchase:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch purchase' 
      });
    }
  }

  // Update transaction status
  async updateTransaction(req, res) {
    try {
      const { status } = req.body;
      const transaction = await Transaction.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).populate('userId', 'email walletAddress');
      if (!transaction) {
        return res.status(404).json({ message: 'Transaction not found' });
      }
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Approve transaction
  async approveTransaction(req, res) {
    try {
      // Use writeConcern majority to ensure write is acknowledged by majority of nodes
      const transaction = await Transaction.findByIdAndUpdate(
        req.params.id,
        { 
          status: 'APPROVED', 
          updatedAt: Date.now()
        },
        { 
          new: true,
          writeConcern: { w: 'majority', j: true }, // Wait for journal commit on majority of nodes
          readPreference: 'primary' // Ensure we're writing to primary
        }
      ).populate('userId', 'email walletAddress');
      
      if (!transaction) {
        return res.status(404).json({ message: 'Transaction not found' });
      }
      
      console.log(`Transaction ${req.params.id} approved successfully with status: ${transaction.status}`);
      
      // Convert metadata to a regular object if it's a Map
      let metadata = {};
      if (transaction.metadata instanceof Map) {
        metadata = Object.fromEntries(transaction.metadata);
        console.log(`[Approve] Converting Map metadata to object for status update`);
      } else if (typeof transaction.metadata === 'object' && transaction.metadata !== null) {
        metadata = transaction.metadata;
        console.log(`[Approve] Using object metadata directly for status update`);
      }
      
      // Emit event for real-time notification - ensure transactionType is preserved
      EventBus.emitTransactionUpdate(transaction.userId, {
        transactionId: transaction._id.toString(),
        status: transaction.status,
        type: transaction.type, // This is the actual transaction type (BUY/SELL)
        amount: transaction.amount,
        updatedAt: transaction.updatedAt,
        metadata: metadata // Include metadata in the event
      });
      
      // Clear any query cache that might exist using a safer approach
      // This forces other queries to see the fresh data
      try {
        // Use a simpler approach to refresh cache without using read('primary')
        if (mongoose.connection.db) {
          // Simply perform a findOne operation directly with the native driver
          await mongoose.connection.db.collection('transactions').findOne(
            { _id: new mongoose.Types.ObjectId(req.params.id) }
          );
          
          // Force a refresh by doing a count operation as well
          await mongoose.connection.db.collection('transactions').countDocuments(
            { status: 'APPROVED' }
          );
        }
      } catch (cacheError) {
        console.warn('Could not refresh local query cache:', cacheError);
      }
      
      res.json(transaction);
    } catch (error) {
      console.error('Error approving transaction:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
  
  // Reject transaction
  async rejectTransaction(req, res) {
    try {
      // Use writeConcern majority to ensure write is acknowledged by majority of nodes
      const transaction = await Transaction.findByIdAndUpdate(
        req.params.id,
        { 
          status: 'REJECTED', 
          updatedAt: Date.now(),
          rejectionReason: req.body.rejectionReason || 'No reason provided'
        },
        { 
          new: true,
          writeConcern: { w: 'majority', j: true }, // Wait for journal commit on majority of nodes
          readPreference: 'primary' // Ensure we're writing to primary
        }
      ).populate('userId', 'email walletAddress');
      
      if (!transaction) {
        return res.status(404).json({ message: 'Transaction not found' });
      }
      
      console.log(`Transaction ${req.params.id} rejected successfully with status: ${transaction.status}`);
      
      // Convert metadata to a regular object if it's a Map
      let metadata = {};
      if (transaction.metadata instanceof Map) {
        metadata = Object.fromEntries(transaction.metadata);
        console.log(`[Reject] Converting Map metadata to object for status update`);
      } else if (typeof transaction.metadata === 'object' && transaction.metadata !== null) {
        metadata = transaction.metadata;
        console.log(`[Reject] Using object metadata directly for status update`);
      }
      
      // Emit event for real-time notification with metadata - ensure transactionType is preserved
      EventBus.emitTransactionUpdate(transaction.userId, {
        transactionId: transaction._id.toString(),
        status: transaction.status,
        type: transaction.type, // This is the actual transaction type (BUY/SELL)
        amount: transaction.amount,
        updatedAt: transaction.updatedAt,
        reason: req.body.rejectionReason || 'No reason provided',
        metadata: metadata // Include metadata in the event
      });
      
      // Clear any query cache that might exist using a safer approach
      // This forces other queries to see the fresh data
      try {
        // Use a simpler approach to refresh cache without using read('primary')
        if (mongoose.connection.db) {
          // Simply perform a findOne operation directly with the native driver
          await mongoose.connection.db.collection('transactions').findOne(
            { _id: new mongoose.Types.ObjectId(req.params.id) }
          );
          
          // Force a refresh by doing a count operation as well
          await mongoose.connection.db.collection('transactions').countDocuments(
            { status: 'REJECTED' }
          );
        }
      } catch (cacheError) {
        console.warn('Could not refresh local query cache:', cacheError);
      }
      
      res.json(transaction);
    } catch (error) {
      console.error('Error rejecting transaction:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Update rejection reason
  async updateRejectionReason(req, res) {
    try {
      const { rejectionReason } = req.body;
      
      if (!rejectionReason) {
        return res.status(400).json({ 
          success: false, 
          message: 'Rejection reason is required' 
        });
      }
      
      // Find the transaction and update
      const transaction = await Transaction.findById(req.params.id);
      
      if (!transaction) {
        return res.status(404).json({ 
          success: false, 
          message: 'Transaction not found' 
        });
      }
      
      // Store the rejection reason in two places:
      // 1. In the transaction rejectionReason field
      transaction.rejectionReason = rejectionReason;
      
      // 2. In the metadata for consistent access pattern with mobile app
      if (!transaction.metadata) {
        transaction.metadata = new Map();
      }
      
      // Ensure metadata is a Map
      if (!(transaction.metadata instanceof Map)) {
        const entries = Object.entries(transaction.metadata);
        transaction.metadata = new Map(entries);
      }
      
      // Add/update the rejectionReason in metadata
      transaction.metadata.set('rejectionReason', rejectionReason);
      
      await transaction.save();
      
      console.log(`Updated rejection reason for transaction ${req.params.id}`);
      
      // Convert metadata to a regular object if it's a Map
      let metadata = {};
      if (transaction.metadata instanceof Map) {
        metadata = Object.fromEntries(transaction.metadata);
      } else if (typeof transaction.metadata === 'object' && transaction.metadata !== null) {
        metadata = transaction.metadata;
      }
      
      // Emit event for real-time notification with updated reason
      if (transaction.userId) {
        EventBus.emitTransactionUpdate(transaction.userId, {
          transactionId: transaction._id.toString(),
          status: transaction.status,
          type: transaction.type,
          amount: transaction.amount,
          updatedAt: transaction.updatedAt,
          reason: rejectionReason,
          metadata: metadata // Include metadata in the event
        });
      }
      
      res.json({ 
        success: true, 
        message: 'Rejection reason updated successfully',
        transaction
      });
    } catch (error) {
      console.error('Error updating rejection reason:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Server error', 
        error: error.message 
      });
    }
  }

  // Update transaction remittance number
  async updateRemittanceNumber(req, res) {
    try {
      console.log(`Updating remittance number for transaction ${req.params.id} to ${req.body.remittanceNumber}`);
      
      const { remittanceNumber } = req.body;
      
      if (!remittanceNumber) {
        return res.status(400).json({ 
          success: false,
          message: 'Remittance number is required' 
        });
      }
      
      // Find the transaction
      const transaction = await Transaction.findById(req.params.id);
      
      if (!transaction) {
        return res.status(404).json({ 
          success: false,
          message: 'Transaction not found' 
        });
      }
      
      // Update the metadata with remittance number - handling both Map and Object scenarios
      if (transaction.metadata instanceof Map) {
        // If it's a Map (MongoDB native storage)
        transaction.metadata.set('remittanceNumber', remittanceNumber);
      } else if (typeof transaction.metadata === 'object' && transaction.metadata !== null) {
        // If it's a plain object
        transaction.metadata.remittanceNumber = remittanceNumber;
      } else {
        // If metadata doesn't exist or isn't a Map or Object, create a new structure
        // First try to convert from a non-object if it exists
        let existingMetadata = {};
        if (transaction.metadata) {
          try {
            if (typeof transaction.metadata === 'string') {
              existingMetadata = JSON.parse(transaction.metadata);
            }
          } catch (e) {
            console.log('Error parsing existing metadata string:', e);
          }
        }
        
        // Use Map for MongoDB schema compliance
        const newMetadata = new Map(Object.entries(existingMetadata));
        newMetadata.set('remittanceNumber', remittanceNumber);
        transaction.metadata = newMetadata;
      }
      
      // Save the transaction
      await transaction.save();
      
      console.log(`Remittance number updated for transaction ${req.params.id}`);
      
      // For debugging - Log the actual structure that was saved
      let metadataDebug;
      if (transaction.metadata instanceof Map) {
        metadataDebug = Object.fromEntries(transaction.metadata);
      } else {
        metadataDebug = transaction.metadata;
      }
      console.log(`DEBUG - Updated metadata structure:`, JSON.stringify(metadataDebug, null, 2));
      
      // Emit event to notify clients about the remittance number update
      EventBus.emitTransactionUpdate(transaction.userId, {
        transactionId: transaction._id.toString(),
        status: transaction.status, // Include current status
        type: 'REMITTANCE_UPDATE', // Special event type for remittance updates
        metadata: metadataDebug, // Include the full metadata
        remittanceNumber: remittanceNumber // Explicitly include the remittance number
      });
      
      res.json({
        success: true,
        message: 'Remittance number updated successfully',
        transaction: {
          _id: transaction._id,
          remittanceNumber: remittanceNumber
        }
      });
    } catch (error) {
      console.error('Error updating remittance number:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error updating remittance number',
        error: error.message 
      });
    }
  }

  // Get all users
  async getAllUsers(req, res) {
    try {
      console.log('==== GET ALL USERS DEBUG ====');
      console.log('DEBUG: Attempting to fetch all users');
      
      // Check if User model is available
      if (!User) {
        console.error('DEBUG: User model is not defined');
        return res.status(500).json({ message: 'Server configuration error' });
      }
      
      // Log MongoDB connection state
      console.log('DEBUG: MongoDB connection state:', mongoose.connection.readyState);
      
      // Attempt to fetch users
      const users = await User.find().select('-password');
      console.log('DEBUG: Successfully fetched users:', users.length);
      
      res.json(users);
    } catch (error) {
      console.error('DEBUG: Error fetching users:', error);
      console.error('DEBUG: Error stack:', error.stack);
      res.status(500).json({ message: 'Server error', details: error.message });
    }
    console.log('==== END GET ALL USERS DEBUG ====');
  }

  // Get user by ID
  async getUserById(req, res) {
    try {
      const user = await User.findById(req.params.id).select('-password');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }

  // Update user status
  async updateUserStatus(req, res) {
    try {
      const { status } = req.body;
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).select('-password');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }  // Added missing closing brace for updateUserStatus

  async deleteUser(req, res) {
    try {
      const userId = req.params.id;
      
      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Delete user
      await User.findByIdAndDelete(userId);
      
      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }

  async addPublicAddress(req, res) {
    try {
      const { address, network = 'ETH' } = req.body;

      const existingAddress = await PublicAddress.findOne({ address });
      if (existingAddress) {
        return res.status(400).json({ message: 'Address already exists' });
      }

      const newAddress = new PublicAddress({
        address,
        network,
        status: 'available'
      });

      await newAddress.save();

      return res.status(201).json({
        message: 'Public address added successfully',
        address: newAddress
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to add public address',
        error: error.message
      });
    }
  }

  /**
   * Get all public addresses with their status
   */
  async getAllPublicAddresses(req, res) {
    try {
      const addresses = await PublicAddress.find()
        .populate('userId', 'phoneNumber name');

      return res.status(200).json(addresses);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to fetch public addresses',
        error: error.message
      });
    }
  }

  /**
   * Get available public addresses
   */
  async getAvailableAddresses(req, res) {
    try {
      const addresses = await AddressService.getAvailableAddresses();
      return res.status(200).json(addresses);
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to fetch available addresses',
        error: error.message
      });
    }
  }

  /**
   * Manually assign a public address to a user
   */
  async assignAddressToUser(req, res) {
    try {
      const { userId, addressId } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // If user already has an address, release it first
      if (user.publicAddress) {
        await AddressService.releaseAddress(userId);
      }

      const address = await PublicAddress.findById(addressId);
      if (!address || address.status === 'assigned') {
        return res.status(400).json({ message: 'Address not available' });
      }

      address.status = 'assigned';
      address.userId = userId;
      await address.save();

      user.publicAddress = address._id;
      await user.save();

      return res.status(200).json({
        message: 'Address assigned successfully',
        address
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to assign address',
        error: error.message
      });
    }
  }

  /**
   * Release a public address from a user
   */
  async releaseAddress(req, res) {
    try {
      const { userId } = req.params;
      const releasedAddress = await AddressService.releaseAddress(userId);

      if (!releasedAddress) {
        return res.status(404).json({ message: 'No address found for user' });
      }

      return res.status(200).json({
        message: 'Address released successfully',
        address: releasedAddress
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Failed to release address',
        error: error.message
      });
    }
  }

  // Manually assign public address to user
  async assignPublicAddressToUser(req, res) {
    try {
      const { userId } = req.params;
      const { addressId } = req.body;

      console.log(`[AdminController] Attempting to assign address ${addressId} to user ${userId}`);

      // Find the user
      const user = await User.findById(userId);
      if (!user) {
        console.log(`[AdminController] User ${userId} not found`);
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Find the public address
      const publicAddress = await PublicAddress.findById(addressId);
      if (!publicAddress) {
        console.log(`[AdminController] Public address ${addressId} not found`);
        return res.status(404).json({
          success: false,
          message: 'Public address not found'
        });
      }

      // Check if address is available
      if (!publicAddress.isAvailable()) {
        console.log(`[AdminController] Public address ${addressId} is not available`);
        return res.status(400).json({
          success: false,
          message: 'Public address is not available'
        });
      }

      try {
        // Assign the address to the user using the model method
        await publicAddress.assignToUser(user._id);
        console.log(`[AdminController] Successfully assigned address ${publicAddress.address} to user ${userId}`);

        // Update user's public address reference with correct structure
        user.publicAddress = {
          addressId: publicAddress._id,
          address: publicAddress.address
        };
        await user.save();
        console.log(`[AdminController] Updated user's publicAddress reference to ${publicAddress._id}`);

        res.json({
          success: true,
          message: 'Public address assigned successfully',
          data: {
            user: {
              id: user._id,
              phoneNumber: user.phoneNumber,
              publicAddress: publicAddress.address
            }
          }
        });
      } catch (assignError) {
        console.error('[AdminController] Error during address assignment:', assignError);
        res.status(500).json({
          success: false,
          message: 'Failed to assign public address'
        });
      }
    } catch (error) {
      console.error('[AdminController] Error in assignPublicAddressToUser:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign public address'
      });
    }
  }
}

module.exports = new AdminController(); 