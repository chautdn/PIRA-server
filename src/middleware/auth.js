const jwtUtils = require('../utils/jwt');
const User = require('../models/User');

const authMiddleware = {
  verifyToken: async (req, res, next) => {
    try {
      console.log('🔍 [AUTH] Request headers:', {
        authorization: req.headers.authorization,
        token: req.headers.token,
        'x-verification-token': req.headers['x-verification-token']
      });

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

      console.log('🔍 [AUTH] Extracted token:', token ? 'Present' : 'Missing');

      if (!token) {
        console.log('❌ [AUTH] No token found');
        return res.status(401).json({
          success: false,
          message: 'Access token is required'
        });
      }

      // Verify token
      const decoded = jwtUtils.verifyAccessToken(token);
      console.log('✅ [AUTH] Token decoded successfully:', { userId: decoded.id });

      // Lấy thông tin user
      const user = await User.findById(decoded.id);
      if (!user) {
        console.log('❌ [AUTH] User not found:', decoded.id);
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      console.log('✅ [AUTH] User authenticated:', {
        id: user._id,
        email: user.email,
        role: user.role
      });

      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
  },
  checkUserRole: (role) => {
    return (req, res, next) => {
      console.log(req.user);
      if (req.user.role === role) {
        next();
      } else {
        return res.status(403).json('You are not allowed to do that!');
      }
    };
  }
};

module.exports = { authMiddleware };
