const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const webhookController = require('../controllers/webhook.controller');
const { authMiddleware } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { BadRequestError } = require('../core/error');

// Rate limiting for payment operations
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 payment requests per minute per IP
  message: {
    success: false,
    message: 'Too many payment requests. Please wait before trying again.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Webhook rate limiting (more permissive)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // High limit for legitimate webhooks
  message: {
    success: false,
    message: 'Webhook rate limit exceeded'
  }
});

// Validation middleware for handling validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => error.msg);
    throw new BadRequestError(`Validation failed: ${errorMessages.join(', ')}`);
  }
  next();
};

// Amount validation
const validateAmount = [
  body('amount')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom((value) => {
      const amount = Number(value);
      const MIN_AMOUNT = Number(process.env.MIN_TOPUP_AMOUNT) || 2000;
      const MAX_AMOUNT = Number(process.env.MAX_TOPUP_AMOUNT) || 50000000;

      if (amount < MIN_AMOUNT) {
        throw new Error(`Amount must be at least ${MIN_AMOUNT.toLocaleString()} VND`);
      }
      if (amount > MAX_AMOUNT) {
        throw new Error(`Amount cannot exceed ${MAX_AMOUNT.toLocaleString()} VND`);
      }
      return true;
    }),
  handleValidationErrors
];

// Order code validation
const validateOrderCode = [
  param('orderCode')
    .isNumeric()
    .withMessage('Invalid order code format')
    .isLength({ min: 10, max: 20 })
    .withMessage('Order code must be between 10-20 digits'),
  handleValidationErrors
];

// Pagination validation
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type')
    .optional()
    .isIn(['deposit', 'withdrawal', 'payment', 'refund', 'penalty'])
    .withMessage('Invalid transaction type'),
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'success', 'failed', 'cancelled'])
    .withMessage('Invalid status'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
  handleValidationErrors
];

// Public routes (no authentication required)
router.post('/webhook', webhookLimiter, webhookController.handlePayOSWebhook);

router.get('/health', paymentController.healthCheck);

// Protected routes (authentication required)
router.use(authMiddleware.verifyToken);

// Payment endpoints
router.post('/topup', paymentLimiter, validateAmount, paymentController.createTopUpSession);

router.get('/verify/:orderCode', validateOrderCode, paymentController.verifyPayment);

router.get('/transactions', validatePagination, paymentController.getTransactionHistory);

router.get('/wallet/balance', paymentController.getWalletBalance);

// Register routes
const { registerRoute } = require('./register.routes');
registerRoute('/payment', router);

module.exports = router;
