const express = require('express');
const router = express.Router();
const voucherController = require('../controllers/voucher.controller');
const { authMiddleware } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware.verifyToken);

// Get user's vouchers
router.get('/', voucherController.getUserVouchers);

// Get loyalty points balance
router.get('/loyalty-points', voucherController.getLoyaltyPoints);

// Redeem voucher with loyalty points
router.post('/redeem', voucherController.redeemVoucher);

// Validate voucher code
router.post('/validate', voucherController.validateVoucher);

module.exports = router;
