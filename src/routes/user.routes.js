const express = require('express');
const router = express.Router();
const {
  createUser,
  getUsers,
  getProfile,
  updateProfile,
  updateProfileByKyc,
  getBankAccount,
  addBankAccount,
  updateBankAccount,
  removeBankAccount,
  getVietnameseBanks
} = require('../controllers/user.controller');
const { registerRoute } = require('./register.routes');
const { authMiddleware } = require('../middleware/auth');
const { 
  validateCreateReport, 
  validateReportId, 
  reportLimiter 
} = require('../middleware/validation');

router.get('/', authMiddleware.verifyToken, authMiddleware.checkUserRole('admin'), getUsers); // Lấy danh sách user
router.post('/create', authMiddleware.checkUserRole('admin'), createUser); // Tạo user mới
router.get('/profile', authMiddleware.verifyToken, getProfile); // Lấy thông tin user
router.put('/profile', authMiddleware.verifyToken, updateProfile); // Cập nhật thông tin user
router.put('/profile-by-kyc', authMiddleware.verifyToken, updateProfileByKyc); // Cập nhật thông tin user

// Bank Account routes
router.get('/banks', getVietnameseBanks); // Get list of Vietnamese banks (public)
router.get('/bank-account', authMiddleware.verifyToken, getBankAccount); // Get user's bank account
router.post('/bank-account', authMiddleware.verifyToken, addBankAccount); // Add bank account
router.put('/bank-account', authMiddleware.verifyToken, updateBankAccount); // Update bank account
router.delete('/bank-account', authMiddleware.verifyToken, removeBankAccount); // Remove bank account

registerRoute('/users', router);

module.exports = router;
