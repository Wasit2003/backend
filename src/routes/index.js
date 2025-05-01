const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const authRoutes = require('./auth.routes');
const adminRoutes = require('./admin.routes');
const userRoutes = require('./user.routes');
const purchaseRoutes = require('./purchase.routes');
const uploadMiddleware = require('../middleware/upload.middleware');
const authMiddleware = require('../middleware/auth.middleware');
const path = require('path');
const fs = require('fs');
const { uploadToStorage } = require('../utils/storage');
const { sendNotification } = require('../utils/notifications');
const { Transaction } = require('../models/transaction.model');
const { User } = require('../models/user.model');
const { PublicAddress } = require('../models/public-address.model');
const EventBus = require('../utils/eventBus');

// Add a logging function
const logDirectUpload = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [RECEIPT_UPLOAD] [DIRECT_ROUTE] ${message} ${JSON.stringify(data)}`;
  
  console.log(logMessage);
  
  // Write to log file
  const logDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'uploadlogs.txt');
  fs.appendFileSync(logFile, logMessage + '\n');
};

console.log('🔧 DEBUG: Loading main routes module...');

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/user', userRoutes);
router.use('/purchases', purchaseRoutes);

// Debug middleware to inspect upload requests
router.use('/upload', (req, res, next) => {
  console.log('DEBUG_BODY: Upload endpoint request body fields:', req.body ? Object.keys(req.body) : 'No body');
  console.log('DEBUG_BODY: Upload endpoint request query:', req.query);
  console.log('DEBUG_BODY: Upload endpoint walletAddress in body:', req.body?.walletAddress);
  console.log('DEBUG_BODY: Upload endpoint walletAddress in query:', req.query?.walletAddress);
  
  // Add more detailed debugging for all form fields
  if (req.body) {
    console.log('DEBUG_FORM: All request body fields:');
    for (const key in req.body) {
      console.log(`DEBUG_FORM:   - ${key}: ${req.body[key]}`);
    }
  }
  
  if (req.file) {
    console.log('DEBUG_BODY: Upload endpoint request file:', req.file.filename);
  }
  next();
});

// Enhanced transaction status endpoint - no auth required for easier access
router.get('/transaction/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Checking transaction status for ID: ${id}`);
    
    let transaction;
    
    // Check if this is a MongoDB ObjectId or a client UUID
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    
    if (isObjectId) {
      console.log(`Looking up transaction by MongoDB ObjectId: ${id}`);
      transaction = await Transaction.findById(id);
    } else {
      console.log(`Looking up transaction by client UUID or metadata: ${id}`);
      // Look for the ID in metadata fields
      transaction = await Transaction.findOne({
        $or: [
          { 'metadata.sellId': id },
          { 'metadata.clientUuid': id },
          { 'metadata.transactionId': id }
        ]
      });
    }

    if (!transaction) {
      console.log(`Transaction not found for ID: ${id}`);
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    // Convert transaction to a plain object
    const transactionObj = transaction.toObject();
    
    // Process metadata to convert from Map to plain object
    let metadata = {};
    if (transaction.metadata) {
      console.log(`Processing metadata for transaction ${transaction._id}`);
      
      if (transaction.metadata instanceof Map) {
        // Convert Map to object
        transaction.metadata.forEach((value, key) => {
          // Log user-related metadata fields specifically
          if (['userName', 'userPhone', 'userLocation', 'displayName', 'paymentGateway', 'remittanceNumber', 'networkFee', 'baseSypAmount', 'totalSypAmount'].includes(key)) {
            console.log(`Found important field in metadata: ${key} = ${value}`);
          }
          metadata[key] = value;
        });
      } else if (typeof transaction.metadata === 'object') {
        metadata = { ...transaction.metadata };
        
        // Log important metadata fields in the object form too
        ['userName', 'userPhone', 'userLocation', 'displayName', 'paymentGateway', 'remittanceNumber', 'networkFee', 'baseSypAmount', 'totalSypAmount'].forEach(key => {
          if (metadata[key]) {
            console.log(`Found important field in object metadata: ${key} = ${metadata[key]}`);
          }
        });
      }
      
      // Log the extracted metadata fields
      console.log(`Processed metadata fields: ${Object.keys(metadata).join(', ')}`);
    }
    
    // Format transaction object for response
    const response = {
      _id: transaction._id,
      id: transaction._id, // Include both formats for compatibility
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      createdAt: transaction.createdAt,
      metadata: metadata
    };
    
    // ADDED: Explicitly include SYP amount values in the response when available in metadata
    // These are critical for correct display in the mobile app, especially for rejected transactions
    if (metadata.baseSypAmount) {
      console.log(`Including baseSypAmount in response: ${metadata.baseSypAmount}`);
      response.baseSypAmount = metadata.baseSypAmount;
    }
    
    if (metadata.totalSypAmount) {
      console.log(`Including totalSypAmount in response: ${metadata.totalSypAmount}`);
      response.totalSypAmount = metadata.totalSypAmount;
    }
    
    // Include exchange rate if available
    if (metadata.exchangeRate) {
      console.log(`Including exchangeRate in response: ${metadata.exchangeRate}`);
      response.exchangeRate = metadata.exchangeRate;
    }
    
    // Include rejection reason if available (from two possible sources)
    if (transaction.status === 'REJECTED') {
      // First check direct field (schema field)
      if (transaction.rejectionReason) {
        response.rejectionReason = transaction.rejectionReason;
      } 
      // Then check in metadata
      else if (metadata.rejectionReason) {
        response.rejectionReason = metadata.rejectionReason;
      }
      else {
        response.rejectionReason = 'No reason provided';
      }
    }
    
    // Include txHash if available
    if (transaction.txHash) {
      response.txHash = transaction.txHash;
    }
    
    console.log(`Successfully retrieved transaction status: ${transaction.status}`);
    res.json(response);
  } catch (error) {
    console.error('Error getting transaction status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// NEW DEBUG ENDPOINT: Simple upload route with minimal processing
// Added for mobile client compatibility
router.post('/upload', uploadMiddleware, async (req, res) => {
  try {
    const file = req.file;
    
    // If no file uploaded
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    // Get purchase ID from body
    const { 
      purchaseId, 
      amount, 
      userName, 
      userPhone, 
      userLocation,
      paymentGateway,
      totalSypAmount,
      baseSypAmount,
      walletAddress, // Add wallet address parameter
    } = req.body;
    
    // Try to get wallet address from query params if not in body
    const finalWalletAddress = walletAddress || req.query.walletAddress;
    
    console.log('DEBUG_GATEWAY: Upload request with gateway:', paymentGateway);
    console.log('DEBUG_SYP: Upload request with totalSypAmount:', totalSypAmount);
    console.log('DEBUG_SYP: Upload request with baseSypAmount:', baseSypAmount);
    console.log('DEBUG_WALLET: Upload request with walletAddress:', finalWalletAddress);
    console.log('DEBUG_WALLET: Request body fields:', Object.keys(req.body));
    console.log('DEBUG_WALLET: Request body walletAddress:', req.body.walletAddress);
    
    // Add more detailed debugging
    console.log('DEBUG_FORM: Full form data fields:', req.body);
    console.log('DEBUG_WALLET: Checking all request properties for walletAddress:');
    for (const key in req.body) {
      console.log(`DEBUG_WALLET: Checking body field [${key}]: ${req.body[key]}`);
      if (key.toLowerCase().includes('wallet')) {
        console.log(`DEBUG_WALLET: Found potential wallet field: ${key}=${req.body[key]}`);
      }
    }
    
    logDirectUpload('File upload request received', { 
      purchaseId, 
      fileName: file.filename,
      tempPath: file.path,
      amount,
      userName,
      paymentGateway,
      totalSypAmount,
      baseSypAmount,
      walletAddress: finalWalletAddress, // Log wallet address
    });
    
    // Check for file
    if (!req.file) {
      logDirectUpload('❌ DEBUG UPLOAD: No file received in request');
      return res.status(400).json({
        success: false,
        message: 'No file received in upload request'
      });
    }
    
    // Log file details
    logDirectUpload('✅ DEBUG UPLOAD: File received successfully', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
    // Get additional request details with different variable names to avoid redeclaration
    const { 
      userName: requestUserName,
      userPhone: requestUserPhone,
      userLocation: requestUserLocation,
      paymentGateway: requestPaymentGateway,
      totalSypAmount: requestTotalSypAmount
    } = req.body;
    
    // Add detailed logging for userName specifically
    logDirectUpload('DEBUG UPLOAD: User information received', {
      userName: requestUserName || 'NOT PROVIDED',
      userPhone: requestUserPhone || 'NOT PROVIDED',
      userLocation: requestUserLocation || 'NOT PROVIDED',
      paymentGateway: requestPaymentGateway || 'NOT PROVIDED',
      totalSypAmount: requestTotalSypAmount || 'NOT PROVIDED',
      walletAddress: finalWalletAddress || 'NOT PROVIDED', // Add wallet address logging
      bodyKeys: Object.keys(req.body)
    });
    
    // Additional debug info
    logDirectUpload('DEBUG UPLOAD: Additional request details', {
      method: req.method,
      url: req.originalUrl,
      headers: {
        'content-type': req.get('Content-Type'),
        'content-length': req.get('Content-Length'),
        'authorization': req.get('Authorization') ? 'Bearer [PRESENT]' : '[MISSING]'
      },
      body: req.body
    });
    
    // If purchaseId is provided, find the purchase and connect the receipt to it
    if (purchaseId) {
      try {
        // Properly import Purchase model - it's exported directly, not as an object
        const Purchase = require('../models/purchase.model');
        const Transaction = require('../models/transaction.model');
        
        // Debug: Show all recent purchases in the system
        const recentPurchases = await Purchase.find().sort({createdAt: -1}).limit(5);
        logDirectUpload('DEBUG: Recent purchases in database', {
          count: recentPurchases.length,
          purchases: recentPurchases.map(p => ({
            id: p._id,
            createdAt: p.createdAt,
            userId: p.userId,
            status: p.status
          }))
        });
        
        // Assuming purchaseId starts with "purchase_", extract the timestamp
        const purchaseIdTimestamp = purchaseId.startsWith('purchase_') ? 
          purchaseId.replace('purchase_', '') : purchaseId;
          
        logDirectUpload('DEBUG: Looking for purchase by timestamp', {
          originalPurchaseId: purchaseId,
          extractedTimestamp: purchaseIdTimestamp,
          timestampDate: new Date(parseInt(purchaseIdTimestamp)),
          searchRange: [
            new Date(parseInt(purchaseIdTimestamp) - 10000),
            new Date(parseInt(purchaseIdTimestamp) + 10000)
          ]
        });
        
        // Find the most recent purchase for this timestamp (client-side generated ID)
        const purchase = await Purchase.findOne({
          createdAt: {
            // Search around the timestamp with some buffer (±10 seconds)
            $gte: new Date(parseInt(purchaseIdTimestamp) - 10000),
            $lte: new Date(parseInt(purchaseIdTimestamp) + 10000)
          }
        }).sort({ createdAt: -1 });
        
        if (purchase) {
          logDirectUpload('Found purchase for upload, connecting receipt to transaction', { 
            purchaseId, 
            status: purchase.status,
            userId: purchase.userId,
            amount: amount,
            walletAddress: finalWalletAddress // Add wallet address 
          });
          
          // Process the receipt and connect it to the purchase/transaction
          return processPurchaseReceipt(purchase, req.file, res, amount, userName, userPhone, userLocation, paymentGateway, totalSypAmount, baseSypAmount, finalWalletAddress);
        } else {
          logDirectUpload('⚠️ WARNING: Purchase not found for upload by timestamp', { purchaseId });
          
          // FALLBACK: If purchase not found by timestamp, try to create a transaction directly
          try {
            logDirectUpload('ATTEMPTING FALLBACK: Creating direct transaction from receipt upload');
            
            // Get the user ID from the JWT token
            const token = req.headers.authorization?.split(' ')[1];
            let userId = null;
            
            if (token) {
              try {
                const jwt = require('jsonwebtoken');
                // Use process.env directly instead of trying to import from config
                const JWT_SECRET = process.env.JWT_SECRET || 'your_secure_jwt_secret_here';
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.userId;
                logDirectUpload('Extracted userId from token', { userId });
              } catch (e) {
                logDirectUpload('Error extracting userId from token', { error: e.message });
              }
            }
            
            if (!userId) {
              // Try to get a valid user from the database as fallback 
              try {
                const { User } = require('../models/user.model');
                // Try to find an existing user by phone or just get the most recent one
                const user = await User.findOne().sort({createdAt: -1});
                
                if (user) {
                  userId = user._id;
                  logDirectUpload('Found fallback user for transaction', { userId, phone: user.phone });
                } else {
                  logDirectUpload('No users found in database for fallback');
                  throw new Error('No users available in database');
                }
              } catch (userError) {
                logDirectUpload('Error finding fallback user', { error: userError.message });
                throw new Error('Could not find any user for transaction');
              }
            }
            
            if (!userId) {
              logDirectUpload('No userId available for fallback transaction creation');
              throw new Error('No user ID available');
            }
            
            // Create a new transaction directly
            const user = await User.findById(userId);
            
            if (!user) {
              logDirectUpload('User not found for fallback transaction', { userId });
              throw new Error('User not found');
            }
            
            logDirectUpload('Found user for fallback transaction', { 
              userId, 
              phone: user.phone,
              walletAddress: finalWalletAddress || 'unknown' // Use passed wallet address
            });
            
            // Create a temporary purchase with the provided data
            const tempPurchase = {
              _id: purchaseId,
              userId: userId,
              status: 'initiated',
              usdtAmount: amount ? parseFloat(amount) : 0,
              walletAddress: finalWalletAddress, // Store the BEP20 wallet address
              save: async () => {} // Stub save method for processPurchaseReceipt
            };
            
            // Process the receipt with this temporary purchase
            return processPurchaseReceipt(
              tempPurchase, 
              req.file, 
              res, 
              amount, 
              userName, 
              userPhone, 
              userLocation,
              paymentGateway,
              totalSypAmount,
              baseSypAmount,
              finalWalletAddress // Pass through the wallet address
            );
          } catch (fallbackError) {
            logDirectUpload('Error in fallback process:', { 
              error: fallbackError.message, 
              stack: fallbackError.stack 
            });
            
            return res.status(500).json({
              success: false,
              message: 'Error processing receipt and creating transaction',
              error: fallbackError.message
            });
          }
        }
      } catch (error) {
        logDirectUpload('Error in upload handler:', { 
          error: error.message, 
          stack: error.stack 
        });
        
        return res.status(500).json({
          success: false,
          message: 'Error processing file upload',
          error: error.message
        });
      }
    } else {
      // If no purchaseId provided, create a simple response for file upload
      return res.status(200).json({
        success: true,
        message: 'File uploaded successfully, but no purchase ID provided',
        file: {
          filename: req.file.filename,
          path: req.file.path
        }
      });
    }
  } catch (error) {
    logDirectUpload('Unexpected error in direct upload', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error processing direct upload',
      error: error.message
    });
  }
});

// Direct upload routes
router.post('/direct-upload', uploadMiddleware, async (req, res) => {
  try {
    // Add CORS headers for upload
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    
    // Get parameters from request
    const { 
      userName, 
      userPhone, 
      userLocation, 
      amount, 
      paymentGateway,
      totalSypAmount,
      baseSypAmount,
      walletAddress,  // Add wallet address parameter
    } = req.body;
    
    console.log('DEBUG_UPLOAD: Direct upload request received', {
      hasFile: !!req.file,
      contentType: req.get('Content-Type'),
      bodyFields: Object.keys(req.body)
    });
    
    console.log('DEBUG_WALLET: Direct upload request with walletAddress:', walletAddress);
    
    // Log receipt upload request
    logDirectUpload('Direct upload request received', {
      fileName: req.file?.filename,
      userName,
      userPhone,
      userLocation,
      amount,
      paymentGateway,
      totalSypAmount,
      baseSypAmount,
      walletAddress, // Log wallet address
      requestBody: Object.keys(req.body)
    });
    
    // Validate file
    const file = req.file;
    if (!file) {
      console.error('DEBUG_UPLOAD: No file received in direct upload request');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    logDirectUpload('File received', { filename: file.filename, path: file.path });
    
    // If purchaseId is provided, find the purchase and update it
    if (purchaseId) {
      try {
        const { Purchase } = require('../models/purchase.model');
        const purchase = await Purchase.findById(purchaseId);
        
        if (purchase) {
          logDirectUpload('Found purchase for direct upload', { 
            purchaseId, 
            status: purchase.status,
            userId: purchase.userId 
          });
          
          return processPurchaseReceipt(purchase, file, res, amount, userName, userPhone, userLocation, paymentGateway, totalSypAmount, baseSypAmount);
        } else {
          logDirectUpload('Purchase not found for direct upload', { purchaseId });
        }
      } catch (purchaseError) {
        logDirectUpload('Error finding purchase', { 
          purchaseId, 
          error: purchaseError.message,
          stack: purchaseError.stack 
        });
      }
    }
    
    // If we get here, either there's no purchaseId or the purchase wasn't found
    // Upload the file to storage
    let receiptUrl;
    try {
      receiptUrl = await uploadToStorage(file);
      logDirectUpload('Standalone receipt uploaded to storage', { receiptUrl });
    } catch (storageError) {
      logDirectUpload('Storage upload failed for standalone receipt', { 
        error: storageError.message,
        stack: storageError.stack 
      });
      
      return res.status(200).json({
        success: true,
        message: 'File uploaded but failed to process for storage',
        error: storageError.message,
        file: {
          filename: file.filename,
          path: file.path
        }
      });
    }
    
    // Create a transaction for this receipt
    try {
      const { Transaction } = require('../models/transaction.model');
      const { ObjectId } = require('mongoose').Types;
      
      // Validate and convert userId
      let validUserId = null;
      if (userId) {
        try {
          validUserId = new ObjectId(userId);
          logDirectUpload('Converted userId to ObjectId', { userId, validUserId });
        } catch (idError) {
          logDirectUpload('Error converting userId to ObjectId', { 
            userId, 
            error: idError.message 
          });
        }
      }
      
      // Get admin user as fallback
      if (!validUserId) {
        const { User } = require('../models/user.model');
        try {
          const adminUser = await User.findOne({ isAdmin: true });
          if (adminUser) {
            validUserId = adminUser._id;
            logDirectUpload('Using admin user ID as fallback', { adminUserId: validUserId });
          } else {
            // Create a valid ObjectId as last resort
            validUserId = new ObjectId();
            logDirectUpload('Created new ObjectId as fallback', { newUserId: validUserId });
          }
        } catch (userError) {
          logDirectUpload('Error finding admin user', { error: userError.message });
          // Create a valid ObjectId as last resort
          validUserId = new ObjectId();
          logDirectUpload('Created new ObjectId as fallback after error', { newUserId: validUserId });
        }
      }
      
      // Parse amount with a default of 100 if not provided or invalid
      const parsedAmount = amount ? parseFloat(amount) : 100;
      
      // Generate a unique client UUID for the transaction
      const clientUuid = `receipt_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      
      // Get user data for mainAccountName if possible
      let mainAccountName = 'Receipt Upload User';
      try {
        const { User } = require('../models/user.model');
        const user = await User.findById(validUserId);
        if (user) {
          mainAccountName = user.username || user.name || user.phoneNumber || 'Receipt Upload User';
        }
      } catch (err) {
        logDirectUpload('Error getting user details for mainAccountName', { error: err.message });
      }
      
      logDirectUpload('Creating standalone transaction for receipt', { 
        userId: validUserId, 
        clientUuid: clientUuid,
        txHash: transactionHash || `receipt_${Date.now()}`,
        amount: parsedAmount,
        userName,
        mainAccountName
      });
      
      const transaction = new Transaction({
        userId: validUserId,
        clientUuid: clientUuid, // Add required clientUuid
        mainAccountName: mainAccountName, // Add required mainAccountName 
        type: 'BUY',
        amount: parsedAmount.toString(),
        status: 'PENDING',
        txHash: transactionHash || `receipt_${Date.now()}`,
        receipt: receiptUrl.replace(/^.*\/(uploads\/.*)$/, '$1'), // Extract relative path for receipt
        customerDetails: {
          name: userName || 'Receipt Upload User',
          phone: userPhone || 'N/A',
          location: userLocation || 'N/A'
        },
        metadata: new Map([
          ['receiptUrl', receiptUrl], // IMPORTANT: This is the key field that was missing
          ['amount', parsedAmount.toString()],
          ['uploadMethod', 'direct-upload-standalone'],
          ['userName', userName || ''],
          ['userPhone', userPhone || ''],
          ['userLocation', userLocation || ''],
          ['paymentGateway', paymentGateway || 'ALHARAM'],
          ['totalSypAmount', totalSypAmount || '0'],
          ['baseSypAmount', baseSypAmount || '0'],
          ['displayName', userName || 'Receipt Upload'], // For display in the admin dashboard
          ['walletAddress', user.walletAddress || 'N/A'] // Add walletAddress to metadata
        ])
      });
      
      // Add detailed logging for metadata
      logDirectUpload('Created transaction metadata', {
        userId: validUserId.toString(),
        userName: userName,
        userPhone: userPhone,
        userLocation: userLocation,
        keys: Array.from(transaction.metadata.keys()),
        userName_value: transaction.metadata.get('userName'),
        displayName_value: transaction.metadata.get('displayName')
      });
      
      await transaction.save();
      
      logDirectUpload('Created standalone transaction for receipt', { 
        transactionId: transaction._id,
        userId: validUserId,
        amount: parsedAmount,
        userName
      });
      
      // Notify admin
      sendNotification('admin', 'Direct Receipt Upload', 
        `A receipt was directly uploaded by ${userName || 'a user'}, Amount: ${parsedAmount} USDT`);
        
      // Return success with transaction ID
      return res.status(200).json({
        success: true,
        message: 'File uploaded successfully and transaction created',
        transactionId: transaction._id,
        file: {
          filename: file.filename,
          path: file.path
        }
      });
    } catch (transactionError) {
      logDirectUpload('Error creating transaction for direct upload', {
        error: transactionError.message,
        stack: transactionError.stack
      });
      
      // Return success for the file upload itself
      return res.status(200).json({
        success: true,
        message: 'File uploaded but failed to create transaction',
        error: transactionError.message,
        file: {
          filename: file.filename,
          path: file.path
        }
      });
    }
  } catch (error) {
    logDirectUpload('Unexpected error in direct upload', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: 'Error processing direct upload',
      error: error.message
    });
  }
});

// Add OPTIONS handler for CORS preflight requests
router.options('/direct-upload', (req, res) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  res.status(200).end();
});

// Add OPTIONS handler for upload route as well
router.options('/upload', (req, res) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  res.status(200).end();
});

// Transaction endpoint for mobile app
router.post('/transactions', authMiddleware, async (req, res) => {
  try {
    const { transactionId, amount, type, status, metadata, clientUuid } = req.body;
    
    console.log('DEBUG_GATEWAY: Transaction creation request received', {
      type,
      status,
      clientUuid,
      hasMetadata: !!metadata,
      metadataKeys: metadata ? Object.keys(metadata) : []
    });
    
    if (metadata && metadata.paymentGateway) {
      console.log(`DEBUG_GATEWAY: Payment gateway found in request metadata: ${metadata.paymentGateway}`);
    } else if (metadata) {
      console.log('DEBUG_GATEWAY: No payment gateway found in metadata');
      // Check if metadata contains a gateway-related field with different casing
      for (const key of Object.keys(metadata)) {
        if (key.toLowerCase().includes('gateway')) {
          console.log(`DEBUG_GATEWAY: Found gateway-related field: ${key}=${metadata[key]}`);
        }
      }
    }
    
    if (metadata && metadata.walletAddress) {
      console.log(`DEBUG_WALLET: Wallet address found in request metadata: ${metadata.walletAddress}`);
    }
    
    // Validate required fields
    if (!amount || !type || !status || !clientUuid) {
      return res.status(400).json({ 
        message: 'Missing required fields (amount, type, status, clientUuid)' 
      });
    }

    // Get full user data with public address
    const user = await User.findById(req.user._id).populate('publicAddress.addressId');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get the user's public address from PublicAddress collection
    const publicAddress = await PublicAddress.findOne({ 
      userId: user._id,
      status: 'assigned'
    });

    if (!publicAddress) {
      return res.status(400).json({ message: 'No public address found for user' });
    }

    // Create new transaction
    const transaction = new Transaction({
      userId: user._id,
      clientUuid, // Add clientUuid from request
      mainAccountName: user.username || user.name || user.phoneNumber,
      type,
      amount,
      status,
      txHash: transactionId,
      fromAddress: type === 'SELL' ? publicAddress.address : null,
      toAddress: type === 'BUY' ? publicAddress.address : null,
      customerDetails: {
        name: metadata?.userName || 'N/A',
        phone: metadata?.userPhone || 'N/A',
        location: metadata?.userLocation || 'N/A'
      },
      metadata: new Map(Object.entries(metadata || {}))
    });

    console.log('DEBUG_GATEWAY: Transaction created with metadata Map:', {
      transactionId: transaction._id,
      metadataType: transaction.metadata ? transaction.metadata.constructor.name : 'none',
      metadataSize: transaction.metadata ? transaction.metadata.size : 0
    });
    
    if (transaction.metadata && transaction.metadata.has('paymentGateway')) {
      console.log(`DEBUG_GATEWAY: paymentGateway in transaction metadata Map: ${transaction.metadata.get('paymentGateway')}`);
    } else if (transaction.metadata) {
      console.log('DEBUG_GATEWAY: No paymentGateway key in transaction metadata Map');
      // Log all keys in the metadata
      console.log('DEBUG_GATEWAY: All keys in metadata Map:', [...transaction.metadata.keys()]);
    }

    await transaction.save();
    
    console.log('DEBUG_GATEWAY: Transaction saved to database', {
      transactionId: transaction._id,
      type: transaction.type,
      clientUuid: transaction.clientUuid
    });

    // Send notification to admin
    try {
      const userName = metadata?.userName || user.name || 'User';
      await sendNotification('admin', 'New Pending Transaction', 
        `New ${type} transaction for ${amount} USDT from ${userName}`);
    } catch (notifError) {
      console.error('Failed to send admin notification:', notifError);
    }

    // Return both IDs in response
    res.status(201).json({ 
      message: 'Transaction created successfully',
      transaction: {
        ...transaction.toObject(),
        mongoId: transaction._id,
        clientUuid: transaction.clientUuid
      }
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ 
      message: 'Error creating transaction', 
      error: error.message 
    });
  }
});

// Get user's transactions endpoint for mobile app
router.get('/transactions/user', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    console.log(`[UserTransactions] Fetching transactions for user ${userId}`);
    
    // Find all transactions for this user
    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20);
    
    console.log(`[UserTransactions] Found ${transactions.length} transactions for user ${userId}`);
    
    // Debug: Log the raw transaction data structure for the first transaction
    if (transactions.length > 0) {
      const firstTx = transactions[0];
      console.log(`[METADATA_DEBUG] First transaction ID: ${firstTx._id}`);
      console.log(`[METADATA_DEBUG] First transaction metadata type: ${typeof firstTx.metadata}`);
      console.log(`[METADATA_DEBUG] First transaction metadata instanceof Map: ${firstTx.metadata instanceof Map}`);
      console.log(`[METADATA_DEBUG] First transaction metadata keys: ${firstTx.metadata instanceof Map ? Array.from(firstTx.metadata.keys()).join(', ') : 'N/A'}`);
      
      if (firstTx.metadata instanceof Map) {
        console.log(`[METADATA_DEBUG] First transaction metadata entries:`);
        firstTx.metadata.forEach((value, key) => {
          console.log(`[METADATA_DEBUG] -- Key: ${key}, Value: ${value}`);
        });
      } else if (typeof firstTx.metadata === 'object' && firstTx.metadata !== null) {
        console.log(`[METADATA_DEBUG] First transaction metadata as object:`, firstTx.metadata);
      } else {
        console.log(`[METADATA_DEBUG] First transaction metadata is null or not an object`);
      }
    }
    
    // Map to a simpler response structure
    const responseTransactions = transactions.map(tx => {
      // Debug the metadata conversion for each transaction
      let metadataConverted;
      
      try {
        // Check if metadata exists and handle different formats
        if (tx.metadata instanceof Map) {
          metadataConverted = Object.fromEntries(tx.metadata);
          console.log(`[METADATA_DEBUG] Transaction ${tx._id}: Successfully converted Map metadata to object`);
        } else if (typeof tx.metadata === 'object' && tx.metadata !== null) {
          metadataConverted = tx.metadata;
          console.log(`[METADATA_DEBUG] Transaction ${tx._id}: Using object metadata directly`);
        } else if (tx.metadata === null || tx.metadata === undefined) {
          metadataConverted = {};
          console.log(`[METADATA_DEBUG] Transaction ${tx._id}: No metadata available, using empty object`);
        } else {
          // For string or other primitive types
          try {
            metadataConverted = { rawValue: String(tx.metadata) };
            console.log(`[METADATA_DEBUG] Transaction ${tx._id}: Converted non-object metadata to string`);
          } catch (e) {
            metadataConverted = {};
            console.log(`[METADATA_DEBUG] Transaction ${tx._id}: Error converting metadata:`, e);
          }
        }
      } catch (error) {
        console.error(`[METADATA_DEBUG] Transaction ${tx._id}: Error processing metadata:`, error);
        metadataConverted = {};
      }
      
      const response = {
        id: tx._id,
        type: tx.type,
        status: tx.status,
        amount: tx.amount,
        createdAt: tx.createdAt,
        txHash: tx.txHash,
        fromAddress: tx.fromAddress,
        toAddress: tx.toAddress,
        metadata: metadataConverted
      };
      
      // Debug the final response object
      console.log(`[METADATA_DEBUG] Transaction ${tx._id}: Final metadata in response:`, response.metadata);
      
      return response;
    });
    
    return res.status(200).json({
      success: true,
      transactions: responseTransactions
    });
  } catch (error) {
    console.error(`[UserTransactions] Error fetching user transactions:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching transactions',
      error: error.message
    });
  }
});

// Transaction lookup endpoint for mobile app - to recover mongoId from clientUuid
router.get('/transactions/lookup/:clientUuid', authMiddleware, async (req, res) => {
  try {
    const clientUuid = req.params.clientUuid;
    const userId = req.user._id;
    
    console.log(`[TransactionLookup] User ${userId} looking up transaction with clientUuid: ${clientUuid}`);
    
    // Find transaction by clientUuid for this user
    const transaction = await Transaction.findOne({ 
      clientUuid: clientUuid,
      userId: userId
    });
    
    if (!transaction) {
      console.log(`[TransactionLookup] No transaction found for clientUuid: ${clientUuid}`);
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    console.log(`[TransactionLookup] Found transaction: ${transaction._id} for clientUuid: ${clientUuid}`);
    
    // Return the transaction details including both IDs
    return res.status(200).json({
      success: true,
      id: transaction._id,
      clientUuid: transaction.clientUuid,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt
    });
  } catch (error) {
    console.error(`[TransactionLookup] Error looking up transaction:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error looking up transaction',
      error: error.message
    });
  }
});

// Diagnostic endpoint to check ID mappings between MongoDB IDs and client UUIDs
router.get('/transactions/check-mappings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`[IDMapping] User ${userId} checking transaction ID mappings`);
    
    // Find all transactions for this user
    const transactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);
    
    // Map the transactions to include only the ID information
    const mappings = transactions.map(tx => ({
      mongoId: tx._id.toString(),
      clientUuid: tx.clientUuid,
      status: tx.status,
      type: tx.type,
      amount: tx.amount,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt
    }));
    
    console.log(`[IDMapping] Found ${mappings.length} transaction mappings`);
    
    return res.status(200).json({
      success: true,
      count: mappings.length,
      mappings: mappings
    });
  } catch (error) {
    console.error(`[IDMapping] Error checking transaction mappings:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error checking transaction mappings',
      error: error.message
    });
  }
});

// Backward compatibility route for existing mobile app
router.get('/transactions/:id/status', authMiddleware, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user._id;
    
    console.log(`[TransactionStatus] User ${userId} checking status for transaction ${transactionId}`);
    
    // Check if this is a MongoDB ObjectId or a client UUID
    const isObjectId = mongoose.Types.ObjectId.isValid(transactionId);
    
    let transaction;
    if (isObjectId) {
      console.log(`Looking up transaction by MongoDB ObjectId: ${transactionId}`);
      transaction = await Transaction.findById(transactionId);
    } else {
      console.log(`Looking up transaction by client UUID or metadata: ${transactionId}`);
      // Look for the ID in metadata fields
      transaction = await Transaction.findOne({
        $or: [
          { 'metadata.sellId': transactionId },
          { 'metadata.clientUuid': transactionId },
          { 'metadata.transactionId': transactionId }
        ]
      });
    }

    if (!transaction) {
      console.log(`Transaction not found for ID: ${transactionId}`);
      return res.status(404).json({ 
        success: false,
        message: 'Transaction not found' 
      });
    }
    
    // Verify that the user owns this transaction for the authenticated route
    if (transaction.userId && transaction.userId.toString() !== userId.toString()) {
      console.log(`[TransactionStatus] Unauthorized: User ${userId} attempted to access transaction ${transaction._id} owned by ${transaction.userId}`);
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this transaction'
      });
    }
    
    // Process metadata to convert from Map to plain object
    let metadata = {};
    if (transaction.metadata) {
      console.log(`Processing metadata for transaction ${transaction._id}`);
      
      if (transaction.metadata instanceof Map) {
        // Convert Map to object
        transaction.metadata.forEach((value, key) => {
          // Log user-related metadata fields specifically
          if (['userName', 'userPhone', 'userLocation', 'displayName', 'paymentGateway', 'remittanceNumber', 'networkFee', 'baseSypAmount', 'totalSypAmount'].includes(key)) {
            console.log(`Found important field in metadata: ${key} = ${value}`);
          }
          metadata[key] = value;
        });
      } else if (typeof transaction.metadata === 'object') {
        metadata = { ...transaction.metadata };
        
        // Log important metadata fields in the object form too
        ['userName', 'userPhone', 'userLocation', 'displayName', 'paymentGateway', 'remittanceNumber', 'networkFee', 'baseSypAmount', 'totalSypAmount'].forEach(key => {
          if (metadata[key]) {
            console.log(`Found important field in object metadata: ${key} = ${metadata[key]}`);
          }
        });
      }
      
      console.log(`Processed metadata fields: ${Object.keys(metadata).join(', ')}`);
    }
    
    // Format transaction object for response (in legacy format for compatibility)
    const response = {
      success: true,
      id: transaction._id,
      originalId: transactionId,
      status: transaction.status,
      updatedAt: transaction.updatedAt || transaction.createdAt,
      metadata: metadata,
      cacheBypass: Date.now() // Include cache-busting parameter for legacy compatibility
    };
    
    // ADDED: Explicitly include SYP amount values in the response when available in metadata
    // These are critical for correct display in the mobile app, especially for rejected transactions
    if (metadata.baseSypAmount) {
      console.log(`Including baseSypAmount in response: ${metadata.baseSypAmount}`);
      response.baseSypAmount = metadata.baseSypAmount;
    }
    
    if (metadata.totalSypAmount) {
      console.log(`Including totalSypAmount in response: ${metadata.totalSypAmount}`);
      response.totalSypAmount = metadata.totalSypAmount;
    }
    
    // Include exchange rate if available
    if (metadata.exchangeRate) {
      console.log(`Including exchangeRate in response: ${metadata.exchangeRate}`);
      response.exchangeRate = metadata.exchangeRate;
    }
    
    // Include rejection reason if available (from two possible sources)
    if (transaction.status === 'REJECTED') {
      // First check direct field (schema field)
      if (transaction.rejectionReason) {
        response.rejectionReason = transaction.rejectionReason;
      } 
      // Then check in metadata
      else if (metadata.rejectionReason) {
        response.rejectionReason = metadata.rejectionReason;
      }
      else {
        response.rejectionReason = 'No reason provided';
      }

      // For backward compatibility, also include reason field
      response.reason = response.rejectionReason;
    }
    
    // Add strong cache-busting headers
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Expires', '0');
    res.set('Pragma', 'no-cache');
    res.set('X-Timestamp', Date.now().toString());
    
    console.log(`Successfully retrieved transaction status: ${transaction.status}`);
    res.json(response);
  } catch (error) {
    console.error('[TransactionStatus] Error getting transaction status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting transaction status',
      error: error.message
    });
  }
});

