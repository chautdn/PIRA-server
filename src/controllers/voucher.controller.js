const voucherService = require('../services/voucher.service');

class VoucherController {
  /**
   * Get user's vouchers
   * GET /api/vouchers
   */
  async getUserVouchers(req, res) {
    try {
      const userId = req.user._id;
      const includeUsed = req.query.includeUsed === 'true';

      const result = await voucherService.getUserVouchers(userId, includeUsed);

      res.status(200).json({
        success: true,
        vouchers: result.vouchers
      });
    } catch (error) {
      console.error('❌ Error getting user vouchers:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get loyalty points balance
   * GET /api/vouchers/loyalty-points
   */
  async getLoyaltyPoints(req, res) {
    try {
      const userId = req.user._id;

      const result = await voucherService.getLoyaltyPointsBalance(userId);

      res.status(200).json({
        success: true,
        loyaltyPoints: result.loyaltyPoints,
        creditScore: result.creditScore,
        canRedeem: result.canRedeem
      });
    } catch (error) {
      console.error('❌ Error getting loyalty points:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Redeem voucher with loyalty points
   * POST /api/vouchers/redeem
   * Body: { requiredPoints: 25 | 50 | 100 }
   */
  async redeemVoucher(req, res) {
    try {
      const userId = req.user._id;
      const { requiredPoints } = req.body;

      if (!requiredPoints || ![25, 50, 100].includes(Number(requiredPoints))) {
        return res.status(400).json({
          success: false,
          message: 'Invalid points amount. Must be 25, 50, or 100'
        });
      }

      const result = await voucherService.redeemVoucher(userId, Number(requiredPoints));

      res.status(200).json({
        success: true,
        message: `Đổi voucher thành công! Giảm ${result.voucher.discountPercent}% phí ship`,
        voucher: result.voucher,
        pointsDeducted: result.pointsDeducted,
        remainingPoints: result.remainingPoints
      });
    } catch (error) {
      console.error('❌ Error redeeming voucher:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Validate voucher code
   * POST /api/vouchers/validate
   * Body: { code: string }
   */
  async validateVoucher(req, res) {
    try {
      const userId = req.user._id;
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập mã voucher'
        });
      }

      const result = await voucherService.validateVoucher(code, userId);

      res.status(200).json({
        success: true,
        message: 'Voucher hợp lệ',
        voucher: result.voucher
      });
    } catch (error) {
      console.error('❌ Error validating voucher:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new VoucherController();
