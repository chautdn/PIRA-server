const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 5, // Tối đa 5 lần thử
  message: {
    message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const validateRegister = [
  body('email').isEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateLogin = [
  body('email').notEmpty().withMessage('email là bắt buộc'),
  body('password').notEmpty().withMessage('Password là bắt buộc'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = { validateRegister, validateLogin, authLimiter };
