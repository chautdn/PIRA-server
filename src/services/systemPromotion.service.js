const Promotion = require('../models/Promotion');
const Notification = require('../models/Notification');
const User = require('../models/User');
const SubOrder = require('../models/SubOrder');
const { BadRequest, NotFoundError } = require('../core/error');

const systemPromotionService = {
  /**
   * Create a new system promotion (Admin only)
   * Automatically creates notifications for all active users
   */
  async createSystemPromotion(adminId, promotionData) {
    const { title, description, startDate, endDate, systemPromotion, banner } = promotionData;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (start >= end) {
      throw new BadRequest('Start date must be before end date');
    }

    if (end <= now) {
      throw new BadRequest('End date must be in the future');
    }

    // Validate shipping discount value
    if (!systemPromotion.shippingDiscountValue || systemPromotion.shippingDiscountValue <= 0) {
      throw new BadRequest('Shipping discount value must be greater than 0');
    }

    if (
      systemPromotion.discountType === 'PERCENTAGE' &&
      systemPromotion.shippingDiscountValue > 100
    ) {
      throw new BadRequest('Percentage discount cannot exceed 100%');
    }

    // Check for overlapping active system promotions
    const overlapping = await Promotion.findOne({
      scope: 'SYSTEM',
      status: 'ACTIVE',
      $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }]
    });

    if (overlapping) {
      throw new BadRequest(
        `Cannot create promotion: overlaps with active promotion "${overlapping.title}" (${new Date(overlapping.startDate).toLocaleDateString()} - ${new Date(overlapping.endDate).toLocaleDateString()})`
      );
    }

    // Create promotion (no code - auto-applies to all orders in time period)
    const promotion = new Promotion({
      title,
      description,
      // code not needed - system promotions auto-apply
      scope: 'SYSTEM',
      type: 'FREE_SHIPPING', // System promotions are always shipping-related
      value: systemPromotion.shippingDiscountValue,
      startDate: start,
      endDate: end,
      status: 'ACTIVE',
      createdBy: adminId,
      systemPromotion: {
        isActive: true,
        discountType: systemPromotion.discountType || 'PERCENTAGE',
        shippingDiscountValue: systemPromotion.shippingDiscountValue,
        applyTo: systemPromotion.applyTo || 'ALL_ORDERS',
        minOrderValue: systemPromotion.minOrderValue || 0
      },
      banner: {
        displayOnHome: banner?.displayOnHome !== false,
        bannerTitle: banner?.bannerTitle || title,
        bannerDescription: banner?.bannerDescription || description,
        bannerImage: banner?.bannerImage || '',
        backgroundColor: banner?.backgroundColor || '#4F46E5',
        textColor: banner?.textColor || '#FFFFFF'
      }
    });

    await promotion.save();

    // Create notifications for all active users
    await this.notifyAllUsers(promotion);

    // Emit socket event for real-time updates
    if (global.chatGateway) {
      
      global.chatGateway.emitSystemPromotionCreated(promotion.toObject());
    } else {
      console.log(
        '[SystemPromotion] ❌ Warning: chatGateway not initialized - socket event NOT sent'
      );
    }

    return promotion;
  },

  /**
   * Create notifications for all active users
   */
  async notifyAllUsers(promotion) {
    const allUsers = await User.find({ status: 'ACTIVE' }).select('_id');

    if (allUsers.length === 0) return;

    const discountText =
      promotion.systemPromotion.discountType === 'PERCENTAGE'
        ? `${promotion.systemPromotion.shippingDiscountValue}%`
        : `${promotion.systemPromotion.shippingDiscountValue.toLocaleString('vi-VN')} VND`;

    const notifications = allUsers.map((user) => ({
      recipient: user._id,
      title: promotion.banner.bannerTitle || 'Khuyến mãi giảm phí ship!',
      message:
        promotion.banner.bannerDescription || `Giảm ${discountText} phí ship cho tất cả đơn hàng`,
      type: 'PROMOTION',
      category: 'INFO',
      relatedPromotion: promotion._id,
      status: 'SENT',
      sentAt: new Date(),
      data: {
        promotionId: promotion._id.toString(),
        // No code - promotions auto-apply
        discountValue: promotion.systemPromotion.shippingDiscountValue,
        discountType: promotion.systemPromotion.discountType,
        startDate: promotion.startDate,
        endDate: promotion.endDate
      },
      actions: [
        {
          label: 'Xem chi tiết',
          url: `/promotions/${promotion._id}`,
          action: 'VIEW_PROMOTION'
        }
      ],
      expiresAt: promotion.endDate
    }));

    await Notification.insertMany(notifications);
  },

  /**
   * Get active system promotion
   */
  async getActiveSystemPromotion() {
    const now = new Date();

    const promotion = await Promotion.findOne({
      scope: 'SYSTEM',
      status: 'ACTIVE',
      'systemPromotion.isActive': true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ createdAt: -1 });

    return promotion;
  },

  /**
   * Get all system promotions (Admin only)
   */
  async getAllSystemPromotions(options = {}) {
    const { page = 1, limit = 20, status } = options;

    const query = { scope: 'SYSTEM' };
    if (status) query.status = status;

    const promotions = await Promotion.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const total = await Promotion.countDocuments(query);

    return {
      promotions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    };
  },

  /**
   * Get system promotion by ID
   */
  async getSystemPromotionById(promotionId) {
    const promotion = await Promotion.findOne({
      _id: promotionId,
      scope: 'SYSTEM'
    }).populate('createdBy', 'name email');

    if (!promotion) {
      throw new NotFoundError('System promotion not found');
    }

    return promotion;
  },

  /**
   * Update system promotion (Admin only)
   */
  async updateSystemPromotion(promotionId, adminId, updateData) {
    const promotion = await Promotion.findOne({
      _id: promotionId,
      scope: 'SYSTEM'
    });

    if (!promotion) {
      throw new NotFoundError('System promotion not found');
    }

    // Update allowed fields
    if (updateData.title) promotion.title = updateData.title;
    if (updateData.description) promotion.description = updateData.description;
    if (updateData.status) promotion.status = updateData.status;

    if (updateData.systemPromotion) {
      if (updateData.systemPromotion.isActive !== undefined) {
        promotion.systemPromotion.isActive = updateData.systemPromotion.isActive;
      }
      if (updateData.systemPromotion.shippingDiscountValue) {
        promotion.systemPromotion.shippingDiscountValue =
          updateData.systemPromotion.shippingDiscountValue;
        promotion.value = updateData.systemPromotion.shippingDiscountValue;
      }
    }

    if (updateData.banner) {
      Object.assign(promotion.banner, updateData.banner);
    }

    await promotion.save();

    return promotion;
  },

  /**
   * Deactivate system promotion (Admin only)
   */
  async deactivateSystemPromotion(promotionId, adminId) {
    const promotion = await Promotion.findOne({
      _id: promotionId,
      scope: 'SYSTEM'
    });

    if (!promotion) {
      throw new NotFoundError('System promotion not found');
    }

    promotion.status = 'DEACTIVATED';
    promotion.systemPromotion.isActive = false;

    await promotion.save();

    return promotion;
  },

  /**
   * Calculate shipping discount for a SubOrder
   * This is called when creating/updating SubOrder
   */
  async calculateShippingDiscount(subOrder) {
    const activePromotion = await this.getActiveSystemPromotion();

    if (!activePromotion) {
      return {
        originalFee: subOrder.pricing.shippingFee,
        discount: 0,
        finalFee: subOrder.pricing.shippingFee,
        promotion: null
      };
    }

    // Check if promotion applies to this order
    const canApply = await this.checkPromotionConditions(activePromotion, subOrder);

    if (!canApply) {
      return {
        originalFee: subOrder.pricing.shippingFee,
        discount: 0,
        finalFee: subOrder.pricing.shippingFee,
        promotion: null
      };
    }

    // Calculate discount
    let shippingDiscount = 0;
    const originalFee = subOrder.pricing.shippingFee;

    if (activePromotion.systemPromotion.discountType === 'PERCENTAGE') {
      shippingDiscount =
        (originalFee * activePromotion.systemPromotion.shippingDiscountValue) / 100;
    } else {
      shippingDiscount = activePromotion.systemPromotion.shippingDiscountValue;
    }

    // Discount cannot exceed shipping fee
    shippingDiscount = Math.min(shippingDiscount, originalFee);
    const finalFee = Math.max(0, originalFee - shippingDiscount);

    return {
      originalFee,
      discount: shippingDiscount,
      finalFee,
      promotion: activePromotion
    };
  },

  /**
   * Check if promotion conditions are met for a SubOrder
   */
  async checkPromotionConditions(promotion, subOrder) {
    const config = promotion.systemPromotion;

    // Check applyTo conditions
    if (config.applyTo === 'MIN_ORDER_VALUE') {
      const orderTotal = subOrder.pricing.subtotalRental + subOrder.pricing.subtotalDeposit;
      if (orderTotal < config.minOrderValue) {
        return false;
      }
    }

    // For FIRST_ORDER, check if user has any completed orders
    if (config.applyTo === 'FIRST_ORDER') {
      const masterOrder = await require('../models/MasterOrder').findById(subOrder.masterOrder);
      if (!masterOrder) return false;

      const completedOrders = await require('../models/MasterOrder').countDocuments({
        renter: masterOrder.renter,
        status: 'COMPLETED',
        _id: { $ne: masterOrder._id }
      });

      if (completedOrders > 0) {
        return false;
      }
    }

    return true;
  },

  /**
   * Apply system promotion to SubOrder
   * This updates the SubOrder with promotion details
   */
  async applyPromotionToSubOrder(subOrderId) {
    const subOrder = await SubOrder.findById(subOrderId);

    if (!subOrder) {
      throw new NotFoundError('SubOrder not found');
    }

    const discountResult = await this.calculateShippingDiscount(subOrder);

    if (discountResult.promotion) {
      // Update shipping fees
      subOrder.shipping.fee.discount = discountResult.discount;
      subOrder.shipping.fee.finalFee = discountResult.finalFee;

      // Add to appliedPromotions
      const existingPromoIndex = subOrder.appliedPromotions.findIndex(
        (ap) => ap.promotion.toString() === discountResult.promotion._id.toString()
      );

      const promotionData = {
        promotion: discountResult.promotion._id,
        promotionType: 'SYSTEM',
        discountAmount: discountResult.discount,
        appliedTo: 'SHIPPING'
      };

      if (existingPromoIndex >= 0) {
        subOrder.appliedPromotions[existingPromoIndex] = promotionData;
      } else {
        subOrder.appliedPromotions.push(promotionData);
      }

      // Update pricing
      subOrder.pricing.shippingFee = discountResult.finalFee;

      await subOrder.save();
    }

    return subOrder;
  }
};

module.exports = systemPromotionService;
