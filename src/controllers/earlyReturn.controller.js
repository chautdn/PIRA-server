const earlyReturnService = require('../services/earlyReturn.service');
const { SUCCESS, CREATED } = require('../core/success');
const { BadRequestError, NotFoundError, UnauthorizedError } = require('../core/error');

/**
 * Early Return Request Controller
 */
class EarlyReturnController {
  /**
   * Create early return request
   * POST /early-returns
   */
  async createRequest(req, res, next) {
    try {
      const renterId = req.user._id;
      const {
        subOrderId,
        requestedReturnDate,
        returnAddress,
        useOriginalAddress,
        notes,
        addressInfo
      } = req.body;

      console.log('[CreateRequest] Request body:', {
        subOrderId,
        requestedReturnDate,
        useOriginalAddress,
        hasReturnAddress: !!returnAddress,
        returnAddress,
        addressInfo
      });

      if (!subOrderId || !requestedReturnDate) {
        throw new BadRequestError('SubOrder ID and requested return date are required');
      }

      const result = await earlyReturnService.createEarlyReturnRequest(renterId, subOrderId, {
        requestedReturnDate,
        returnAddress,
        useOriginalAddress,
        notes,
        addressInfo
      });

      new CREATED({
        message: 'Early return request created successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      console.error('[CreateRequest] Error:', error.message);
      console.error('[CreateRequest] Error stack:', error.stack);

      if (error.name === 'ValidationError') {
        console.error('[CreateRequest] Validation errors:', error.errors);
        const errors = Object.keys(error.errors).map((key) => ({
          field: key,
          message: error.errors[key].message
        }));
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
      }

      next(error);
    }
  }

  /**
   * Get renter's early return requests
   * GET /early-returns/renter
   */
  async getRenterRequests(req, res, next) {
    try {
      const renterId = req.user._id;
      const { page, limit, status } = req.query;

      const result = await earlyReturnService.getRenterRequests(renterId, {
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 20, 100),
        status
      });

      new SUCCESS({
        message: 'Renter requests retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get owner's early return requests
   * GET /early-returns/owner
   */
  async getOwnerRequests(req, res, next) {
    try {
      const ownerId = req.user._id;
      const { page, limit, status } = req.query;

      const result = await earlyReturnService.getOwnerRequests(ownerId, {
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 20, 100),
        status
      });

      new SUCCESS({
        message: 'Owner requests retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get early return request details
   * GET /early-returns/:id
   */
  async getRequestDetails(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const result = await earlyReturnService.getRequestDetails(id, userId);

      new SUCCESS({
        message: 'Request details retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirm return received (Owner only)
   * POST /early-returns/:id/confirm-return
   */
  async confirmReturnReceived(req, res, next) {
    try {
      const { id } = req.params;
      const ownerId = req.user._id;
      const { notes, qualityCheck } = req.body;

      const result = await earlyReturnService.confirmReturnReceived(id, ownerId, {
        notes,
        qualityCheck
      });

      new SUCCESS({
        message: 'Return confirmed and deposit refunded successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel early return request (Renter only)
   * POST /early-returns/:id/cancel
   */
  async cancelRequest(req, res, next) {
    try {
      const { id } = req.params;
      const renterId = req.user._id;
      const { reason } = req.body;

      const result = await earlyReturnService.cancelRequest(id, renterId, reason);

      new SUCCESS({
        message: 'Early return request cancelled successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create owner review for renter (Owner only)
   * POST /early-returns/:id/review
   */
  async createOwnerReview(req, res, next) {
    try {
      const { id } = req.params;
      const ownerId = req.user._id;
      const { rating, detailedRating, title, comment, photos } = req.body;

      if (!rating || !comment) {
        throw new BadRequestError('Rating and comment are required');
      }

      const result = await earlyReturnService.createOwnerReview(id, ownerId, {
        rating,
        detailedRating,
        title,
        comment,
        photos
      });

      new CREATED({
        message: 'Review created successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calculate additional fee without creating request
   * POST /early-returns/calculate-fee
   */
  async calculateAdditionalFee(req, res, next) {
    try {
      const renterId = req.user._id;
      const { subOrderId, newAddress } = req.body;

      console.log('[Controller] calculateAdditionalFee called:', {
        subOrderId,
        renterId,
        hasAddress: !!newAddress,
        hasCoords: !!newAddress?.coordinates
      });

      if (!subOrderId || !newAddress || !newAddress.coordinates) {
        throw new BadRequestError('SubOrder ID and new address with coordinates are required');
      }

      const result = await earlyReturnService.calculateAdditionalFee(
        subOrderId,
        renterId,
        newAddress
      );

      new SUCCESS({
        message: result.message,
        metadata: result
      }).send(res);
    } catch (error) {
      console.error('[Controller] calculateAdditionalFee error:', error.message);
      console.error('[Controller] Error stack:', error.stack);
      next(error);
    }
  }

  /**
   * Pay upfront shipping fee before creating request
   * POST /early-returns/pay-upfront-shipping
   */
  async payUpfrontShippingFee(req, res, next) {
    try {
      const renterId = req.user._id;
      const { subOrderId, amount, paymentMethod, addressInfo } = req.body;

      if (!subOrderId || !amount || !paymentMethod) {
        throw new BadRequestError('SubOrder ID, amount, and payment method are required');
      }

      if (!['wallet', 'payos'].includes(paymentMethod)) {
        throw new BadRequestError('Payment method must be wallet or payos');
      }

      const paymentService = require('../services/payment.service');

      if (paymentMethod === 'wallet') {
        // Process wallet payment immediately
        const walletResult = await paymentService.processWalletPaymentForOrder(renterId, amount, {
          orderNumber: `Shipping-${subOrderId}`,
          orderType: 'early_return_upfront_shipping',
          addressInfo
        });

        // Credit system wallet with the fee
        const SystemWallet = require('../models/SystemWallet');
        const Transaction = require('../models/Transaction');
        const User = require('../models/User');

        const systemWallet = await SystemWallet.findOne({});
        if (systemWallet) {
          systemWallet.balance.available += amount;
          systemWallet.lastModifiedBy = renterId;
          systemWallet.lastModifiedAt = new Date();
          await systemWallet.save();

          // Create transaction record for system wallet - use first admin as user
          const adminUser = await User.findOne({ role: 'admin' });
          const systemTransaction = new Transaction({
            user: adminUser?._id || renterId,
            wallet: systemWallet._id,
            type: 'TRANSFER_IN',
            amount,
            status: 'success',
            paymentMethod: 'wallet',
            description: `Phí ship thêm - Trả hàng sớm từ renter`,
            toSystemWallet: true,
            systemWalletAction: 'fee_collection',
            metadata: {
              subOrderId,
              renterId,
              sourceTransaction: walletResult.transactionId,
              orderType: 'early_return_upfront_shipping',
              addressInfo
            },
            processedAt: new Date()
          });
          await systemTransaction.save();

          console.log(`[PayUpfront] Credited ${amount}đ to system wallet`);
        }

        new SUCCESS({
          message: 'Thanh toán phí ship thành công qua ví',
          metadata: {
            paymentMethod: 'wallet',
            transactionId: walletResult.transactionId,
            balanceAfter: walletResult.balanceAfter
          }
        }).send(res);
      } else if (paymentMethod === 'payos') {
        // Create PayOS payment session
        const orderCode = Date.now();
        const paymentLink = await paymentService.createPaymentLink({
          orderCode,
          amount,
          description: `PIRA Ship ${Math.round(amount / 1000)}k`,
          returnUrl: `${process.env.CLIENT_URL || 'https://pira.asia'}/rental-orders/shipping-payment-success?orderCode=${orderCode}&subOrderId=${subOrderId}`,
          cancelUrl: `${process.env.CLIENT_URL || 'https://pira.asia'}/rental-orders/shipping-payment-cancel?orderCode=${orderCode}&subOrderId=${subOrderId}`
        });

        // Create transaction record
        const Transaction = require('../models/Transaction');
        const Wallet = require('../models/Wallet');
        const wallet = await Wallet.findOne({ user: renterId });

        const transaction = new Transaction({
          user: renterId,
          wallet: wallet._id,
          type: 'payment',
          amount,
          status: 'pending',
          paymentMethod: 'payos',
          externalId: orderCode.toString(),
          description: `Phí ship thêm - Trả hàng sớm`,
          metadata: {
            subOrderId,
            orderType: 'early_return_upfront_shipping',
            addressInfo
          },
          expiredAt: new Date(Date.now() + 15 * 60 * 1000)
        });

        await transaction.save();

        new SUCCESS({
          message: 'Chuyển đến trang thanh toán PayOS',
          metadata: {
            paymentMethod: 'payos',
            checkoutUrl: paymentLink.checkoutUrl,
            orderCode
          }
        }).send(res);
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update return address with distance calculation
   * PUT /early-returns/:id/address
   */
  async updateReturnAddress(req, res, next) {
    try {
      const { id } = req.params;
      const renterId = req.user._id;
      const { returnAddress } = req.body;

      if (!returnAddress || !returnAddress.coordinates) {
        throw new BadRequestError('Return address with coordinates is required');
      }

      const result = await earlyReturnService.updateReturnAddress(id, renterId, returnAddress);

      new SUCCESS({
        message: result.message,
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Pay additional shipping fee
   * POST /early-returns/:id/pay-additional-shipping
   */
  async payAdditionalShipping(req, res, next) {
    try {
      const { id } = req.params;
      const renterId = req.user._id;
      const { paymentMethod } = req.body;

      if (!paymentMethod || !['wallet', 'payos'].includes(paymentMethod)) {
        throw new BadRequestError('Valid payment method (wallet or payos) is required');
      }

      const result = await earlyReturnService.payAdditionalShipping(id, renterId, paymentMethod);

      new SUCCESS({
        message: result.message,
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify additional shipping payment
   * GET /early-returns/verify-additional-shipping/:orderCode
   */
  async verifyAdditionalShippingPayment(req, res, next) {
    try {
      const { orderCode } = req.params;
      const renterId = req.user._id;

      const result = await earlyReturnService.verifyAdditionalShippingPayment(orderCode, renterId);

      new SUCCESS({
        message: result.message,
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Auto-complete expired returns (Admin/System only)
   * POST /early-returns/auto-complete
   */
  async autoCompleteExpired(req, res, next) {
    try {
      // Check if user is admin
      if (req.user.role !== 'ADMIN') {
        throw new UnauthorizedError('Only admins can trigger auto-completion');
      }

      const result = await earlyReturnService.autoCompleteExpiredReturns();

      new SUCCESS({
        message: 'Auto-completion completed',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update early return request (Renter only)
   * PUT /early-returns/:id
   */
  async updateRequest(req, res, next) {
    try {
      const { id } = req.params;
      const renterId = req.user._id;
      const { requestedReturnDate, returnAddress, notes } = req.body;

      const result = await earlyReturnService.updateEarlyReturnRequest(id, renterId, {
        requestedReturnDate,
        returnAddress,
        notes
      });

      new SUCCESS({
        message: 'Early return request updated successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete early return request (Renter only)
   * DELETE /early-returns/:id
   */
  async deleteRequest(req, res, next) {
    try {
      const { id } = req.params;
      const renterId = req.user._id;

      const result = await earlyReturnService.deleteEarlyReturnRequest(id, renterId);

      new SUCCESS({
        message: 'Early return request deleted successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EarlyReturnController();
