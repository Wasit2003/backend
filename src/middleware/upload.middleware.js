const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create a logging function for receipt uploads
const logUpload = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [RECEIPT_UPLOAD] [MULTER] ${message} ${JSON.stringify(data)}`;
  
  console.log(logMessage);
  
  // Write to log file
  const logDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'uploadlogs.txt');
  fs.appendFileSync(logFile, logMessage + '\n');
};

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
const receiptsDir = path.join(uploadsDir, 'receipts');

// Ensure directories exist
if (!fs.existsSync(uploadsDir)) {
  logUpload('Creating uploads directory', { path: uploadsDir });
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(receiptsDir)) {
  logUpload('Creating receipts directory', { path: receiptsDir });
  fs.mkdirSync(receiptsDir, { recursive: true });
}

logUpload('Upload directories initialized', { 
  uploadsDir, 
  receiptsDir,
  uploadsDirExists: fs.existsSync(uploadsDir),
  receiptsDirExists: fs.existsSync(receiptsDir)
});

// Configure storage
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    logUpload('Setting file destination', { 
      destination: receiptsDir,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    cb(null, receiptsDir);
  },
  filename: function(req, file, cb) {
    // Create a unique filename: timestamp + random string + original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = `receipt-${uniqueSuffix}${ext}`;
    
    logUpload('Generating filename', { 
      originalname: file.originalname,
      extension: ext,
      generatedFilename: filename
    });
    
    cb(null, filename);
  }
});

// File filter to only allow image files
const fileFilter = (req, file, cb) => {
  logUpload('Filtering file', { 
    originalname: file.originalname,
    mimetype: file.mimetype,
    isImage: file.mimetype.startsWith('image/')
  });
  
  // Check file extension regardless of MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  const validImageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
  const hasValidExtension = validImageExtensions.includes(ext);
  
  // Accept image files by MIME type OR valid image extensions from mobile clients
  if (file.mimetype.startsWith('image/') || 
      (file.mimetype === 'application/octet-stream' && hasValidExtension)) {
    
    if (file.mimetype === 'application/octet-stream' && hasValidExtension) {
      logUpload('Accepting file with octet-stream MIME type based on extension', {
        originalname: file.originalname,
        extension: ext,
        mimetype: file.mimetype
      });
    }
    
    cb(null, true);
  } else {
    logUpload('File rejected: not an image', { 
      originalname: file.originalname,
      mimetype: file.mimetype,
      extension: ext,
      hasValidExtension
    });
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Configure multer with limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 1 // Allow only one file per request
  }
});

// Create wrapper for error handling
const uploadMiddleware = (req, res, next) => {
  logUpload('Upload middleware triggered', { 
    url: req.originalUrl,
    method: req.method,
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length')
  });
  
  // Log raw request headers to debug content-type issues
  console.log('DEBUG_MULTER: Request headers:', Object.keys(req.headers).map(key => `${key}: ${req.headers[key]}`));
  
  const multerSingle = upload.single('receipt');
  
  multerSingle(req, res, (err) => {
    if (err) {
      logUpload('Multer error occurred', { 
        error: err.message,
        code: err.code,
        field: err.field
      });
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: err.message || 'Error uploading file'
      });
    }
    
    if (!req.file) {
      logUpload('No file in request', {
        body: Object.keys(req.body),
        hasFormData: !!req.is('multipart/form-data')
      });
    } else {
      logUpload('File uploaded successfully', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        path: req.file.path,
        size: req.file.size
      });
    }
    
    // Log the request body for debugging
    console.log('DEBUG_MULTER: Request body after multer processing:', req.body ? Object.keys(req.body) : 'No body');
    console.log('DEBUG_MULTER: walletAddress in body after processing:', req.body?.walletAddress);
    
    next();
  });
};

module.exports = uploadMiddleware; 