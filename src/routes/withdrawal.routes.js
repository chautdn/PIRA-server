const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawal.controller');
const { authMiddleware } = require('../middleware/auth');
const kycCheckMiddleware = require('../middleware/kycCheck');
const { body } = require('express-validator');
const { handleValidationErrors, requireRole } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');

// Rate limiting for withdrawal requests
const withdrawalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: 'Too many withdrawal requests, please try again later'
});

// Validation rules
const validateWithdrawalRequest = [
  body('amount')
    .isNumeric()
    .withMessage('Amount must be a number')
    .custom((value) => value >= 10000)
    .withMessage('Minimum withdrawal is 10,000 VND')
    .custom((value) => value <= 50000000)
    .withMessage('Maximum withdrawal is 50,000,000 VND'),
  body('note').optional().isLength({ max: 200 }).withMessage('Note must not exceed 200 characters'),
  handleValidationErrors
];

// All routes require authentication
router.use(authMiddleware.verifyToken);

// User withdrawal routes
router.get('/', withdrawalController.getUserWithdrawals);
router.get('/daily-total', withdrawalController.getDailyTotal);

// KYC required for withdrawal requests
router.post(
  '/',
  kycCheckMiddleware.checkKycStatus,
  withdrawalLimiter,
  validateWithdrawalRequest,
  withdrawalController.requestWithdrawal
);

router.patch('/:id/cancel', withdrawalController.cancelWithdrawal);

// Admin routes
router.get('/admin/all', requireRole('ADMIN'), withdrawalController.getAllWithdrawals);
router.patch(
  '/admin/:id/status',
  requireRole('ADMIN'),
  [
    body('status').isIn(['processing', 'completed', 'rejected']).withMessage('Invalid status'),
    body('adminNote')
      .optional()
      .isLength({ max: 500 })
      .withMessage('Admin note must not exceed 500 characters'),
    body('rejectionReason')
      .if(body('status').equals('rejected'))
      .notEmpty()
      .withMessage('Rejection reason is required')
      .isLength({ max: 500 })
      .withMessage('Rejection reason must not exceed 500 characters'),
    handleValidationErrors
  ],
  withdrawalController.updateWithdrawalStatus
);

module.exports = router;
