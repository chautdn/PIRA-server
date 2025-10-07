const express = require('express');
const router = express.Router();
const {
  createUser,
  getUsers,
  getProfile,
  updateProfile,
  updateProfileByKyc
} = require('../controllers/user.controller');
const { registerRoute } = require('./register.routes');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware.verifyToken, authMiddleware.checkUserRole('admin'), getUsers); // Lấy danh sách user
router.post('/create', authMiddleware.checkUserRole('admin'), createUser); // Tạo user mới
router.get('/profile', authMiddleware.verifyToken, getProfile); // Lấy thông tin user
router.put('/profile', authMiddleware.verifyToken, updateProfile); // Cập nhật thông tin user
router.put('/profile-by-kyc', authMiddleware.verifyToken, updateProfileByKyc); // Cập nhật thông tin user
registerRoute('/users', router);

module.exports = router;
