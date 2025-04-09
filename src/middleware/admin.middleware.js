const adminMiddleware = (req, res, next) => {
  // Check if user exists and is an admin
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

module.exports = adminMiddleware; 