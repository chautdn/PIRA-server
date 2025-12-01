const mongoose = require('mongoose');
const ProductPromotion = require('../models/ProductPromotion');
const Product = require('../models/Product');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const paymentService = require('./payment.service');

const TIER_PRICES = {
  1: 150000,
  2: 120000,
  3: 90000,
  4: 60000,
  5: 30000
};

const RECURRING_DISCOUNT = 0.1; // 10%
const MIN_DAYS_FOR_DISCOUNT = 3;

const productPromotionService = {
  // Calculate promotion cost
  calculateCost(tier, duration) {
    const pricePerDay = TIER_PRICES[tier];
    if (!pricePerDay) {
      throw new Error('Invalid tier');
    }

    let totalAmount = pricePerDay * duration;
    let discountApplied = 0;

    // Apply recurring discount for 3+ days
    if (duration >= MIN_DAYS_FOR_DISCOUNT) {
      discountApplied = totalAmount * RECURRING_DISCOUNT;
      totalAmount -= discountApplied;
    }

    return {
      pricePerDay,
      totalAmount: Math.round(totalAmount),
      discountApplied: Math.round(discountApplied)
    };
  },

  // Create promotion with wallet payment
  async createWithWallet(userId, productId, { tier, duration, scheduleMode = 'override' }) {
    try {
      // Check product ownership
      const product = await Product.findOne({
        _id: productId,
        owner: userId
      });

      if (!product) {
        throw new Error('Product not found or you do not own this product');
      }

      // Check existing active promotion
      const existingPromo = await ProductPromotion.findOne({
        product: productId,
        isActive: true
      });

      // Handle scheduling mode
      let startDate = new Date();
      let shouldActivateNow = true;

      if (existingPromo) {
        if (scheduleMode === 'override') {
          // Deactivate existing promotion
          existingPromo.isActive = false;
          await existingPromo.save();
        } else if (scheduleMode === 'after') {
          // Schedule to start after current promotion ends
          startDate = new Date(existingPromo.endDate);
          shouldActivateNow = false;
        } else {
          throw new Error('Product already has an active promotion');
        }
      }

      // Calculate cost
      const { pricePerDay, totalAmount, discountApplied } = this.calculateCost(tier, duration);

      // Check wallet balance
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet || wallet.balance.available < totalAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // Deduct from wallet
      wallet.balance.available -= totalAmount;
      await wallet.save();

      // Create transaction record
      const transaction = new Transaction({
        user: userId,
        wallet: wallet._id,
        type: 'payment',
        amount: totalAmount,
        status: 'success',
        description: `Product Promotion Tier ${tier} - ${duration} days${!shouldActivateNow ? ' (Scheduled)' : ''}`,
        metadata: {
          type: 'product_promotion',
          productId: productId.toString(),
          tier,
          duration,
          pricePerDay,
          discountApplied,
          scheduleMode
        }
      });
      await transaction.save();

      // Create promotion
      const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);

      const promotion = new ProductPromotion({
        product: productId,
        user: userId,
        tier,
        pricePerDay,
        duration,
        totalAmount,
        discountApplied,
        paymentMethod: 'wallet',
        paymentStatus: 'paid',
        transaction: transaction._id,
        startDate,
        endDate,
        isActive: shouldActivateNow,
        isRecurring: duration >= MIN_DAYS_FOR_DISCOUNT
      });
      await promotion.save();

      // Update product only if activating now
      if (shouldActivateNow) {
        product.status = 'ACTIVE';
        product.currentPromotion = promotion._id;
        product.isPromoted = true;
        product.promotionTier = tier;
        await product.save();
      }

      // Add amount to system wallet
      const SystemWalletService = require('./systemWallet.service');
      try {
        await SystemWalletService.addPromotionRevenue(
          totalAmount,
          `Promotion payment from user ${userId} - Tier ${tier} for ${duration} days${!shouldActivateNow ? ' (Scheduled)' : ''}`,
          userId,
          {
            promotionMethod: 'wallet',
            productId: productId.toString(),
            fromWallet: wallet._id.toString(),
            tier: tier,
            duration: duration,
            originalBalance: wallet.balance.available + totalAmount,
            newBalance: wallet.balance.available,
            scheduleMode,
            scheduled: !shouldActivateNow
          }
        );
      } catch (error) {
        console.error('Failed to add promotion revenue to system wallet:', error);
      }

      // Create notification for the user
      const notificationService = require('./notification.service');
      try {
        const startDateStr = startDate.toLocaleDateString('vi-VN');
        const endDateStr = endDate.toLocaleDateString('vi-VN');

        const notificationMessage = shouldActivateNow
          ? `Trừ ${totalAmount.toLocaleString('vi-VN')}đ để quảng cáo sản phẩm tier ${tier} từ ngày ${startDateStr} tới ngày ${endDateStr}`
          : `Trừ ${totalAmount.toLocaleString('vi-VN')}đ để đặt lịch quảng cáo sản phẩm tier ${tier}. Sẽ tự động kích hoạt từ ${startDateStr} tới ${endDateStr}`;

        await notificationService.createNotification({
          recipient: userId,
          type: 'PROMOTION_PAYMENT',
          title: shouldActivateNow
            ? 'Thanh toán quảng cáo thành công'
            : 'Đặt lịch quảng cáo thành công',
          message: notificationMessage,
          data: {
            promotionId: promotion._id.toString(),
            productId: productId.toString(),
            tier: tier,
            duration: duration,
            amount: totalAmount,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            scheduled: !shouldActivateNow,
            scheduleMode
          },
          status: 'SENT'
        });
      } catch (error) {
        console.error('Failed to create promotion notification:', error);
      }

      return {
        promotion,
        newBalance: wallet.balance.available
      };
    } catch (error) {
      throw error;
    }
  },

  // Create promotion with PayOS
  async createWithPayOS(userId, productId, { tier, duration, scheduleMode = 'override' }) {
    // Check product ownership
    const product = await Product.findOne({
      _id: productId,
      owner: userId
    });

    if (!product) {
      throw new Error('Product not found or you do not own this product');
    }

    // Check existing active promotion
    const existingPromo = await ProductPromotion.findOne({
      product: productId,
      isActive: true
    });

    // Determine start date based on schedule mode
    let startDate = new Date();
    let shouldActivateNow = true;

    if (existingPromo) {
      if (scheduleMode === 'override') {
        // Will deactivate existing promotion after payment
        shouldActivateNow = true;
      } else if (scheduleMode === 'after') {
        // Schedule to start after current promotion ends
        startDate = new Date(existingPromo.endDate);
        shouldActivateNow = false;
      } else {
        throw new Error('Product already has an active promotion');
      }
    }

    // Check for existing pending promotion (don't create duplicate)
    const existingPending = await ProductPromotion.findOne({
      product: productId,
      paymentStatus: 'pending',
      paymentMethod: 'payos'
    });

    if (existingPending) {
      throw new Error('Product already has a pending promotion payment');
    }

    // Calculate cost
    const { pricePerDay, totalAmount, discountApplied } = this.calculateCost(tier, duration);

    // Create pending promotion
    const endDate = new Date(startDate.getTime() + duration * 24 * 60 * 60 * 1000);
    const orderCode = Date.now();

    const promotion = new ProductPromotion({
      product: productId,
      user: userId,
      tier,
      pricePerDay,
      duration,
      totalAmount,
      discountApplied,
      paymentMethod: 'payos',
      paymentStatus: 'pending',
      externalOrderCode: orderCode.toString(),
      startDate,
      endDate,
      isActive: false,
      isRecurring: duration >= MIN_DAYS_FOR_DISCOUNT,
      metadata: {
        scheduleMode,
        shouldActivateNow,
        existingPromoId: existingPromo?._id?.toString()
      }
    });
    await promotion.save();

    // Keep product in PENDING status (will be ACTIVE after payment)
    // Don't update if already PENDING
    if (product.status !== 'PENDING') {
      await Product.findByIdAndUpdate(productId, {
        status: 'PENDING'
      });
    }

    // Create PayOS payment session
    const paymentData = {
      orderCode: orderCode,
      amount: totalAmount,
      description: `Promotion T${tier} ${duration}d${!shouldActivateNow ? ' (Scheduled)' : ''}`,
      returnUrl: `${process.env.CLIENT_URL}/owner/promotion-success?orderCode=${orderCode}`,
      cancelUrl: `${process.env.CLIENT_URL}/owner/promotion-cancel?orderCode=${orderCode}`,
      metadata: {
        type: 'product_promotion',
        promotionId: promotion._id.toString(),
        productId: productId.toString(),
        userId: userId.toString(),
        tier,
        duration,
        scheduleMode,
        shouldActivateNow
      }
    };

    const paymentSession = await paymentService.createPaymentLink(paymentData);

    return {
      promotion,
      paymentUrl: paymentSession.checkoutUrl,
      orderCode
    };
  },

  // Get active promotions (for sorting products)
  async getActivePromotions() {
    return await ProductPromotion.find({
      isActive: true,
      endDate: { $gt: new Date() }
    }).populate('product');
  },

  // Get user's promotions
  async getUserPromotions(userId, options = {}) {
    const { page = 1, limit = 10, status } = options;

    const query = { user: userId };

    if (status) {
      if (status === 'active') {
        query.isActive = true;
        query.endDate = { $gt: new Date() };
      } else if (status === 'expired') {
        query.endDate = { $lte: new Date() };
      }
    }

    const promotions = await ProductPromotion.find(query)
      .populate('product', 'title images pricing status')
      .populate('transaction', 'amount status createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit);

    const total = await ProductPromotion.countDocuments(query);

    return {
      promotions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    };
  },

  // Get promotion by ID
  async getPromotionById(promotionId, userId) {
    const promotion = await ProductPromotion.findOne({
      _id: promotionId,
      user: userId
    })
      .populate('product', 'title images pricing status')
      .populate('transaction', 'amount status createdAt');

    if (!promotion) {
      throw new Error('Promotion not found');
    }

    return promotion;
  },

  // Check and deactivate expired promotions (cron job)
  async deactivateExpired() {
    try {
      const expired = await ProductPromotion.find({
        isActive: true,
        endDate: { $lte: new Date() }
      });

      for (const promo of expired) {
        promo.isActive = false;
        await promo.save();

        await Product.findByIdAndUpdate(promo.product, {
          isPromoted: false,
          currentPromotion: null,
          promotionTier: null
        });
      }

      return expired.length;
    } catch (error) {
      throw error;
    }
  },

  // Activate scheduled promotions (cron job)
  async activateScheduled() {
    try {
      const now = new Date();
      const scheduled = await ProductPromotion.find({
        isActive: false,
        paymentStatus: 'paid',
        startDate: { $lte: now },
        endDate: { $gt: now }
      });

      let activated = 0;
      for (const promo of scheduled) {
        // Check if there's already an active promotion for this product
        const activePromo = await ProductPromotion.findOne({
          product: promo.product,
          isActive: true,
          _id: { $ne: promo._id }
        });

        // Only activate if no other promotion is active
        if (!activePromo) {
          promo.isActive = true;
          await promo.save();

          await Product.findByIdAndUpdate(promo.product, {
            status: 'ACTIVE',
            currentPromotion: promo._id,
            isPromoted: true,
            promotionTier: promo.tier
          });

          activated++;

          // Notify user
          try {
            const notificationService = require('./notification.service');
            await notificationService.createNotification({
              recipient: promo.user,
              type: 'PROMOTION_ACTIVATED',
              title: 'Quảng cáo đã được kích hoạt',
              message: `Quảng cáo tier ${promo.tier} của bạn đã tự động kích hoạt và sẽ chạy đến ${new Date(promo.endDate).toLocaleDateString('vi-VN')}`,
              data: {
                promotionId: promo._id.toString(),
                productId: promo.product.toString(),
                tier: promo.tier,
                endDate: promo.endDate.toISOString()
              },
              status: 'SENT'
            });
          } catch (error) {
            console.error('Failed to create promotion activation notification:', error);
          }
        }
      }

      return activated;
    } catch (error) {
      throw error;
    }
  },

  // Process PayOS webhook for promotion payment
  async processPayOSWebhook(orderCode, success) {
    console.log(`[Promotion Webhook] Processing orderCode: ${orderCode}, success: ${success}`);

    // Find promotion by orderCode
    const promotion = await ProductPromotion.findOne({
      externalOrderCode: orderCode.toString()
    });

    console.log(
      `[Promotion Webhook] Found promotion:`,
      promotion
        ? {
            id: promotion._id,
            status: promotion.paymentStatus,
            isActive: promotion.isActive,
            productId: promotion.product
          }
        : 'null'
    );

    if (!promotion) {
      console.log('[Promotion Webhook] No promotion found for this orderCode');
      return { success: false, message: 'Promotion not found' };
    }

    // Check if already processed (idempotency)
    if (promotion.paymentStatus === 'paid') {
      console.log('[Promotion Webhook] Already processed, returning success');
      return { success: true, message: 'Already processed', promotion };
    }

    if (success) {
      try {
        console.log('[Promotion Webhook] Processing successful payment...');

        // Get schedule mode from promotion metadata
        const scheduleMode = promotion.metadata?.scheduleMode || 'override';
        const shouldActivateNow = promotion.metadata?.shouldActivateNow !== false;
        const existingPromoId = promotion.metadata?.existingPromoId;

        // Handle override mode: deactivate existing promotion
        if (scheduleMode === 'override' && existingPromoId) {
          await ProductPromotion.findByIdAndUpdate(existingPromoId, {
            isActive: false
          });
          console.log('[Promotion Webhook] Deactivated existing promotion:', existingPromoId);
        }

        // Update promotion
        promotion.paymentStatus = 'paid';
        promotion.isActive = shouldActivateNow;
        await promotion.save();
        console.log('[Promotion Webhook] Promotion updated to paid, isActive:', shouldActivateNow);

        // Update product only if activating now
        if (shouldActivateNow) {
          const updatedProduct = await Product.findByIdAndUpdate(
            promotion.product,
            {
              status: 'ACTIVE', // Publish the product
              currentPromotion: promotion._id,
              isPromoted: true,
              promotionTier: promotion.tier
            },
            { new: true }
          );
          console.log('[Promotion Webhook] Product updated:', {
            id: updatedProduct._id,
            status: updatedProduct.status,
            isPromoted: updatedProduct.isPromoted
          });
        } else {
          console.log(
            '[Promotion Webhook] Promotion scheduled for later, product not activated yet'
          );
        }

        // Get user's wallet
        const Wallet = require('../models/Wallet');
        const userWallet = await Wallet.findOne({ user: promotion.user });

        if (!userWallet) {
          throw new Error('User wallet not found');
        }

        // Create transaction record
        const transaction = new Transaction({
          user: promotion.user,
          wallet: userWallet._id,
          type: 'payment',
          amount: promotion.totalAmount,
          status: 'success',
          externalId: orderCode.toString(),
          description: `Product Promotion Tier ${promotion.tier} - ${promotion.duration} days`,
          metadata: {
            type: 'product_promotion',
            promotionId: promotion._id.toString(),
            productId: promotion.product.toString(),
            tier: promotion.tier,
            duration: promotion.duration
          }
        });
        await transaction.save();
        console.log('[Promotion Webhook] Transaction created:', transaction._id);

        promotion.transaction = transaction._id;
        await promotion.save();

        // Add amount to system wallet
        const SystemWalletService = require('./systemWallet.service');
        try {
          await SystemWalletService.addPromotionRevenue(
            promotion.totalAmount,
            `PayOS promotion payment from user ${promotion.user} - Tier ${promotion.tier} for ${promotion.duration} days`,
            promotion.user,
            {
              promotionMethod: 'payos',
              productId: promotion.product.toString(),
              payosOrderId: orderCode,
              tier: promotion.tier,
              duration: promotion.duration,
              payosTransactionId: promotion._id.toString()
            }
          );
        } catch (error) {
          console.error('Failed to add promotion revenue to system wallet:', error);
        }

        // Create notification for the user
        const notificationService = require('./notification.service');
        try {
          const startDateStr = promotion.startDate.toLocaleDateString('vi-VN');
          const endDateStr = promotion.endDate.toLocaleDateString('vi-VN');

          await notificationService.createNotification({
            recipient: promotion.user,
            type: 'PROMOTION_PAYMENT',
            title: 'Thanh toán quảng cáo thành công',
            message: `Trừ ${promotion.totalAmount.toLocaleString('vi-VN')}đ để quảng cáo sản phẩm tier ${promotion.tier} từ ngày ${startDateStr} tới ngày ${endDateStr}`,
            data: {
              promotionId: promotion._id.toString(),
              productId: promotion.product.toString(),
              tier: promotion.tier,
              duration: promotion.duration,
              amount: promotion.totalAmount,
              startDate: promotion.startDate.toISOString(),
              endDate: promotion.endDate.toISOString(),
              orderCode: orderCode
            },
            status: 'SENT'
          });
          console.log('[Promotion Webhook] Created promotion notification for user');
        } catch (error) {
          console.error('[Promotion Webhook] Failed to create promotion notification:', error);
        }

        console.log('[Promotion Webhook] ✅ Promotion activation complete');
        return {
          success: true,
          message: 'Promotion activated',
          promotion
        };
      } catch (error) {
        console.error('[Promotion Webhook] ❌ Error processing payment:', error);
        throw error;
      }
    } else {
      console.log('[Promotion Webhook] Payment failed or cancelled');

      // Payment failed or cancelled
      promotion.paymentStatus = 'failed';
      await promotion.save();

      // Keep product in PENDING (user can retry payment or publish without promotion)
      await Product.findByIdAndUpdate(promotion.product, {
        status: 'PENDING'
      });

      console.log('[Promotion Webhook] Promotion marked as failed');
      return { success: false, message: 'Payment failed' };
    }
  },

  // Verify promotion by order code (with PayOS check)
  async verifyByOrderCode(orderCode, userId) {
    console.log(`[Verify] Checking promotion for orderCode: ${orderCode}`);

    const promotion = await ProductPromotion.findOne({
      externalOrderCode: orderCode.toString(),
      user: userId
    }).populate('product', 'title images status');

    if (!promotion) {
      console.log('[Verify] No promotion found');
      return null;
    }

    console.log(`[Verify] Promotion found:`, {
      id: promotion._id,
      paymentStatus: promotion.paymentStatus,
      isActive: promotion.isActive
    });

    // If already paid, return immediately
    if (promotion.paymentStatus === 'paid') {
      console.log('[Verify] Already paid, returning');
      return promotion;
    }

    // Check PayOS status directly
    try {
      console.log('[Verify] Checking PayOS status...');
      const { PayOS } = require('@payos/node');
      const payos = new PayOS({
        clientId: process.env.PAYOS_CLIENT_ID,
        apiKey: process.env.PAYOS_API_KEY,
        checksumKey: process.env.PAYOS_CHECKSUM_KEY
      });

      const payosStatus = await payos.paymentRequests.get(Number(orderCode));
      console.log('[Verify] PayOS status:', payosStatus.status);

      // If PayOS shows PAID but our DB shows pending, process it now
      if (payosStatus.status === 'PAID' && promotion.paymentStatus === 'pending') {
        console.log('[Verify] 🎉 Payment confirmed by PayOS! Processing now...');

        // Process the payment (same as webhook would do)
        const result = await this.processPayOSWebhook(orderCode, true);

        if (result.success) {
          console.log('[Verify] ✅ Promotion activated successfully');
          // Reload promotion to get updated data
          const updatedPromotion = await ProductPromotion.findOne({
            externalOrderCode: orderCode.toString(),
            user: userId
          }).populate('product', 'title images status');

          return updatedPromotion;
        }
      }
    } catch (payosError) {
      console.error('[Verify] PayOS check failed:', payosError.message);
      // Continue with database status
    }

    return promotion;
  }
};

module.exports = productPromotionService;
