const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/validation');
const { registerRoute } = require('./register.routes');



router.use(authMiddleware.verifyToken);
router.use(requireRole('ADMIN'));

// ========== DASHBOARD ==========
router.get('/dashboard', adminController.getDashboard);

// ========== TEST ROUTES ==========


// ========== USER MANAGEMENT ==========
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.put('/users/:userId', adminController.updateUser);
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.patch('/users/:userId/role', adminController.updateUserRole);
router.delete('/users/:userId', adminController.deleteUser);
router.patch('/users/bulk-update', adminController.bulkUpdateUsers);

// ========== PRODUCT MANAGEMENT ==========
router.get('/products', adminController.getAllProducts);
router.patch('/products/:productId/approve', adminController.approveProduct);
router.patch('/products/:productId/reject', adminController.rejectProduct);

// ========== CATEGORY MANAGEMENT ==========
router.get('/categories', adminController.getAllCategories);
router.post('/categories', adminController.createCategory);
router.put('/categories/:categoryId', adminController.updateCategory);
router.delete('/categories/:categoryId', adminController.deleteCategory);

// ========== ORDER MANAGEMENT ==========
router.get('/orders', adminController.getAllOrders);
router.get('/orders/:orderId', adminController.getOrderById);

// ========== REPORT MANAGEMENT ==========
router.get('/reports', adminController.getAllReports);
router.patch('/reports/:reportId/resolve', adminController.resolveReport);

// ========== SYSTEM SETTINGS ==========
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// Đăng ký routes với prefix /admin
registerRoute('/admin', router);

module.exports = router;