// Health check route
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Simple connectivity test endpoint
router.get('/connectivity-test', (req, res) => {
  console.log('Connectivity test endpoint hit!');
  return res.status(200).json({ 
    success: true, 
    message: 'Connectivity test successful',
    timestamp: new Date().toISOString(),
    clientIp: req.ip
  });
});

// SSE endpoint for transaction status updates
router.get('/transactions/status-updates', authMiddleware, (req, res) => {
  const userId = req.user._id;
  
  console.log(`[SSE] New client connected for user ${userId}`);
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Helper function to send SSE data
  const sendData = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  // Send initial connection success
  sendData({ type: 'connected', userId: userId.toString() });
  
  // Create event listener for this user's transactions
  const eventName = `transaction_${userId}`;
  const listener = async (data) => {
    console.log(`[SSE] Preparing to send update to user ${userId}:`, data);
    
    // If this is a status update, try to include metadata
    if (data.type === 'STATUS_UPDATE' && data.transactionId) {
      try {
        // Fetch the transaction to get its metadata
        const transaction = await Transaction.findById(data.transactionId);
        
        if (transaction) {
          // Convert metadata to a regular object if it's a Map
          let metadata = {};
          if (transaction.metadata instanceof Map) {
            metadata = Object.fromEntries(transaction.metadata);
            console.log(`[SSE] Converting Map metadata to object for status update`);
          } else if (typeof transaction.metadata === 'object' && transaction.metadata !== null) {
            metadata = transaction.metadata;
            console.log(`[SSE] Using object metadata directly for status update`);
          }
          
          // Add metadata to the data object
          data.metadata = metadata;
          console.log(`[SSE] Added metadata to status update. Keys: ${Object.keys(metadata).join(', ')}`);
        }
      } catch (error) {
        console.error(`[SSE] Error fetching metadata for status update:`, error);
      }
    }
    
    console.log(`[SSE] Sending update to user ${userId}:`, data);
    sendData(data);
  };

  // Attach event listener to the event bus
  EventBus.on(eventName, listener);

  // Clean up event listener on connection close
  req.on('close', () => {
    console.log(`[SSE] Client disconnected for user ${userId}`);
    EventBus.off(eventName, listener);
  });
});

