const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kyc.controller');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { registerRoute } = require('./register.routes');

// Middleware xác thực cho tất cả routes
router.use(authMiddleware.verifyToken);

// Upload ảnh CCCD (mặt trước và mặt sau) - Tự động OCR
router.post(
  '/upload-cccd',
  upload.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 }
  ]),
  kycController.uploadCCCDImages
);

// Lấy ảnh CCCD
router.get('/cccd-images', kycController.getCCCDImages);

// Lấy thông tin CCCD
router.get('/cccd-info', kycController.getUserCCCD);

// Cập nhật thông tin CCCD thủ công (sau khi user xác nhận)
router.put('/cccd-info', kycController.updateCCCDInfo);

// Xóa ảnh CCCD
router.delete('/cccd-images', kycController.deleteCCCDImages);

// Lấy trạng thái KYC
router.get('/status', kycController.getKYCStatus);

registerRoute('/kyc', router);

module.exports = router;
