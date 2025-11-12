const jwtUtils = require('../utils/jwt');
const User = require('../models/User');
const mongoose = require('mongoose');

const authMiddleware = {
  verifyToken: async (req, res, next) => {
    try {
      let token;

      // Lấy token từ nhiều nguồn
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
      } else if (req.headers.token && req.headers.token.startsWith('Bearer ')) {
        token = req.headers.token.split(' ')[1];
      } else if (req.headers['x-verification-token']) {
        token = req.headers['x-verification-token'];
      } else if (req.query.token) {
        token = req.query.token;
      }
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Access token is required'
        });
      }

      // Verify token
      const decoded = jwtUtils.verifyAccessToken(token);
      // Lấy thông tin user - sử dụng mongoose.model thay vì require
      const User = mongoose.model('User');
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      // Auth middleware error
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  },

  checkUserRole: (roles) => {
    return (req, res, next) => {
      if (roles.includes(req.user.role)) {
        next();
      } else {
        return res.status(403).json('You are not allowed to do that!');
      }
    };
  }
};

module.exports = { authMiddleware };
