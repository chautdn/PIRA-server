const Voucher = require('../models/Voucher');
const User = require('../models/User');
const MasterOrder = require('../models/MasterOrder');

class VoucherService {
  /**
   * Award loyalty points to user (owner or renter) after completing a suborder
   */
  async awardLoyaltyPoints(userId, points = 5, reason = 'SubOrder completed') {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.loyaltyPoints = (user.loyaltyPoints || 0) + points;
      await user.save();

      // Awarded loyalty points to user

      return {
        success: true,
        userId: user._id,
        pointsAwarded: points,
        totalPoints: user.loyaltyPoints,
        reason
      };
    } catch (error) {
      // Error awarding loyalty points
      throw error;
    }
  }

  /**
   * Redeem voucher with loyalty points
   * Requires user to have credit score >= 100
   */
  async redeemVoucher(userId, requiredPoints) {
    try {
      // Validate required points
      if (![25, 50, 100].includes(requiredPoints)) {
        throw new Error('Invalid points amount. Must be 25, 50, or 100');
      }

      // Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check credit score requirement
      if (user.creditScore < 100) {
        throw new Error(`Credit score too low. Required: 100, Current: ${user.creditScore}`);
      }

      // Check if user has enough loyalty points
      if (user.loyaltyPoints < requiredPoints) {
        throw new Error(
          `Không đủ điểm loyalty. Cần: ${requiredPoints}, Hiện có: ${user.loyaltyPoints}`
        );
      }

      // Determine discount percentage based on points
      const discountPercent = requiredPoints; // 25 points = 25%, 50 = 50%, 100 = 100%

      // Generate unique voucher code
      const code = await Voucher.generateUniqueCode(discountPercent);

      // Create voucher (expires in 30 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const voucher = new Voucher({
        code,
        discountPercent,
        requiredPoints,
        type: 'SHIPPING_DISCOUNT',
        redeemedBy: userId,
        expiresAt,
        status: 'ACTIVE'
      });

      await voucher.save();

      // Deduct loyalty points from user
      user.loyaltyPoints -= requiredPoints;
      await user.save();

      // User redeemed voucher

      return {
        success: true,
        voucher: {
          _id: voucher._id,
          code: voucher.code,
          discountPercent: voucher.discountPercent,
          expiresAt: voucher.expiresAt,
          type: voucher.type
        },
        pointsDeducted: requiredPoints,
        remainingPoints: user.loyaltyPoints
      };
    } catch (error) {
      // Error redeeming voucher
      throw error;
    }
  }

  /**
   * Validate and apply voucher to order
   */
  async validateVoucher(code, userId) {
    try {
      const voucher = await Voucher.findOne({ code: code.toUpperCase() });

      if (!voucher) {
        throw new Error('Voucher không tồn tại');
      }

      // Check if voucher is valid
      const validation = voucher.isValid();
      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      return {
        valid: true,
        voucher: {
          _id: voucher._id,
          code: voucher.code,
          discountPercent: voucher.discountPercent,
          type: voucher.type,
          expiresAt: voucher.expiresAt
        }
      };
    } catch (error) {
      // Error validating voucher
      throw error;
    }
  }

  /**
   * Apply voucher to order (mark as used)
   */
  async applyVoucherToOrder(code, userId, orderId) {
    try {
      const voucher = await Voucher.findOne({ code: code.toUpperCase() });

      if (!voucher) {
        throw new Error('Voucher không tồn tại');
      }

      // Check if voucher is valid
      const validation = voucher.isValid();
      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      // Mark voucher as used
      voucher.isUsed = true;
      voucher.usedBy = userId;
      voucher.usedAt = new Date();
      voucher.appliedToOrder = orderId;
      voucher.status = 'USED';
      await voucher.save();

      // Voucher applied to order

      return {
        success: true,
        discountPercent: voucher.discountPercent,
        voucherId: voucher._id
      };
    } catch (error) {
      // Error applying voucher
      throw error;
    }
  }

  /**
   * Get user's vouchers
   */
  async getUserVouchers(userId, includeUsed = false) {
    try {
      const query = { redeemedBy: userId };

      if (!includeUsed) {
        query.isUsed = false;
        query.status = 'ACTIVE';
        query.expiresAt = { $gte: new Date() };
      }

      const vouchers = await Voucher.find(query).sort({ createdAt: -1 });

      return {
        success: true,
        vouchers
      };
    } catch (error) {
      // Error getting user vouchers
      throw error;
    }
  }

  /**
   * Get user's loyalty points balance
   */
  async getLoyaltyPointsBalance(userId) {
    try {
      const user = await User.findById(userId).select('loyaltyPoints creditScore');

      if (!user) {
        throw new Error('User not found');
      }

      return {
        success: true,
        loyaltyPoints: user.loyaltyPoints || 0,
        creditScore: user.creditScore || 0,
        canRedeem: user.creditScore >= 100
      };
    } catch (error) {
      console.error('❌ Error getting loyalty points balance:', error);
      throw error;
    }
  }

  /**
   * Calculate shipping discount from voucher
   */
  calculateShippingDiscount(shippingFee, discountPercent) {
    const discount = Math.round((shippingFee * discountPercent) / 100);
    const finalFee = Math.max(0, shippingFee - discount);

    return {
      originalFee: shippingFee,
      discountPercent,
      discountAmount: discount,
      finalFee
    };
  }
}

module.exports = new VoucherService();
