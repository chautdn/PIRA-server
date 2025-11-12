const express = require('express');
const router = express.Router();
const {
  createUser,
  getUsers,
  getProfile,
  updateProfile,
  updateProfileByKyc,
  createReport,
  getUserReports,
  getReportById
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
router.put('/profile-by-kyc', authMiddleware.verifyToken, updateProfileByKyc); // Cập nhật thông tin user từ KYC

// ========== REPORT ROUTES ==========
router.post('/reports', authMiddleware.verifyToken, reportLimiter, validateCreateReport, createReport); // Tạo báo cáo mới
router.get('/reports', authMiddleware.verifyToken, getUserReports); // Lấy danh sách báo cáo của user
router.get('/reports/:reportId', authMiddleware.verifyToken, validateReportId, getReportById); // Lấy chi tiết báo cáo
registerRoute('/users', router);

module.exports = router;
