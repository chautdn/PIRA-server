const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const responseUtils = require('../utils/response');

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

// CRITICAL: Proper rate limiting without IPv6 issues
const chatMessageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 messages per minute
  message: { error: 'Too many messages sent. Please wait before sending another.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.user // Only apply to authenticated users
});

const chatActionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 actions per minute (read, typing, etc.)
  message: { error: 'Too many chat actions. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.user // Only apply to authenticated users
});

// Chat validation schemas
const validateConversation = [
  body('participantId').isMongoId().withMessage('Invalid participant ID'),
  body('listingId').optional().isMongoId().withMessage('Invalid listing ID'),
  body('bookingId').optional().isMongoId().withMessage('Invalid booking ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }
    next();
  }
];

const validateMessage = [
  body('conversationId').isMongoId().withMessage('Invalid conversation ID'),
  body('content')
    .optional()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Content must be 1-2000 characters'),
  body('type').optional().isIn(['TEXT', 'IMAGE', 'SYSTEM']).withMessage('Invalid message type'),
  body('replyTo').optional().isMongoId().withMessage('Invalid reply message ID'),
  body('media.url').optional().isURL().withMessage('Invalid media URL'),
  body('media.mime')
    .optional()
    .isIn(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
    .withMessage('Invalid media type. Only PNG, JPG, and WebP are allowed'),
  body('media.size')
    .optional()
    .isInt({ min: 1, max: 5242880 }) // 5MB max
    .withMessage('Media size must be between 1 byte and 5MB'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }

    // Additional validation for message content/media
    const { content, type, media } = req.body;

    if (type === 'TEXT' && !content) {
      return responseUtils.validationError(res, [
        { msg: 'Content is required for text messages', param: 'content' }
      ]);
    }

    if (type === 'IMAGE' && (!media || !media.url)) {
      return responseUtils.validationError(res, [
        { msg: 'Media URL is required for image messages', param: 'media.url' }
      ]);
    }

    next();
  }
];

const validateConversationId = [
  param('id').isMongoId().withMessage('Invalid conversation ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }
    next();
  }
];

const validateMessageId = [
  param('id').isMongoId().withMessage('Invalid message ID'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }
    next();
  }
];

const validatePagination = [
  query('cursor').optional().isISO8601().withMessage('Invalid cursor date'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return responseUtils.validationError(res, errors.array());
    }
    next();
  }
];

module.exports = {
  validateRegister,
  validateLogin,
  authLimiter,
  // Chat validation exports
  validateConversation,
  validateMessage,
  validateConversationId,
  validateMessageId,
  validatePagination,
  chatMessageLimiter,
  chatActionLimiter
};
