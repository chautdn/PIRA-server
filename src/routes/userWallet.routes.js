const express = require('express');
const router = express.Router();
const userWalletController = require('../controllers/userWallet.controller');
const authMiddleware = require('../middleware/auth');

/**
 * User Wallet Routes
 * All routes require authentication
 */

// Get user's wallet balance with frozen details
router.get('/balance', authMiddleware, userWalletController.getWalletBalance);

// Get all frozen funds for the user
router.get('/frozen-funds', authMiddleware, userWalletController.getFrozenFunds);

module.exports = router;
