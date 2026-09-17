const jwt = require('jsonwebtoken');

// 1. Verifies the JWT token from the Authorization header
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  
  // Header format is: Bearer <token>
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach user payload (id, email, role) directly to request object
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// 2. Role-check helper: ensures the user has one of the allowed roles
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Requires one of: ${allowedRoles.join(', ')}` 
      });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };