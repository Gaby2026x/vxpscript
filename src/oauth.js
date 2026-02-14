const jwt = require('jsonwebtoken');
const config = require('../config');

// Use the centralized config to ensure secrets match everywhere
const SECRET = config.jwt.secret;

exports.sign = (payload) => {
  return jwt.sign(payload, SECRET, { expiresIn: config.jwt.expiresIn });
};

/**
 * Middleware to verify JWT token.
 * Can be used in routes that require protection.
 */
exports.verify = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authentication token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded; // Attach user to request
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(403).json({ error: 'Invalid token' });
  }
};

/**
 * Helper to verify a token string directly (useful for WebSocket auth)
 */
exports.verifyTokenString = (token) => {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
};
