const authService = require('../services/auth.Service');
const responseUtils = require('../utils/response');

const authController = {
  // Register
  registerUser: async (req, res) => {
    try {
      const user = await authService.createUser(req.body);
      await authService.sendVerificationEmail(user);

      responseUtils.success(
        res,
        {
          email: user.email,
          message: 'Tài khoản đã được tạo thành công'
        },
        'Vui lòng kiểm tra email để xác thực tài khoản.',
        201
      );
    } catch (error) {
      // Register error
      responseUtils.error(res, error.message, 400);
    }
  },

  // Verify Email
  verifyEmail: async (req, res) => {
    try {
      const token = req.headers['x-verification-token'] || req.query.token;

      if (!token) {
        return responseUtils.error(res, 'Token xác thực là bắt buộc', 400);
      }

      const result = await authService.verifyUserEmail(token);

      // Set refresh token cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      const { password, ...userWithoutPassword } = result.user.toObject();

      responseUtils.success(
        res,
        {
          user: userWithoutPassword,
          accessToken: result.accessToken
        },
        result.message,
        200
      );
    } catch (error) {
      // Verify email error
      responseUtils.error(res, error.message, 400);
    }
  },

  // Resend verification email
  resendVerificationEmail: async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return responseUtils.error(res, 'Email là bắt buộc', 400);
      }

      await authService.resendVerificationEmail(email);

      responseUtils.success(res, null, 'Email xác thực đã được gửi lại');
    } catch (error) {
      // Resend verification error
      responseUtils.error(res, error.message, 400);
    }
  },

  // Login
  loginUser: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return responseUtils.error(res, 'Email và mật khẩu là bắt buộc', 400);
      }

      const result = await authService.loginUser(email, password);

      // Set refresh token cookie
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      const { password: userPassword, ...userWithoutPassword } = result.user;

      responseUtils.success(
        res,
        {
          user: userWithoutPassword,
          accessToken: result.accessToken
        },
        'Đăng nhập thành công'
      );
    } catch (error) {
      // Login error
      responseUtils.error(res, error.message, 401);
    }
  },

  // Google Sign In
  googleSignIn: async (req, res) => {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return responseUtils.error(res, 'Google ID token is required', 400);
      }

      // Validate Google Client ID
      if (!process.env.GOOGLE_CLIENT_ID) {
        return responseUtils.error(res, 'Google authentication not configured', 500);
      }

      const result = await authService.googleSignIn(idToken);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000
      });

      const { password, ...userWithoutPassword } = result.user;

      responseUtils.success(
        res,
        {
          accessToken: result.accessToken,
          user: userWithoutPassword
        },
        'Google sign in successful'
      );
    } catch (error) {
      // Google Sign-In Error
      responseUtils.error(res, 'Invalid Google token', 401);
    }
  },

  // Logout
  logout: (req, res) => {
    res.clearCookie('refreshToken');
    responseUtils.success(res, null, 'Logged out successfully');
  },

  // Refresh Token
  refreshToken: async (req, res) => {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return responseUtils.error(res, 'No refresh token provided', 401);
      }

      const result = await authService.refreshUserToken(refreshToken);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      responseUtils.success(res, { accessToken: result.accessToken });
    } catch (error) {
      responseUtils.error(res, 'Invalid refresh token', 403);
    }
  },

  // Forgot Password
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;
      await authService.sendResetPasswordEmail(email);

      responseUtils.success(res, null, 'Vui lòng kiểm tra email để đặt lại mật khẩu.');
    } catch (error) {
      // Forgot password error
      responseUtils.error(res, error.message, 400);
    }
  },

  // Reset Password
  resetPassword: async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return responseUtils.error(res, 'Token và mật khẩu mới là bắt buộc', 400);
      }

      await authService.resetUserPassword(token, newPassword);

      responseUtils.success(res, null, 'Mật khẩu đã được đặt lại thành công');
    } catch (error) {
      // Reset password error
      responseUtils.error(res, error.message, 400);
    }
  }
};

module.exports = authController;
