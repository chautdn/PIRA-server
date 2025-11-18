const User = require('../models/User');
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const jwtUtils = require('../utils/jwt');
const sendMail = require('../utils/mailer');
const emailTemplates = require('../utils/emailTemplates');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const authService = {
  // Register user
  createUser: async (userData) => {
    const { password, email } = userData;

    // Check existing user
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new Error('Email đã tồn tại');
    }

    // Create new user
    const newUser = new User({
      email,
      password,
      status: 'PENDING',
      verification: {
        emailVerified: false,
        identityVerified: false
      }
    });

    // Save and log DB connection info for debugging
    await newUser.save();
    try {
      const mongoose = require('mongoose');
      const connName = mongoose.connection && mongoose.connection.name;
      console.log(`🛈 New user created: ${newUser._id} (db: ${connName})`);
    } catch (err) {
      // ignore logging errors
    }

    return newUser;
  },

  // Send verification email
  sendVerificationEmail: async (user) => {
    const verificationToken = jwtUtils.generateVerificationToken(user);
    const verificationUrl = `${process.env.CLIENT_URL}/auth/verify-email?token=${verificationToken}`;

    await sendMail({
      email: user.email,
      subject: 'Xác thực Email của bạn - PIRA System',
      html: emailTemplates.verificationEmail(
        user.profile?.firstName || user.email.split('@')[0],
        verificationUrl
      )
    });
  },

  // Verify email - ✅ FIXED
  verifyUserEmail: async (token) => {
    try {
      const decoded = jwtUtils.verifyVerificationToken(token); // ✅ Chỉ truyền 1 tham số
      const user = await User.findById(decoded.id);

      if (!user) {
        throw new Error('Người dùng không tồn tại');
      }

      // Nếu đã verify rồi
      if (user.verification.emailVerified) {
        const accessToken = jwtUtils.generateAccessToken(user);
        const refreshToken = jwtUtils.generateRefreshToken(user);

        user.lastLoginAt = new Date();
        await user.save();

        return {
          user,
          accessToken,
          refreshToken,
          message: 'Email đã được xác thực trước đó. Đăng nhập thành công.'
        };
      }

      // Verify email
      user.verification.emailVerified = true;
      user.status = 'ACTIVE';
      user.lastLoginAt = new Date();

      await user.save();

      const accessToken = jwtUtils.generateAccessToken(user);
      const refreshToken = jwtUtils.generateRefreshToken(user);

      return {
        user,
        accessToken,
        refreshToken,
        message: 'Email đã được xác thực thành công!'
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Token xác thực không hợp lệ');
      } else if (error.name === 'TokenExpiredError') {
        throw new Error('Token xác thực đã hết hạn');
      }
      throw error;
    }
  },

  // Login user
  loginUser: async (email, password) => {
    const user = await User.findOne({ email }).populate('wallet');

    if (!user) {
      throw new Error('Tài khoản không tồn tại');
    }

    // Kiểm tra trạng thái
    if (user.status === 'BANNED') {
      throw new Error('Tài khoản đã bị cấm');
    }

    if (user.status === 'SUSPENDED') {
      throw new Error('Tài khoản đang bị tạm khóa');
    }

    if (!user.verification.emailVerified) {
      throw new Error('Vui lòng xác thực email trước khi đăng nhập');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error('Mật khẩu không đúng');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const accessToken = jwtUtils.generateAccessToken(user);
    const refreshToken = jwtUtils.generateRefreshToken(user);

    return {
      user: user.toObject(),
      accessToken,
      refreshToken
    };
  },

  // Google Sign In
  googleSignIn: async (idToken) => {
    try {
      if (!process.env.GOOGLE_CLIENT_ID) {
        throw new Error('GOOGLE_CLIENT_ID not configured in environment variables');
      }

      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });

      const payload = ticket.getPayload();
      const googleId = payload['sub'];
      const email = payload['email'];
      const name = payload['name'];
      const picture = payload['picture'];

      let user = await User.findOne({ email }).populate('wallet');

      if (!user) {
        // Prepare profile data without undefined/empty values
        const profileData = {
          firstName: name || email.split('@')[0]
        };

        if (picture) {
          profileData.avatar = picture;
        }

        user = new User({
          email,
          profile: profileData,
          role: 'RENTER',
          status: 'ACTIVE',
          verification: {
            emailVerified: true,
            phoneVerified: false,
            identityVerified: false
          },
          password: 'google_auth_' + googleId,
          lastLoginAt: new Date()
        });
        await user.save();
        // Populate wallet after creation
        user = await User.findById(user._id).populate('wallet');
      } else {
        // Update existing user without touching profile fields that might cause validation errors
        const updateData = {
          lastLoginAt: new Date()
        };

        if (!user.verification.emailVerified) {
          updateData['verification.emailVerified'] = true;
          updateData.status = 'ACTIVE';
        }

        // Update avatar if provided and not already set
        if (picture && !user.profile?.avatar) {
          updateData['profile.avatar'] = picture;
        }

        // Use findByIdAndUpdate to avoid validation issues with existing data
        user = await User.findByIdAndUpdate(user._id, updateData, {
          new: true,
          runValidators: false // Skip validation for existing data
        }).populate('wallet');
      }

      const accessToken = jwtUtils.generateAccessToken(user);
      const refreshToken = jwtUtils.generateRefreshToken(user);

      return {
        user: user.toObject(),
        accessToken,
        refreshToken
      };
    } catch (error) {
      throw new Error('Google authentication failed');
    }
  },

  // Resend verification email
  resendVerificationEmail: async (email) => {
    const user = await User.findOne({ email });

    if (!user) {
      throw new Error('Email không tồn tại');
    }

    if (user.verification.emailVerified) {
      throw new Error('Email đã được xác thực');
    }

    await authService.sendVerificationEmail(user);
  },

  // Forgot password
  sendResetPasswordEmail: async (email) => {
    const user = await User.findOne({ email });

    if (!user) {
      throw new Error('Email không tồn tại');
    }

    if (!user.verification.emailVerified) {
      throw new Error('Vui lòng xác thực email trước khi đặt lại mật khẩu');
    }

    const resetToken = jwtUtils.generateResetToken(user);
    const resetUrl = `${process.env.CLIENT_URL}/auth/reset-password?token=${resetToken}`;

    await sendMail({
      email: user.email,
      subject: 'Đặt lại mật khẩu - PIRA System',
      html: emailTemplates.resetPasswordEmail(
        user.profile?.firstName || user.email.split('@')[0],
        resetUrl
      )
    });
  },

  // Reset password - ✅ FIXED
  resetUserPassword: async (token, newPassword) => {
    try {
      const decoded = jwtUtils.verifyResetToken(token); // ✅ Chỉ truyền 1 tham số
      const user = await User.findById(decoded.id);

      if (!user) {
        throw new Error('Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
      }

      user.password = newPassword;
      await user.save();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Token đặt lại mật khẩu không hợp lệ');
      }
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token đặt lại mật khẩu đã hết hạn');
      }
      throw error;
    }
  },

  // Refresh token - ✅ FIXED
  refreshUserToken: async (refreshToken) => {
    try {
      const decoded = jwtUtils.verifyRefreshToken(refreshToken); // ✅ Dùng đúng method
      const user = await User.findById(decoded.id);

      if (!user || user.status !== 'ACTIVE') {
        throw new Error('Invalid refresh token');
      }

      const newAccessToken = jwtUtils.generateAccessToken(user);
      const newRefreshToken = jwtUtils.generateRefreshToken(user);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
};

module.exports = authService;
