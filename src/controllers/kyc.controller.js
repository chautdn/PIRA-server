const { SuccessResponse } = require('../core/success');
const responseUtils = require('../utils/response');
const {
  uploadCCCD,
  updateCCCDInfo, // Đổi từ verifyCCCD sang updateCCCDInfo
  getCCCDImages,
  getUserCCCD,
  deleteCCCDImages,
  getKYCStatus
} = require('../services/kyc.service');

const kycController = {
  // Upload ảnh CCCD (tự động OCR)
  uploadCCCDImages: async (req, res) => {
    try {
      const userId = req.user.id;
      const files = req.files;

      console.log('Files received:', files);

      const result = await uploadCCCD(userId, files);
      return SuccessResponse.ok(res, result, 'Upload CCCD thành công');
    } catch (error) {
      console.error('Upload CCCD error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  },

  // Cập nhật thông tin CCCD thủ công (thay thế cho verifyCCCD)
  updateCCCDInfo: async (req, res) => {
    try {
      const userId = req.user.id;
      const cccdInfo = req.body;

      const result = await updateCCCDInfo(userId, cccdInfo);
      return SuccessResponse.ok(res, result, 'Cập nhật thông tin CCCD thành công');
    } catch (error) {
      console.error('Update CCCD info error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  },

  // Lấy ảnh CCCD
  getCCCDImages: async (req, res) => {
    try {
      const userId = req.user.id;

      const images = await getCCCDImages(userId);
      return SuccessResponse.ok(res, images, 'Lấy ảnh CCCD thành công');
    } catch (error) {
      console.error('Get CCCD images error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  },

  // Lấy thông tin CCCD
  getUserCCCD: async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await getUserCCCD(userId);

      console.log('🔍 Controller - CCCD result:', result);

      if (result) {
        return SuccessResponse.ok(res, result, 'Lấy thông tin CCCD thành công');
      } else {
        return SuccessResponse.ok(res, null, 'Không có thông tin CCCD');
      }
    } catch (error) {
      console.error('Get CCCD info error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  },

  // Xóa ảnh CCCD
  deleteCCCDImages: async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await deleteCCCDImages(userId);
      return SuccessResponse.ok(res, result, 'Xóa ảnh CCCD thành công');
    } catch (error) {
      console.error('Delete CCCD images error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  },

  // Lấy trạng thái KYC
  getKYCStatus: async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await getKYCStatus(userId);

      console.log('🔍 Controller - KYC Status result:', result);

      return SuccessResponse.ok(res, result, 'Lấy trạng thái KYC thành công');
    } catch (error) {
      console.error('Get KYC status error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }
};

module.exports = kycController;
