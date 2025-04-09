const { body, validationResult } = require('express-validator');

const phoneNumberValidation = [
  body('phoneNumber')
    .trim()
    .matches(/^\+?963[0-9]{9}$/)
    .withMessage('Please enter a valid Syrian phone number'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

const verificationCodeValidation = [
  body('code')
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Verification code must be 6 digits'),
  
  body('requestId')
    .trim()
    .notEmpty()
    .withMessage('Request ID is required'),
    
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  phoneNumberValidation,
  verificationCodeValidation
}; 