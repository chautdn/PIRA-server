const express = require('express');
const router = express.Router();
const adminTransactionController = require('../controllers/adminTransaction.controller');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/validation');

// Apply authentication and admin authorization to all routes
router.use(authMiddleware.verifyToken);
router.use(requireRole('ADMIN'));

/**
 * @route   GET /api/admin/transactions/stats
 * @desc    Get transaction statistics with time series data
 * @access  Admin only
 * @query   startDate, endDate, period (hour|day|week|month)
 */
router.get('/stats', adminTransactionController.getTransactionStats);

/**
 * @route   GET /api/admin/transactions/export
 * @desc    Export transactions to CSV or JSON
 * @access  Admin only
 * @query   type, status, startDate, endDate, format (csv|json)
 */
router.get('/export', adminTransactionController.exportTransactions);

/**
 * @route   GET /api/admin/transactions
 * @desc    Get all transactions with filters and pagination
 * @access  Admin only
 * @query   page, limit, search, type, status, startDate, endDate, minAmount, maxAmount, sortBy, sortOrder
 */
router.get('/', adminTransactionController.getAllTransactions);

/**
 * @route   GET /api/admin/transactions/:transactionId
 * @desc    Get transaction by ID with detailed user statistics
 * @access  Admin only
 */
router.get('/:transactionId', adminTransactionController.getTransactionById);

module.exports = router;
