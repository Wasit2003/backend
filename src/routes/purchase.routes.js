const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchase.controller');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/adminAuth.middleware');
const upload = require('../middleware/upload.middleware');

// Create a logging function for receipt uploads in routes
const fs = require('fs');
const path = require('path');

const logRoute = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [RECEIPT_UPLOAD] [ROUTE] ${message} ${JSON.stringify(data)}`;
  
  console.log(logMessage);
  
  // Write to log file
  const logDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'uploadlogs.txt');
  fs.appendFileSync(logFile, logMessage + '\n');
};

// User routes
router.post('/', 
  authMiddleware,
  purchaseController.createPurchase
);

router.post('/:purchaseId/receipt',
  (req, res, next) => {
    logRoute('Receipt upload route accessed', { 
      purchaseId: req.params.purchaseId,
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      hasAuthorization: !!req.get('Authorization')
    });
    next();
  },
  authMiddleware,
  upload, // Now using our enhanced middleware with error handling
  purchaseController.uploadReceipt
);

router.get('/:purchaseId',
  authMiddleware,
  purchaseController.getPurchaseStatus
);

router.get('/user/purchases',
  authMiddleware,
  purchaseController.getUserPurchases
);

// Admin routes
router.post('/:purchaseId/verify',
  authMiddleware,
  adminMiddleware,
  purchaseController.verifyPurchase
);

module.exports = router; 