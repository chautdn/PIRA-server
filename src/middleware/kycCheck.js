// middleware/kycCheck.js
const kycCheck = {
  // Kiểm tra cho OWNER khi đăng sản phẩm
  requireOwnerKYC: async (req, res, next) => {
    try {
      if (req.user.role !== 'OWNER') {
        return next();
      }

      const kycStatus = await getKYCStatus(req.user.id);
      
      if (!kycStatus.isVerified) {
        return res.status(403).json({
          success: false,
          message: 'Cần xác thực danh tính trước khi đăng sản phẩm',
          kycRequired: true,
          kycStatus: kycStatus
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
  }
};