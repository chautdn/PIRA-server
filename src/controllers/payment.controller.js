const paymentService = require('../services/payment.service');
const { SUCCESS, CREATED } = require('../core/success');
const { BadRequestError } = require('../core/error');

const paymentController = {
  // Create top-up session with custom amounts
  createTopUpSession: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { amount } = req.body;

      if (!amount) {
        throw new BadRequestError('Amount is required');
      }

      const metadata = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
      };

      const result = await paymentService.createTopUpSession(userId, amount, metadata);

      new CREATED({
        message: 'Payment session created successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Webhook handler
  handleWebhook: async (req, res, next) => {
    try {
      const result = await paymentService.processWebhook(req.body);

      // Always return 200 for webhooks to avoid retries
      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('Webhook error:', error);
      // Still return 200 to avoid webhook retries
      res.status(200).json({
        success: false,
        message: 'Webhook processed with errors'
      });
    }
  },

  // Verify payment
  verifyPayment: async (req, res, next) => {
    try {
      const { orderCode } = req.params;
      const userId = req.user._id;

      if (!orderCode) {
        throw new BadRequestError('Order code is required');
      }

      const result = await paymentService.verifyPayment(orderCode, userId);

      new SUCCESS({
        message: 'Payment verified successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Get transaction history
  getTransactionHistory: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 20, 100), // Max 100 items
        type: req.query.type,
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };

      const result = await paymentService.getTransactionHistory(userId, options);

      new SUCCESS({
        message: 'Transaction history retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Get wallet balance
  getWalletBalance: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const result = await paymentService.getWalletBalance(userId);

      new SUCCESS({
        message: 'Wallet balance retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Health check endpoint for payment system
  healthCheck: async (req, res, next) => {
    try {
      // Basic health check
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        payosConfig: {
          clientId: !!process.env.PAYOS_CLIENT_ID,
          apiKey: !!process.env.PAYOS_API_KEY,
          checksumKey: !!process.env.PAYOS_CHECKSUM_KEY
        },
        environment: process.env.NODE_ENV || 'development'
      };

      new SUCCESS({
        message: 'Payment system is healthy',
        metadata: health
      }).send(res);
    } catch (error) {
      next(error);
    }
  }
};

module.exports = paymentController;

