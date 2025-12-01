const express = require('express');
const router = express.Router();
const systemWalletController = require('../controllers/systemWallet.controller');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/validation');
const { registerRoute } = require('./register.routes');

// All routes require authentication and ADMIN role
router.use(authMiddleware.verifyToken);
router.use(requireRole('ADMIN'));

// ========== SYSTEM WALLET MANAGEMENT (ADMIN ONLY) ==========

// Get system wallet balance and info
router.get('/balance', systemWalletController.getBalance);

// Add funds to system wallet (manual deposit)
router.post('/add-funds', systemWalletController.addFunds);

// Deduct funds from system wallet (manual withdrawal)
router.post('/deduct-funds', systemWalletController.deductFunds);

// Transfer from system wallet to user wallet (refunds, rewards, etc.)
router.post('/transfer-to-user', systemWalletController.transferToUser);

// Transfer from user wallet to system wallet (fees, penalties, etc.)
router.post('/transfer-from-user', systemWalletController.transferFromUser);

// Get system wallet transaction history
router.get('/transactions', systemWalletController.getTransactions);

// Get system wallet transaction statistics
router.get('/statistics', systemWalletController.getStatistics);

// ========== COMPREHENSIVE TRANSACTION MONITORING ==========

// Get ALL transactions involving system wallet
router.get('/all-transactions', systemWalletController.getAllTransactions);

// Get transaction flow analytics
router.get('/flow-analytics', systemWalletController.getFlowAnalytics);

// Get recent system wallet activity
router.get('/recent-activity', systemWalletController.getRecentActivity);

// Get comprehensive dashboard data
router.get('/dashboard', systemWalletController.getDashboard);

// Update system wallet status
router.patch('/status', systemWalletController.updateStatus);

// Register routes with prefix /admin/system-wallet
registerRoute('/admin/system-wallet', router);

module.exports = router;
