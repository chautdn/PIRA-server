const express = require('express');
const router = express.Router();
const bankVerificationController = require('../controllers/bankVerification.controller');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/validation');

// Apply authentication and admin authorization to all routes
router.use(authMiddleware.verifyToken);
router.use(requireRole('ADMIN'));

/**
 * @route   GET /api/admin/bank-verification
 * @desc    Get all bank accounts with filters
 * @access  Admin only
 */
router.get('/', bankVerificationController.getAllBankAccounts);

/**
 * @route   GET /api/admin/bank-verification/:userId
 * @desc    Get bank account detail by user ID
 * @access  Admin only
 */
router.get('/:userId', bankVerificationController.getBankAccountById);

/**
 * @route   PATCH /api/admin/bank-verification/:userId/verify
 * @desc    Verify bank account
 * @access  Admin only
 */
router.patch('/:userId/verify', bankVerificationController.verifyBankAccount);

/**
 * @route   PATCH /api/admin/bank-verification/:userId/reject
 * @desc    Reject bank account verification
 * @access  Admin only
 */
router.patch('/:userId/reject', bankVerificationController.rejectBankAccount);

/**
 * @route   PATCH /api/admin/bank-verification/:userId/status
 * @desc    Update bank account status
 * @access  Admin only
 */
router.patch('/:userId/status', bankVerificationController.updateBankAccountStatus);

module.exports = router;
