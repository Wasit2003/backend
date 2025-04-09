const helmet = require('helmet');

const securityMiddleware = [
  helmet(),
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "http://localhost:3000", "http://127.0.0.1:3000"],
      connectSrc: [
        "'self'",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://data-seed-prebsc-1-s1.binance.org",
        "https://bsc-dataseed.binance.org"
      ],
    },
  }),
  helmet.referrerPolicy({ policy: 'same-origin' }),
  (req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
    next();
  }
];

module.exports = securityMiddleware; 