const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const sendMail = require('../utils/mailer');
const authcontroller = {
  gennerateAccessToken: (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_ACCESS_KEY, {
      expiresIn: '1d'
    });
  },
  gennerateRefreshToken: (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_REFRESH_KEY, {
      expiresIn: '7d'
    });
  },
  generateVerificationToken: (user) => {
    return jwt.sign({ id: user._id }, process.env.JWT_VERIFICATION_KEY, {
      expiresIn: '1h'
    });
  },
  generateResetPasswordToken: (user) => {
    return jwt.sign({ id: user._id }, process.env.JWT_RESET_PASSWORD_KEY, {
      expiresIn: '1h'
    });
  },

  registerUser: async (req, res) => {
    try {
      const { username, password, email } = req.body;

      const existingUser = await User.findOne({ $or: [{ username }, { email }] });
      if (existingUser) {
        if (existingUser.username === username) {
          return res.status(400).json({ message: 'Tên người dùng đã tồn tại' });
        }
        if (existingUser.email === email) {
          return res.status(400).json({ message: 'Email đã tồn tại' });
        }
      }

      const newUser = new User({
        username,
        email,
        password,
        isVerified: false
      });
      await newUser.save(); // Lưu người dùng trước

      const verificationToken = authcontroller.generateVerificationToken(newUser);
      const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
      await sendMail({
        email,
        subject: 'Xác thực Email của bạn',
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Xác thực Email</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <tr>
                <td style="padding: 20px 0; text-align: center; background-color: #007bff; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                  <img src="https://via.placeholder.com/150x50?text=Your+Logo" alt="Logo" style="max-width: 150px; height: auto;">
                </td>
              </tr>
              <tr>
                <td style="padding: 30px;">
                  <h1 style="font-size: 24px; color: #333333; margin: 0 0 20px; text-align: center;">Xác thực Email</h1>
                  <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">Xin chào ${username},</p>
                  <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">Vui lòng nhấp vào nút dưới đây để xác thực email của bạn và kích hoạt tài khoản:</p>
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 20px auto;">
                    <tr>
                      <td style="text-align: center;">
                        <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: #ffffff; text-decoration: none; font-size: 16px; border-radius: 4px; font-weight: bold;">Xác thực Email</a>
                      </td>
                    </tr>
                  </table>
                  <p style="font-size: 14px; color: #777777; line-height: 1.6; margin: 20px 0 0;">Liên kết này sẽ hết hạn sau 1 giờ. Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email.</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px; text-align: center; background-color: #f8f8f8; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                  <p style="font-size: 14px; color: #777777; margin: 0;">© 2025 Your Company. All rights reserved.</p>
                  <p style="font-size: 14px; color: #777777; margin: 5px 0 0;">
                    <a href="${process.env.CLIENT_URL}/unsubscribe" style="color: #007bff; text-decoration: none;">Hủy đăng ký</a>
                  </p>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `
      });

      return res.status(201).json({ message: 'Vui lòng kiểm tra email để xác thực tài khoản.' });
    } catch (error) {
      console.error('Lỗi trong quá trình đăng ký:', error);
      return res.status(500).json({ message: 'Lỗi server nội bộ' });
    }
  },

  verifyEmail: async (req, res) => {
    try {
      // Get token from headers or query parameters
      const verificationToken = req.headers['x-verification-token'] || req.query.token;
      if (!verificationToken) {
        return res.status(400).json({ message: 'Không có token xác thực' });
      }

      // Verify token
      const decoded = jwt.verify(verificationToken, process.env.JWT_VERIFICATION_KEY);
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(400).json({ message: 'Token xác thực không hợp lệ' });
      }

      if (user.isVerified) {
        return res.status(400).json({ message: 'Email đã được xác thực' });
      }

      // Update verification status
      user.isVerified = true;
      await user.save();

      // Generate auth token for login
      const authToken = authcontroller.gennerateAccessToken(user);

      return res.status(200).json({
        message: 'Email đã được xác thực thành công',
        token: authToken,
        user: {
          username: user.username,
          email: user.email
        }
      });
    } catch (error) {
      return res.status(400).json({ message: 'Token xác thực không hợp lệ hoặc đã hết hạn' });
    }
  },

  loginUser: async (req, res) => {
    try {
      const user = await User.findOne({ username: req.body.username });
      if (!user) {
        return res.status(401).json({ message: 'Invalid username' });
      }
      const isMatch = await bcrypt.compare(req.body.password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid password' });
      }
      if (user && isMatch) {
        const accessToken = authcontroller.gennerateAccessToken(user);
        const refreshToken = authcontroller.gennerateRefreshToken(user);

        // Set refresh token vào HTTP-only cookie
        res.cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: false,
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 ngày
        });

        const { password, ...userWithoutPassword } = user._doc;
        res.status(200).json({ ...userWithoutPassword, accessToken });
      }
    } catch (error) {
      console.error('Error during login:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
  // Đăng nhập bằng Google
  googleSignIn: async (req, res) => {
    const { idToken } = req.body;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      const googleId = payload['sub'];
      const email = payload['email'];

      let user = await User.findOne({ googleId });
      if (!user) {
        user = await User.findOne({ email });
        if (user) {
          user.googleId = googleId;
          await user.save();
        } else {
          user = new User({
            email,
            googleId,
            role: 'user',
            username: email.split('@')[0]
          });
          await user.save();
        }
      }

      const accessToken = authcontroller.gennerateAccessToken(user);
      const refreshToken = authcontroller.gennerateRefreshToken(user);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 365 * 24 * 60 * 60 * 1000
      });

      res.json({ accessToken });
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      res.status(401).json({ message: 'Invalid Google token', error: error.message });
    }
  },
  logout(req, res) {
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  },

  refreshToken: async (req, res) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_KEY);
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(403).json({ message: 'Invalid refresh token' });
      }

      // Tạo access token mới
      const newAccessToken = authcontroller.gennerateAccessToken(user);
      const newRefreshToken = authcontroller.gennerateRefreshToken(user);

      // Cập nhật refresh token mới vào cookie
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 365 * 24 * 60 * 60 * 1000 // 365 ngày
      });

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      res.status(403).json({ message: 'Invalid refresh token', error });
    }
  },
  forgotPassword: async (req, res) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({ message: 'Email không tồn tại' });
      }

      // Generate reset password token
      const resetToken = authcontroller.generateResetPasswordToken(user);
      const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;

      // Send reset password email
      await sendMail({
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Đặt lại mật khẩu</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <tr>
                <td style="padding: 20px 0; text-align: center; background-color: #007bff; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                  <img src="https://via.placeholder.com/150x50?text=Your+Logo" alt="Logo" style="max-width: 150px; height: auto;">
                </td>
              </tr>
              <tr>
                <td style="padding: 30px;">
                  <h1 style="font-size: 24px; color: #333333; margin: 0 0 20px; text-align: center;">Đặt lại mật khẩu</h1>
                  <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">Xin chào ${user.username},</p>
                  <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">Bạn đã yêu cầu đặt lại mật khẩu. Vui lòng nhấp vào nút dưới đây để đặt lại mật khẩu của bạn:</p>
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 20px auto;">
                    <tr>
                      <td style="text-align: center;">
                        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: #ffffff; text-decoration: none; font-size: 16px; border-radius: 4px; font-weight: bold;">Đặt lại mật khẩu</a>
                      </td>
                    </tr>
                  </table>
                  <p style="font-size: 14px; color: #777777; line-height: 1.6; margin: 20px 0 0;">Liên kết này sẽ hết hạn sau 1 giờ. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px; text-align: center; background-color: #f8f8f8; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                  <p style="font-size: 14px; color: #777777; margin: 0;">© 2025 Your Company. All rights reserved.</p>
                  <p style="font-size: 14px; color: #777777; margin: 5px 0 0;">
                    <a href="${process.env.CLIENT_URL}/unsubscribe" style="color: #007bff; text-decoration: none;">Hủy đăng ký</a>
                  </p>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `
      });

      return res.status(200).json({ message: 'Vui lòng kiểm tra email để đặt lại mật khẩu.' });
    } catch (error) {
      console.error('Lỗi trong quá trình gửi email đặt lại mật khẩu:', error);
      return res.status(500).json({ message: 'Lỗi server nội bộ' });
    }
  },

  resetPassword: async (req, res) => {
    try {
      console.log('Request body:', req.body);
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token và mật khẩu mới là bắt buộc' });
      }
      console.log('Verifying token:', token);
      const decoded = jwt.verify(token, process.env.JWT_RESET_PASSWORD_KEY);
      console.log('Decoded token:', decoded);
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(400).json({ message: 'Token đặt lại mật khẩu không hợp lệ' });
      }
      user.password = newPassword;
      await user.save();
      return res.status(200).json({ message: 'Mật khẩu đã được đặt lại thành công' });
    } catch (error) {
      console.error('Lỗi trong quá trình đặt lại mật khẩu:', error.message);
      return res
        .status(400)
        .json({ message: 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' });
    }
  }
};
module.exports = authcontroller;
