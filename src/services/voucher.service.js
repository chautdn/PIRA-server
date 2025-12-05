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

      console.log(
        `✅ Awarded ${points} loyalty points to user ${user.email}. Total: ${user.loyaltyPoints}`
      );

      return {
        success: true,
        userId: user._id,
        pointsAwarded: points,
        totalPoints: user.loyaltyPoints,
        reason
      };
    } catch (error) {
      console.error('❌ Error awarding loyalty points:', error);
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

      console.log(
        `✅ User ${user.email} redeemed voucher ${code} (${discountPercent}% off) for ${requiredPoints} points`
      );

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
      console.error('❌ Error redeeming voucher:', error);
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
          expiresAt: voucher.expiresAt,
          redeemedBy: voucher.redeemedBy, // ✅ Include redeemedBy for ownership check
          status: voucher.status
        }
      };
    } catch (error) {
      console.error('❌ Error validating voucher:', error);
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

      console.log(`✅ Voucher ${code} applied to order ${orderId} by user ${userId}`);

      return {
        success: true,
        discountPercent: voucher.discountPercent,
        voucherId: voucher._id
      };
    } catch (error) {
      console.error('❌ Error applying voucher:', error);
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
      console.error('❌ Error getting user vouchers:', error);
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

  /**
   * Apply voucher discount to SubOrder
   * This is called AFTER system promotion discount has been applied
   * @param {Object} subOrder - SubOrder document
   * @param {String} voucherCode - Voucher code to apply
   * @param {String} userId - User ID who is using the voucher
   * @returns {Object} - Discount result with updated fees
   */
  async applyVoucherToSubOrder(subOrder, voucherCode, userId) {
    try {
      // Get full voucher document from database
      const voucherDoc = await Voucher.findOne({ code: voucherCode.toUpperCase() });

      if (!voucherDoc) {
        throw new Error('Voucher không tồn tại');
      }

      // Check if voucher is valid (not used and not expired)
      const validation = voucherDoc.isValid();
      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      // ✅ Voucher can be used by anyone who has the code (no ownership check)
      // It's a one-time use code that works for whoever uses it first

      // Get the current shipping fee (after promotion discount if any)
      const currentShippingFee = subOrder.shipping.fee.finalFee || subOrder.pricing.shippingFee;

      // Calculate voucher discount
      const voucherDiscount = Math.round((currentShippingFee * voucherDoc.discountPercent) / 100);
      const finalFee = Math.max(0, currentShippingFee - voucherDiscount);

      // Update SubOrder with voucher discount
      subOrder.appliedVoucher = {
        voucher: voucherDoc._id,
        voucherCode: voucherDoc.code,
        discountPercent: voucherDoc.discountPercent,
        discountAmount: voucherDiscount,
        appliedTo: 'SHIPPING'
      };

      // Update shipping fees
      subOrder.shipping.fee.voucherDiscount = voucherDiscount;
      const totalDiscount = (subOrder.shipping.fee.promotionDiscount || 0) + voucherDiscount;
      subOrder.shipping.fee.discount = totalDiscount;
      subOrder.shipping.fee.finalFee = finalFee;
      subOrder.pricing.shippingFee = finalFee;

      // Save SubOrder first
      await subOrder.save();

      // Mark voucher as used by this user
      voucherDoc.status = 'USED';
      voucherDoc.isUsed = true;
      voucherDoc.usedBy = userId;
      voucherDoc.usedAt = new Date();
      voucherDoc.usedInOrder = subOrder.masterOrder;
      await voucherDoc.save();

      console.log(
        `✅ Applied voucher ${voucherCode} (${voucherDoc.discountPercent}%): -${voucherDiscount} VND to SubOrder`
      );

      return {
        voucherDiscount,
        finalFee,
        voucher: voucherDoc,
        success: true
      };
    } catch (error) {
      console.error('❌ Error applying voucher to SubOrder:', error);
      throw error;
    }
  }
}

module.exports = new VoucherService();
