// middleware/kycCheck.js
const User = require('../models/User');

const kycCheck = {
  // Kiểm tra cho OWNER khi đăng sản phẩm - yêu cầu CCCD và Bank Account
  requireOwnerKYC: async (req, res, next) => {
    try {
      // Only check for OWNER role
      if (req.user.role !== 'OWNER') {
        return next();
      }

      // Get full user data with CCCD and bank account information
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check CCCD verification
      if (!user.cccd || !user.cccd.isVerified) {
        return res.status(403).json({
          success: false,
          message:
            'CCCD verification required. Please complete KYC verification before creating products.',
          kycRequired: true,
          missingRequirements: {
            cccdVerified: false,
            bankAccountAdded: !!user.bankAccount && !!user.bankAccount.accountNumber
          }
        });
      }

      // Check bank account
      if (!user.bankAccount || !user.bankAccount.accountNumber || !user.bankAccount.bankCode) {
        return res.status(403).json({
          success: false,
          message: 'Bank account required. Please add a bank account before creating products.',
          kycRequired: true,
          missingRequirements: {
            cccdVerified: true,
            bankAccountAdded: false
          }
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Kiểm tra cho RENTER khi thuê thiết bị có giá trị cao
  requireRenterKYC: (minimumValue = 5000000) => {
    return async (req, res, next) => {
      try {
        if (req.user.role !== 'RENTER') {
          return next();
        }

        // Lấy thông tin sản phẩm để check giá trị
        const { productId, rentalDays } = req.body;
        const product = await Product.findById(productId);

        const totalValue = product.pricePerDay * rentalDays;

        if (totalValue >= minimumValue) {
          const kycStatus = await getKYCStatus(req.user.id);

          if (!kycStatus.isVerified) {
            return res.status(403).json({
              success: false,
              message: `Cần xác thực danh tính để thuê thiết bị có giá trị ${totalValue.toLocaleString('vi-VN')}đ`,
              kycRequired: true,
              kycStatus: kycStatus,
              requiredValue: minimumValue
            });
          }
        }

        next();
      } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
      }
    };
  },

  // Kiểm tra cho SHIPPER khi nhận job
  requireShipperKYC: async (req, res, next) => {
    try {
      if (req.user.role !== 'SHIPPER') {
        return next();
      }

      const kycStatus = await getKYCStatus(req.user.id);

      if (!kycStatus.isVerified) {
        return res.status(403).json({
          success: false,
          message: 'Cần xác thực danh tính trước khi nhận job giao hàng',
          kycRequired: true,
          kycStatus: kycStatus
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },

  // Kiểm tra KYC cho withdrawal (kiểm tra CCCD verification)
  checkKycStatus: async (req, res, next) => {
    try {
      // Check if user has verified CCCD
      if (!req.user.cccd || !req.user.cccd.isVerified) {
        return res.status(403).json({
          success: false,
          message:
            'KYC verification required. Please complete KYC verification before requesting withdrawal.',
          kycRequired: true
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = kycCheck;