// Helper function to process a purchase with a receipt
async function processPurchaseReceipt(purchase, file, res, requestAmount, userName, userPhone, userLocation, paymentGateway, totalSypAmount, baseSypAmount, walletAddress) {
  try {
    // Ensure we have a valid amount - prioritize the requestAmount as this comes from the UI
    const amount = requestAmount ? parseFloat(requestAmount) : (purchase.usdtAmount || 100);
    
    // Log all parameters to debug the wallet address issue
    console.log('DEBUG_WALLET: processPurchaseReceipt received parameters:', {
      purchaseId: purchase._id,
      requestAmount,
      userName,
      userPhone,
      userLocation,
      paymentGateway,
      totalSypAmount,
      baseSypAmount,
      walletAddress
    });
    
    logDirectUpload('Processing purchase receipt', {
      purchaseId: purchase._id,
      userId: purchase.userId,
      status: purchase.status,
      usdtAmount: purchase.usdtAmount,
      requestAmount: requestAmount,
      finalAmount: amount,
      userName: userName,
      userPhone: userPhone,
      userLocation: userLocation,
      paymentGateway: paymentGateway,
      totalSypAmount: totalSypAmount,
      baseSypAmount: baseSypAmount,
      walletAddress: walletAddress
    });
    
    // Upload receipt to storage
    let receiptUrl;
    try {
      receiptUrl = await uploadToStorage(file);
      logDirectUpload('Receipt uploaded to storage from direct upload', { 
        purchaseId: purchase._id, 
        receiptUrl 
      });
    } catch (storageError) {
      logDirectUpload('Storage upload failed in direct upload', { 
        purchaseId: purchase._id, 
        error: storageError.message,
        stack: storageError.stack
      });
      return res.status(200).json({
        success: true,
        message: 'File uploaded but failed to process for storage',
        error: storageError.message,
        file: {
          filename: file.filename,
          path: file.path
        }
      });
    }
    
    // Update purchase status
    purchase.receiptUrl = receiptUrl;
    purchase.status = 'paymentUploaded';
    
    // Ensure USDT amount is set if it wasn't before
    if (!purchase.usdtAmount && amount) {
      purchase.usdtAmount = amount;
      logDirectUpload('Updated purchase with amount', {
        purchaseId: purchase._id,
        amount: amount
      });
    }
    
    // Store customer info if provided
    if (userName) {
      if (!purchase.customerInfo) {
        purchase.customerInfo = {};
      }
      purchase.customerInfo.name = userName;
      purchase.customerInfo.phone = userPhone;
      purchase.customerInfo.location = userLocation;
      
      logDirectUpload('Updated purchase with customer info', {
        purchaseId: purchase._id,
        customerName: userName
      });
    }
    
    // Store wallet address if provided - explicitly add this
    if (walletAddress) {
      console.log('DEBUG_WALLET: Setting wallet address on purchase:', walletAddress);
      purchase.walletAddress = walletAddress;
    }
    
    await purchase.save();
    
    logDirectUpload('Purchase updated with receipt from direct upload', {
      purchaseId: purchase._id,
      receiptUrl: receiptUrl,
      amount: purchase.usdtAmount,
      customerName: purchase.customerInfo?.name,
      walletAddress: purchase.walletAddress
    });
    
    // Check if a transaction already exists for this purchase
    const { Transaction } = require('../models/transaction.model');
    const { User } = require('../models/user.model');
    
    let transaction = await Transaction.findOne({
      'metadata.purchaseId': purchase._id.toString()
    });
    
    if (!transaction) {
      logDirectUpload('Creating new transaction for direct upload', { 
        purchaseId: purchase._id,
        amount: amount,
        userName: userName,
        walletAddress: walletAddress
      });
      
      try {
        // Use the amount from either the request or the purchase
        const finalAmount = amount;
        
        // Get user data
        const user = await User.findById(purchase.userId);
        if (!user) {
          throw new Error('User not found');
        }
        
        transaction = new Transaction({
          userId: purchase.userId,
          mainAccountName: user.username || user.name || user.phoneNumber,
          type: 'BUY',
          amount: finalAmount,
          status: 'PENDING',
          txHash: purchase.transactionHash || `purchase_${purchase._id}`,
          receipt: receiptUrl.replace(/^.*\/(uploads\/.*)$/, '$1'), // Extract relative path for receipt
          customerDetails: {
            name: userName || 'N/A',
            phone: userPhone || 'N/A',
            location: userLocation || 'N/A'
          },
          metadata: new Map([
            ['purchaseId', purchase._id.toString()],
            ['receiptUrl', receiptUrl],
            ['sypAmount', purchase.sypAmount ? purchase.sypAmount.toString() : '0'],
            ['exchangeRate', purchase.exchangeRate ? purchase.exchangeRate.toString() : '0'],
            ['amount', finalAmount.toString()], // Store amount in metadata as well
            ['uploadMethod', 'direct-upload-with-purchase'],
            ['userName', userName || ''],
            ['userPhone', userPhone || ''],
            ['userLocation', userLocation || ''],
            ['paymentGateway', paymentGateway || 'ALHARAM'],
            ['totalSypAmount', totalSypAmount || '0'],
            ['baseSypAmount', baseSypAmount || '0'],
            ['displayName', userName || ''], // Specifically for display in admin dashboard
            ['walletAddress', walletAddress || 'N/A'] // Add walletAddress to metadata
          ])
        });
        
        // Log detailed info about the walletAddress
        console.log('DEBUG_WALLET: Transaction creation walletAddress details:', {
          providedWalletAddress: walletAddress,
          purchaseWalletAddress: purchase.walletAddress,
          metadataWalletAddress: transaction.metadata.get('walletAddress')
        });
        
        await transaction.save();
        logDirectUpload('Transaction created successfully from direct upload', { 
          transactionId: transaction._id,
          purchaseId: purchase._id,
          amount: finalAmount,
          userName: userName,
          walletAddress: walletAddress
        });
        
        // Notify admin
        sendNotification('admin', 'Payment Receipt Uploaded', 
          `Payment receipt uploaded by ${userName || 'a user'} for purchase ${purchase._id}, Amount: ${finalAmount} USDT`);
          
        // Send notification to user if there's a user ID
        if (purchase.userId) {
          sendNotification(purchase.userId, 'Receipt Uploaded', 
            'Your payment receipt has been uploaded successfully');
        }
      } catch (transactionError) {
        logDirectUpload('Error creating transaction', {
          error: transactionError.message,
          stack: transactionError.stack,
          purchaseId: purchase._id
        });
        
        // Try fallback approach
        try {
          logDirectUpload('Attempting fallback transaction creation');
          
          // Generate a unique client UUID for the transaction
          const clientUuid = `purchase_fallback_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
          
          // Create a simpler transaction
          const fallbackTransaction = new Transaction({
            type: 'BUY',
            status: 'PENDING',
            txHash: `purchase_fallback_${Date.now()}`,
            amount: amount,
            userId: purchase.userId, // Use the purchase user ID
            clientUuid: clientUuid, // Add required clientUuid
            mainAccountName: userName || 'Purchase Receipt User', // Add required mainAccountName
            receipt: receiptUrl.replace(/^.*\/(uploads\/.*)$/, '$1'), // Extract relative path for receipt
            customerDetails: {
              name: userName || 'N/A',
              phone: userPhone || 'N/A',
              location: userLocation || 'N/A'  
            },
            metadata: new Map([
              ['purchaseId', purchase._id.toString()],
              ['receiptUrl', receiptUrl],
              ['amount', amount.toString()],
              ['uploadMethod', 'purchase-fallback'],
              ['userName', userName],
              ['userPhone', userPhone],
              ['userLocation', userLocation],
              ['paymentGateway', paymentGateway || 'ALHARAM'],
              ['totalSypAmount', totalSypAmount || '0'],
              ['baseSypAmount', baseSypAmount || '0'],
              ['displayName', userName], // For display in the admin dashboard
              ['walletAddress', walletAddress || 'N/A'] // Add walletAddress to metadata
            ])
          });
          
          // Log debug info about wallet address
          console.log('DEBUG_WALLET: Setting fallback transaction wallet address:', {
            providedAddress: walletAddress,
            metadataAddress: fallbackTransaction.metadata.get('walletAddress')
          });
          
          await fallbackTransaction.save();
          logDirectUpload('Created fallback transaction for purchase', {
            transactionId: fallbackTransaction._id,
            purchaseId: purchase._id,
            amount: amount,
            userName: userName,
            walletAddress: walletAddress
          });
          
          // Return success with transaction ID
          return res.status(200).json({
            success: true,
            message: 'File uploaded successfully and fallback transaction created',
            transactionId: fallbackTransaction._id,
            purchaseId: purchase._id,
            file: {
              filename: file.filename,
              path: file.path
            }
          });
        } catch (fallbackError) {
          logDirectUpload('Error creating fallback transaction for purchase', {
            error: fallbackError.message,
            stack: fallbackError.stack
          });
        }
        
        // Continue execution - we still want to return success for the file upload
      }
    } else {
      logDirectUpload('Updating existing transaction from direct upload', {
        transactionId: transaction._id,
        purchaseId: purchase._id,
        currentAmount: transaction.amount,
        newAmount: amount,
        userName: userName
      });
      
      try {
        transaction.metadata.set('receiptUrl', receiptUrl);
        
        // Update amount if it was 0 before or if we have a new amount from the request
        if (transaction.amount === 0 || requestAmount) {
          transaction.amount = amount;
          transaction.metadata.set('amount', amount.toString());
          logDirectUpload('Updated transaction amount', {
            transactionId: transaction._id,
            oldAmount: transaction.amount,
            newAmount: amount
          });
        }
        
        // Update user information if provided
        if (userName) {
          transaction.metadata.set('userName', userName);
          transaction.metadata.set('userPhone', userPhone);
          transaction.metadata.set('userLocation', userLocation);
          transaction.metadata.set('displayName', userName);
          
          if (paymentGateway) {
            transaction.metadata.set('paymentGateway', paymentGateway);
          }
          
          if (totalSypAmount) {
            transaction.metadata.set('totalSypAmount', totalSypAmount);
          }
          
          if (baseSypAmount) {
            transaction.metadata.set('baseSypAmount', baseSypAmount);
          }
          
          if (walletAddress) {
            transaction.metadata.set('walletAddress', walletAddress);
          }
          
          logDirectUpload('Updated transaction with user information', {
            transactionId: transaction._id,
            userName: userName,
            paymentGateway: paymentGateway,
            totalSypAmount: totalSypAmount,
            baseSypAmount: baseSypAmount,
            walletAddress: walletAddress
          });
        }
        
        await transaction.save();
      } catch (updateError) {
        logDirectUpload('Error updating transaction', {
          error: updateError.message,
          stack: updateError.stack,
          purchaseId: purchase._id
        });
      }
    }
    
    // Return success
    return res.status(200).json({
      success: true,
      message: 'File uploaded successfully and purchase updated',
      transaction: {
        id: transaction ? transaction._id : null,
        amount: amount,
        status: 'pending'
      },
      file: {
        filename: file.filename,
        path: file.path
      }
    });
  } catch (error) {
    logDirectUpload('Error in processPurchaseReceipt', {
      error: error.message,
      stack: error.stack,
      purchaseId: purchase._id
    });
    
    return res.status(200).json({
      success: true,
      message: 'File uploaded but error in purchase processing',
      error: error.message,
      file: {
        filename: file.filename,
        path: file.path
      }
    });
  }
}

// Add a public route for system settings (needed by mobile app)
router.get('/settings', async (req, res) => {
  console.log('⚙️ DEBUG: GET /api/settings endpoint hit');
  try {
    const Settings = require('../models/settings.model');
    console.log('⚙️ DEBUG: Settings model loaded in public endpoint');
    
    const settings = await Settings.getSettings();
    console.log('⚙️ DEBUG: Settings fetched in public endpoint:', settings);
    
    // Only return specific fields that clients need
    res.status(200).json({
      success: true,
      settings: {
        networkFeePercentage: settings.networkFeePercentage,
        exchangeRate: settings.exchangeRate
      }
    });
  } catch (error) {
    console.error('❌ DEBUG: Error fetching public settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message
    });
  }
});

// Add a catch-all handler for undefined routes with better error messages
router.use('*', (req, res) => {
  console.log(`⚠️ WARNING: Undefined route accessed: ${req.originalUrl}`);
  
  // Send more descriptive error for transaction status-updates when accessed incorrectly
  if (req.originalUrl.includes('status-updates')) {
    console.log('ℹ️ INFO: Detected access to transaction status updates route');
    return res.status(404).json({
      success: false,
      message: 'Transaction status updates endpoint is available at /transactions/status-updates',
      path: req.originalUrl,
      hint: 'Remove any duplicate /api prefix from your URL path'
    });
  }
  
  // For other routes, send a simple response
  return res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

console.log('✅ DEBUG: Main routes module loaded successfully');

module.exports = router;