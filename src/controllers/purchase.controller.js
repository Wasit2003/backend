const Purchase = require('../models/purchase.model');
const { uploadToStorage } = require('../utils/storage');
const { sendNotification } = require('../utils/notifications');
const { transferUSDT } = require('../services/blockchain.service');
const blockchainService = require('../services/blockchain.service');
const User = require('../models/user.model');
const fs = require('fs');
const path = require('path');

// Create a logging function for receipt uploads
const logReceiptUpload = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [RECEIPT_UPLOAD] ${message} ${JSON.stringify(data)}`;
  
  console.log(logMessage);
  
  // Write to log file
  const logDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'uploadlogs.txt');
  fs.appendFileSync(logFile, logMessage + '\n');
};

class PurchaseController {
  // Create new purchase request
  async createPurchase(req, res) {
    try {
      const purchase = new Purchase({
        userId: req.user._id,
        ...req.body
      });

      await purchase.save();

      // Notify admin about new purchase request
      sendNotification('admin', 'New Purchase Request', 
        `New USDT purchase request for ${purchase.usdtAmount} USDT`);

      res.status(201).json({
        success: true,
        purchase
      });
    } catch (error) {
      console.error('Create purchase error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create purchase request'
      });
    }
  }

  // Upload receipt
  async uploadReceipt(req, res) {
    try {
      const { purchaseId } = req.params;
      const receipt = req.file;
      
      logReceiptUpload('Receipt upload initiated', { 
        purchaseId, 
        hasFile: !!receipt,
        fileInfo: receipt ? {
          filename: receipt.filename,
          size: receipt.size,
          mimetype: receipt.mimetype
        } : null
      });

      if (!receipt) {
        logReceiptUpload('No receipt file provided', { purchaseId });
        return res.status(400).json({
          success: false,
          message: 'No receipt file provided'
        });
      }

      const purchase = await Purchase.findById(purchaseId);
      if (!purchase) {
        logReceiptUpload('Purchase not found', { purchaseId });
        return res.status(404).json({
          success: false,
          message: 'Purchase request not found'
        });
      }
      
      logReceiptUpload('Purchase found', { 
        purchaseId, 
        status: purchase.status,
        userId: purchase.userId
      });

      // Upload receipt to storage
      try {
        const receiptUrl = await uploadToStorage(receipt);
        logReceiptUpload('Receipt uploaded to storage', { 
          purchaseId, 
          receiptUrl 
        });
        
        // Update purchase status
        purchase.receiptUrl = receiptUrl;
        purchase.status = 'paymentUploaded';
        await purchase.save();
        
        logReceiptUpload('Purchase updated with receipt', { 
          purchaseId, 
          newStatus: 'paymentUploaded' 
        });

        // Create a transaction record for this purchase
        const { Transaction } = require('../models/transaction.model');
        
        // Check if a transaction already exists for this purchase
        let transaction = await Transaction.findOne({
          'metadata.purchaseId': purchaseId
        });
        
        if (!transaction) {
          logReceiptUpload('Creating new transaction for purchase', { purchaseId });
          
          transaction = new Transaction({
            userId: purchase.userId,
            type: 'BUY',
            amount: purchase.usdtAmount,
            status: 'PENDING',
            txHash: purchase.transactionHash || `purchase_${purchaseId}`,
            metadata: new Map([
              ['purchaseId', purchaseId],
              ['receiptUrl', receiptUrl],
              ['sypAmount', purchase.sypAmount.toString()],
              ['exchangeRate', purchase.exchangeRate.toString()]
            ])
          });
          
          await transaction.save();
          logReceiptUpload('Transaction created successfully', { 
            transactionId: transaction._id,
            purchaseId 
          });
        } else {
          logReceiptUpload('Updating existing transaction for purchase', { 
            purchaseId,
            transactionId: transaction._id 
          });
          
          // Update existing transaction
          transaction.metadata.set('receiptUrl', receiptUrl);
          await transaction.save();
        }

        // Notify admin
        sendNotification('admin', 'Payment Receipt Uploaded', 
          `Payment receipt uploaded for purchase ${purchaseId}`);
        
        logReceiptUpload('Admin notification sent', { purchaseId });

        res.json({
          success: true,
          purchase
        });
      } catch (storageError) {
        logReceiptUpload('Storage upload failed', { 
          purchaseId, 
          error: storageError.message 
        });
        throw storageError; // Re-throw to be caught by the outer catch
      }
    } catch (error) {
      logReceiptUpload('Upload receipt error', { 
        error: error.message,
        stack: error.stack
      });
      console.error('Upload receipt error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload receipt'
      });
    }
  }

  // Admin verification
  async verifyPurchase(req, res) {
    try {
      const { purchaseId } = req.params;
      const { action, reason } = req.body;

      const purchase = await Purchase.findById(purchaseId);
      if (!purchase) {
        return res.status(404).json({
          success: false,
          message: 'Purchase request not found'
        });
      }

      if (action === 'approve') {
        // Verify admin has sufficient USDT balance
        const hasBalance = await blockchainService.verifyUSDTBalance(purchase.usdtAmount);
        if (!hasBalance) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient USDT balance in admin wallet'
          });
        }

        // Transfer USDT to user
        const txHash = await blockchainService.transferUSDT(
          purchase.userId,
          purchase.usdtAmount
        );

        purchase.status = 'completed';
        purchase.transactionHash = txHash;

        // Start monitoring transfer
        this.monitorTransfer(purchase.id);

        // Notify user
        sendNotification(purchase.userId, 'Purchase Approved', 
          `Your USDT purchase has been approved and transfer is in progress`);
      } else {
        purchase.status = 'rejected';
        purchase.rejectionReason = reason;

        // Notify user
        sendNotification(purchase.userId, 'Purchase Rejected', 
          `Your USDT purchase has been rejected: ${reason}`);
      }

      await purchase.save();

      res.json({
        success: true,
        purchase
      });
    } catch (error) {
      console.error('Verify purchase error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify purchase'
      });
    }
  }

  // Get purchase status
  async getPurchaseStatus(req, res) {
    try {
      const { purchaseId } = req.params;
      const purchase = await Purchase.findById(purchaseId);

      if (!purchase) {
        return res.status(404).json({
          success: false,
          message: 'Purchase request not found'
        });
      }

      res.json({
        success: true,
        purchase
      });
    } catch (error) {
      console.error('Get purchase status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get purchase status'
      });
    }
  }

  // Get user's purchases
  async getUserPurchases(req, res) {
    try {
      const purchases = await Purchase.find({ userId: req.user._id })
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        purchases
      });
    } catch (error) {
      console.error('Get user purchases error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user purchases'
      });
    }
  }

  async monitorTransfer(purchaseId) {
    try {
      const purchase = await Purchase.findById(purchaseId);
      if (!purchase || !purchase.transactionHash) {
        throw new Error('Invalid purchase or no transaction hash');
      }

      // Monitor transaction status
      const status = await blockchainService.monitorTransaction(purchase.transactionHash);

      if (status.status === 'confirmed') {
        purchase.status = 'completed';
        await purchase.save();

        // Notify user
        sendNotification(purchase.userId, 'Transfer Completed', 
          `Your USDT purchase has been completed and transferred to your wallet`);
      } else if (status.status === 'failed') {
        purchase.status = 'failed';
        await purchase.save();

        // Notify admin and user
        sendNotification('admin', 'Transfer Failed', 
          `USDT transfer failed for purchase ${purchaseId}`);
        sendNotification(purchase.userId, 'Transfer Failed', 
          `Your USDT purchase transfer has failed. Please contact support.`);
      }

      return status;
    } catch (error) {
      console.error('Monitor transfer error:', error);
      throw new Error('Failed to monitor transfer');
    }
  }
}

module.exports = new PurchaseController(); 