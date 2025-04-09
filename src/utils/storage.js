const path = require('path');
const fs = require('fs');

// Create a logging function for receipt uploads
const logStorage = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [RECEIPT_UPLOAD] [STORAGE] ${message} ${JSON.stringify(data)}`;
  
  console.log(logMessage);
  
  // Write to log file
  const logDir = path.join(__dirname, '../../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'uploadlogs.txt');
  fs.appendFileSync(logFile, logMessage + '\n');
};

/**
 * Upload a file to local storage
 * 
 * @param {Object} file - The file object from multer
 * @returns {Promise<string>} - The URL of the uploaded file
 */
const uploadToStorage = async (file) => {
  try {
    logStorage('Starting file upload to storage', {
      originalname: file?.originalname,
      filename: file?.filename,
      path: file?.path,
      size: file?.size
    });

    if (!file) {
      logStorage('No file provided for upload', {});
      throw new Error('No file provided');
    }

    // Check if file exists on disk
    if (!fs.existsSync(file.path)) {
      logStorage('File does not exist at the specified path', { path: file.path });
      throw new Error('File does not exist at the specified path');
    }
    
    // Check file size
    const stats = fs.statSync(file.path);
    logStorage('File stats', { 
      size: stats.size, 
      sizeFromRequest: file.size, 
      match: stats.size === file.size 
    });
    
    if (stats.size === 0) {
      logStorage('Empty file detected', { path: file.path });
      throw new Error('File is empty');
    }

    // In a production app, you would upload the file to a cloud storage
    // For local development, just return a relative URL path that can be used with the server
    const relativePath = path.relative(path.join(__dirname, '../../'), file.path);
    logStorage('Relative path calculated', { relativePath });
    
    // Format as a URL path that starts with a forward slash
    // This works better with both frontend code that prepends domain and relative paths
    const fileUrl = `/${relativePath.replace(/\\/g, '/')}`;
    logStorage('File URL path generated', { fileUrl });
    
    return fileUrl;
  } catch (error) {
    logStorage('Upload to storage error', { 
      error: error.message,
      stack: error.stack
    });
    console.error('Upload to storage error:', error);
    throw new Error('Failed to upload file to storage: ' + error.message);
  }
};

const deleteFromStorage = async (fileUrl) => {
  try {
    if (!fileUrl) {
      throw new Error('No file URL provided');
    }

    // Extract filename from URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const relativePath = fileUrl.replace(baseUrl, '').replace(/^\/+/, '');
    const filePath = path.join(__dirname, '../../', relativePath);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Delete from storage error:', error);
    return false;
  }
};

module.exports = {
  uploadToStorage,
  deleteFromStorage
};