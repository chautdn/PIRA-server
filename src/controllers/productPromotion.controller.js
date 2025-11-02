const productPromotionService = require('../services/productPromotion.service');
const Wallet = require('../models/Wallet');
const { SUCCESS, CREATED } = require('../core/success');
const { BadRequestError, NotFoundError } = require('../core/error');

const productPromotionController = {
  // Create promotion
  create: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { productId, tier, duration, paymentMethod } = req.body;

      // Validate tier
      if (![1, 2, 3, 4, 5].includes(tier)) {
        throw new BadRequestError('Invalid tier. Must be between 1 and 5');
      }

      // Validate duration
      if (duration < 1) {
        throw new BadRequestError('Duration must be at least 1 day');
      }

      // Validate payment method
      if (!['wallet', 'payos'].includes(paymentMethod)) {
        throw new BadRequestError('Invalid payment method. Must be wallet or payos');
      }

      let result;

      if (paymentMethod === 'wallet') {
        result = await productPromotionService.createWithWallet(userId, productId, {
          tier,
          duration
        });

        // Emit socket update for wallet balance
        if (global.chatGateway) {
          global.chatGateway.emitWalletUpdate(userId.toString(), {
            type: 'promotion_paid',
            amount: result.promotion.totalAmount,
            newBalance: result.newBalance
          });
        }

        new CREATED({
          message: 'Promotion activated successfully',
          metadata: {
            promotion: result.promotion,
            newBalance: result.newBalance
          }
        }).send(res);
      } else if (paymentMethod === 'payos') {
        result = await productPromotionService.createWithPayOS(userId, productId, {
          tier,
          duration
        });

        new SUCCESS({
          message: 'Payment session created',
          metadata: {
            promotion: result.promotion,
            paymentUrl: result.paymentUrl,
            orderCode: result.orderCode
          }
        }).send(res);
      }
    } catch (error) {
      next(error);
    }
  },

  // Get promotion pricing
  getPricing: async (req, res, next) => {
    try {
      const { tier, duration } = req.query;

      if (!tier || !duration) {
        throw new BadRequestError('Tier and duration are required');
      }

      const tierNum = parseInt(tier);
      const durationNum = parseInt(duration);

      if (![1, 2, 3, 4, 5].includes(tierNum)) {
        throw new BadRequestError('Invalid tier. Must be between 1 and 5');
      }

      if (durationNum < 1) {
        throw new BadRequestError('Duration must be at least 1 day');
      }

      const result = productPromotionService.calculateCost(tierNum, durationNum);

      new SUCCESS({
        message: 'Pricing calculated',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Get user's promotions
  getUserPromotions: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { page = 1, limit = 10, status } = req.query;

      const result = await productPromotionService.getUserPromotions(userId, {
        page: parseInt(page),
        limit: parseInt(limit),
        status
      });

      new SUCCESS({
        message: 'Promotions retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Get promotion by ID
  getPromotionById: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { id } = req.params;

      const promotion = await productPromotionService.getPromotionById(id, userId);

      new SUCCESS({
        message: 'Promotion retrieved successfully',
        metadata: { promotion }
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Get tier pricing info
  getTierInfo: async (req, res, next) => {
    try {
      const tierInfo = {
        tiers: [
          {
            tier: 1,
            name: 'Premium',
            pricePerDay: 150000,
            description: 'Top position, Gold badge, Glow effect',
            features: [
              'Highest priority placement',
              'Gold badge',
              'Glow effect',
              'Top of search results'
            ]
          },
          {
            tier: 2,
            name: 'Featured',
            pricePerDay: 120000,
            description: 'High priority, Silver badge, Featured styling',
            features: [
              'High priority placement',
              'Silver badge',
              'Featured styling',
              'Prominent position'
            ]
          },
          {
            tier: 3,
            name: 'Popular',
            pricePerDay: 90000,
            description: 'Medium priority, Bronze badge, Highlighted border',
            features: [
              'Medium priority placement',
              'Bronze badge',
              'Highlighted border',
              'Good visibility'
            ]
          },
          {
            tier: 4,
            name: 'Boosted',
            pricePerDay: 60000,
            description: 'Standard priority, Basic badge, Subtle highlight',
            features: [
              'Standard priority placement',
              'Basic badge',
              'Subtle highlight',
              'Better than free'
            ]
          },
          {
            tier: 5,
            name: 'Basic',
            pricePerDay: 30000,
            description: 'Entry priority, Minimal badge, Light accent',
            features: [
              'Entry priority placement',
              'Minimal badge',
              'Light accent',
              'Affordable option'
            ]
          }
        ],
        discount: {
          minDays: 3,
          percentage: 10,
          description: '10% off for 3 or more days'
        },
        paymentMethods: [
          {
            method: 'wallet',
            name: 'Wallet',
            description: 'Pay instantly with your wallet balance'
          },
          {
            method: 'payos',
            name: 'PayOS',
            description: 'Pay securely with PayOS gateway'
          }
        ]
      };

      new SUCCESS({
        message: 'Tier information retrieved',
        metadata: tierInfo
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Verify promotion by order code
  verifyPromotion: async (req, res, next) => {
    try {
      const { orderCode } = req.params;
      const userId = req.user._id;

      const promotion = await productPromotionService.verifyByOrderCode(orderCode, userId);

      if (!promotion) {
        throw new NotFoundError('Promotion not found');
      }

      new SUCCESS({
        message: 'Promotion status retrieved',
        metadata: promotion
      }).send(res);
    } catch (error) {
      next(error);
    }
  }
};

module.exports = productPromotionController;
