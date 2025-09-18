const jwt = require('jsonwebtoken');

const jwtUtils = {
  // Generate Access Token (15 minutes)
  generateAccessToken: (user) => {
    const payload = {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role
    };

    return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
      expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m'
    });
  },

  // Generate Refresh Token (7 days)
  generateRefreshToken: (user) => {
    const payload = {
      id: user._id,
      email: user.email
    };

    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
    });
  },

  // Generate Verification Token (1 hour)
  generateVerificationToken: (user) => {
    const payload = {
      id: user._id,
      email: user.email,
      type: 'email_verification'
    };

    return jwt.sign(payload, process.env.JWT_VERIFICATION_SECRET, {
      expiresIn: process.env.JWT_VERIFICATION_EXPIRE || '1h'
    });
  },

  // Generate Reset Password Token (15 minutes)
  generateResetToken: (user) => {
    const payload = {
      id: user._id,
      email: user.email,
      type: 'password_reset'
    };

    return jwt.sign(payload, process.env.JWT_RESET_SECRET, {
      expiresIn: process.env.JWT_RESET_EXPIRE || '15m'
    });
  },

  // Verify Access Token
  verifyAccessToken: (token) => {
    try {
      return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  },

  // Verify Refresh Token
  verifyRefreshToken: (token) => {
    try {
      return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  },

  // Verify Verification Token
  verifyVerificationToken: (token) => {
    try {
      return jwt.verify(token, process.env.JWT_VERIFICATION_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired verification token');
    }
  },

  // Verify Reset Token
  verifyResetToken: (token) => {
    try {
      return jwt.verify(token, process.env.JWT_RESET_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired reset token');
    }
  }
};

module.exports = jwtUtils;
