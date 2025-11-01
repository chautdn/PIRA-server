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
  async createWithWallet(userId, productId, { tier, duration }) {
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

      if (existingPromo) {
        throw new Error('Product already has an active promotion');
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
        description: `Product Promotion Tier ${tier} - ${duration} days`,
        metadata: {
          type: 'product_promotion',
          productId: productId.toString(),
          tier,
          duration,
          pricePerDay,
          discountApplied
        }
      });
      await transaction.save();

      // Create promotion
      const startDate = new Date();
      const endDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);

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
        isActive: true,
        isRecurring: duration >= MIN_DAYS_FOR_DISCOUNT
      });
      await promotion.save();

      // Update product (ensure it's ACTIVE for wallet payment since payment is instant)
      product.status = 'ACTIVE';
      product.currentPromotion = promotion._id;
      product.isPromoted = true;
      product.promotionTier = tier;
      await product.save();

      return {
        promotion,
        newBalance: wallet.balance.available
      };
    } catch (error) {
      throw error;
    }
  },

  // Create promotion with PayOS
  async createWithPayOS(userId, productId, { tier, duration }) {
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

    if (existingPromo) {
      throw new Error('Product already has an active promotion');
    }

    // Calculate cost
    const { pricePerDay, totalAmount, discountApplied } = this.calculateCost(tier, duration);

    // Create pending promotion
    const startDate = new Date();
    const endDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
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
      isRecurring: duration >= MIN_DAYS_FOR_DISCOUNT
    });
    await promotion.save();

    // Set product to PENDING status (will be ACTIVE after payment)
    await Product.findByIdAndUpdate(productId, {
      status: 'PENDING'
    });

    // Create PayOS payment session
    const paymentData = {
      orderCode: orderCode,
      amount: totalAmount,
      description: `Promotion T${tier} ${duration}d`,
      returnUrl: `${process.env.CLIENT_URL}/owner/promotion-success?orderCode=${orderCode}`,
      cancelUrl: `${process.env.CLIENT_URL}/owner/promotion-cancel?orderCode=${orderCode}`,
      metadata: {
        type: 'product_promotion',
        promotionId: promotion._id.toString(),
        productId: productId.toString(),
        userId: userId.toString(),
        tier,
        duration
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

  // Process PayOS webhook for promotion payment
  async processPayOSWebhook(orderCode, success) {
    // Find promotion by orderCode
    const promotion = await ProductPromotion.findOne({
      externalOrderCode: orderCode.toString(),
      paymentStatus: 'pending'
    });

    if (!promotion) {
      return { success: false, message: 'Promotion not found' };
    }

    // Check if already processed (idempotency)
    if (promotion.paymentStatus === 'paid') {
      return { success: true, message: 'Already processed' };
    }

    if (success) {
      try {
        // Update promotion
        promotion.paymentStatus = 'paid';
        promotion.isActive = true;
        await promotion.save();

        // Update product (activate it and set promotion)
        await Product.findByIdAndUpdate(promotion.product, {
          status: 'ACTIVE', // Publish the product
          currentPromotion: promotion._id,
          isPromoted: true,
          promotionTier: promotion.tier
        });

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

        promotion.transaction = transaction._id;
        await promotion.save();

        return {
          success: true,
          message: 'Promotion activated',
          promotion
        };
      } catch (error) {
        throw error;
      }
    } else {
      // Payment failed or cancelled
      promotion.paymentStatus = 'failed';
      await promotion.save();

      // Set product back to DRAFT (user can re-publish later without promotion)
      await Product.findByIdAndUpdate(promotion.product, {
        status: 'DRAFT'
      });

      return { success: false, message: 'Payment failed' };
    }
  },

  // Verify promotion by order code
  async verifyByOrderCode(orderCode, userId) {
    const promotion = await ProductPromotion.findOne({
      externalOrderCode: orderCode.toString(),
      user: userId
    }).populate('product', 'title images status');

    return promotion;
  }
};

module.exports = productPromotionService;
