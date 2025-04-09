const jwt = require('jsonwebtoken');
const { Admin } = require('../models/admin.model');

module.exports = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log('[AdminAuthMiddleware] No token provided');
      return res.status(401).json({ message: 'No token provided' });
    }

    console.log('[AdminAuthMiddleware] Token found:', {
      length: token.length,
      prefix: token.slice(0, 10) + '...'
    });

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[AdminAuthMiddleware] Decoded token:', decoded);

    if (decoded.role !== 'ADMIN') {
      console.log('[AdminAuthMiddleware] Non-admin token detected:', decoded.role);
      return res.status(403).json({ message: 'Not authorized - Admin access required' });
    }

    // Find admin user using userId
    const admin = await Admin.findById(decoded.userId);
    if (!admin) {
      console.log('[AdminAuthMiddleware] Admin not found:', decoded.userId);
      return res.status(401).json({ message: 'Invalid token - Admin not found' });
    }

    console.log('[AdminAuthMiddleware] Admin found:', {
      id: admin._id,
      email: admin.email
    });

    // Attach admin to request (not as user)
    req.admin = admin;
    req.isAdmin = true;
    next();
  } catch (error) {
    console.error('[AdminAuthMiddleware] Error:', error.message);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
