const jwt = require('jsonwebtoken');

// Verifies the JWT sent in the "Authorization: Bearer <token>" header
exports.verifyToken = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied: token missing' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Access denied: invalid or expired token' });
  }
};

// Role based authorization: allowRoles('ADMIN') or allowRoles('ADMIN', 'VOLUNTEER')
exports.allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Forbidden: role ${req.user ? req.user.role : 'UNKNOWN'} is not allowed to access this resource`,
    });
  }
  next();
};
