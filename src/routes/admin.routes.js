const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authMiddleware } = require('../middleware/auth');
const { 
  requireRole
} = require('../middleware/validation');
const { registerRoute } = require('./register.routes');

router.use(authMiddleware.verifyToken);
router.use(requireRole('ADMIN'));

// ========== DASHBOARD ==========
router.get('/dashboard', adminController.getDashboard);

// ========== TEST ROUTES ==========

// ========== USER MANAGEMENT ==========
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.get('/users/:userId/orders', adminController.getUserOrders);
router.get('/users/:userId/products', adminController.getUserProducts);
router.get('/users/:userId/bank-account', adminController.getUserBankAccount);
// router.put('/users/:userId', adminController.updateUser);
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.patch('/users/:userId/role', adminController.updateUserRole);
// router.patch('/users/:userId/credit-score', adminController.updateUserCreditScore);
router.patch('/users/bulk-update', adminController.bulkUpdateUsers);

// ========== PRODUCT MANAGEMENT ==========
router.get('/products', adminController.getAllProducts);
router.get('/products/:productId', adminController.getProductById);
router.patch('/products/:productId/status', adminController.updateProductStatus);
// router.patch('/products/:productId/approve', adminController.approveProduct);
// router.patch('/products/:productId/reject', adminController.rejectProduct);

// ========== CATEGORY MANAGEMENT ==========
// router.get('/categories', adminController.getAllCategories);
// router.post('/categories', adminController.createCategory);
// router.put('/categories/:categoryId', adminController.updateCategory);
// router.delete('/categories/:categoryId', adminController.deleteCategory);

// ========== ORDER MANAGEMENT ==========
router.get('/orders', adminController.getAllOrders);
router.get('/orders/:orderId', adminController.getOrderById);
router.patch('/orders/:orderId/status', adminController.updateOrderStatus);

// ========== REPORT MANAGEMENT ==========
router.get('/reports', adminController.getAllReports);
router.get('/reports/:reportId', adminController.getReportById);
router.patch('/reports/:reportId/status', adminController.updateReportStatus);
router.patch('/reports/:reportId/suspend-product', adminController.suspendReportedProduct);

// ========== BANK ACCOUNT VERIFICATION ==========
router.get('/bank-accounts', adminController.getAllBankAccounts);
router.get('/bank-accounts/:userId', adminController.getBankAccountById);
router.patch('/bank-accounts/:userId/verify', adminController.verifyBankAccount);
router.patch('/bank-accounts/:userId/reject', adminController.rejectBankAccount);
router.patch('/bank-accounts/:userId/status', adminController.updateBankAccountStatus);

// ========== TRANSACTION MANAGEMENT ==========
router.get('/transactions/stats', adminController.getTransactionStats);
router.get('/transactions/export', adminController.exportTransactions);
router.get('/transactions', adminController.getAllTransactions);
router.get('/transactions/:transactionId', adminController.getTransactionById);

// ========== WITHDRAWAL FINANCIAL ANALYSIS ==========
router.get('/withdrawals/enhanced', adminController.getEnhancedWithdrawalRequests);
router.get('/withdrawals/:withdrawalId/financial-analysis', adminController.getWithdrawalFinancialAnalysis);
router.get('/users/:userId/financial-profile', adminController.getUserFinancialProfile);

// ========== SYSTEM SETTINGS ==========
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// Đăng ký routes với prefix /admin
registerRoute('/admin', router);

module.exports = router;
