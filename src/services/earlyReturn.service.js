const EarlyReturnRequest = require('../models/EarlyReturnRequest');
const SubOrder = require('../models/SubOrder');
const MasterOrder = require('../models/MasterOrder');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Review = require('../models/Review');
const mongoose = require('mongoose');
const voucherService = require('./voucher.service');

/**
 * Early Return Request Service
 * Handles early return logic for rental orders
 */
class EarlyReturnRequestService {
  /**
   * Create early return request
   * @param {string} renterId - Renter user ID
   * @param {string} subOrderId - SubOrder ID
   * @param {Object} returnData - Return request data
   * @returns {Promise<Object>}
   */
  async createEarlyReturnRequest(renterId, subOrderId, returnData) {
    try {
      // 1. Validate SubOrder exists and is in ACTIVE status
      const subOrder = await SubOrder.findById(subOrderId)
        .populate('masterOrder')
        .populate('owner', 'name email phone');

      if (!subOrder) {
        throw new Error('SubOrder not found');
      }

      // Check if subOrder belongs to renter
      if (subOrder.masterOrder.renter.toString() !== renterId.toString()) {
        throw new Error('Unauthorized: This order does not belong to you');
      }

      // Check if subOrder has any products with ACTIVE status
      const hasActiveProducts = subOrder.products?.some(p => p.productStatus === 'ACTIVE');
      if (!hasActiveProducts) {
        throw new Error(
          'Cannot create early return request. No products with ACTIVE status found in this order.'
        );
      }

      // 2. Check if early return already exists for this subOrder
      // Only allow one active request (not cancelled or completed)
      const existingRequest = await EarlyReturnRequest.findOne({
        subOrder: subOrderId,
        status: {
          $in: ['PENDING', 'ACKNOWLEDGED', 'RETURNED', 'COMPLETED', 'AUTO_COMPLETED']
        }
      });

      if (existingRequest) {
        throw new Error(
          `Cannot create early return request. A ${existingRequest.status.toLowerCase()} early return request already exists for this order`
        );
      }

      // 3. Extract rental period from SubOrder
      // Use the first product's rental period if SubOrder doesn't have one
      let rentalPeriod = subOrder.rentalPeriod;
      if (!rentalPeriod || !rentalPeriod.startDate || !rentalPeriod.endDate) {
        if (subOrder.products && subOrder.products.length > 0) {
          rentalPeriod = subOrder.products[0].rentalPeriod;
        }
      }

      if (!rentalPeriod || !rentalPeriod.startDate || !rentalPeriod.endDate) {
        throw new Error('Cannot determine rental period from order');
      }

      // 4. Validate requested return date
      const requestedDate = new Date(returnData.requestedReturnDate);
      const startDate = new Date(rentalPeriod.startDate);
      const endDate = new Date(rentalPeriod.endDate);

      // Set all dates to midnight for comparison
      requestedDate.setHours(0, 0, 0, 0);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      // Must be at least 1 day before original end date
      const oneDayBeforeEnd = new Date(endDate);
      oneDayBeforeEnd.setDate(oneDayBeforeEnd.getDate() - 1);

      if (requestedDate < startDate) {
        throw new Error('Return date cannot be before rental start date');
      }

      if (requestedDate > oneDayBeforeEnd) {
        throw new Error('Return date must be at least 1 day before original end date');
      }

      // 5. Get renter's address if using original address
      const renter = await User.findById(renterId);
      if (!renter) {
        throw new Error('Renter not found');
      }

      let returnAddress = returnData.returnAddress;

      // If using original address, get from user's saved addresses
      if (returnData.useOriginalAddress && renter.addresses && renter.addresses.length > 0) {
        // Use default address or first address
        const defaultAddress =
          renter.addresses.find((addr) => addr.isDefault) || renter.addresses[0];

        returnAddress = {
          streetAddress: defaultAddress.streetAddress,
          ward: defaultAddress.ward,
          district: defaultAddress.district,
          city: defaultAddress.city,
          province: defaultAddress.province,
          coordinates: defaultAddress.coordinates,
          contactName: renter.name,
          contactPhone: defaultAddress.phone || renter.phone,
          isOriginalAddress: true
        };
      } else if (!returnAddress || !returnAddress.streetAddress) {
        throw new Error('Return address is required');
      }

      // Ensure contactPhone is set
      if (!returnAddress.contactPhone) {
        returnAddress.contactPhone = renter.phone;
      }

      // 6. Determine delivery method from masterOrder
      const masterOrder = await MasterOrder.findById(subOrder.masterOrder);
      const deliveryMethod = masterOrder.deliveryMethod || 'PICKUP';

      // 7. Find return shipment if delivery method is DELIVERY
      let returnShipment = null;
      if (deliveryMethod === 'DELIVERY') {
        returnShipment = await Shipment.findOne({
          order: subOrderId,
          type: 'RETURN'
        });

        // Update return shipment with new address if provided
        if (returnShipment && !returnData.useOriginalAddress) {
          returnShipment.fromAddress = {
            streetAddress: returnAddress.streetAddress,
            ward: returnAddress.ward,
            district: returnAddress.district,
            city: returnAddress.city,
            province: returnAddress.province,
            coordinates: returnAddress.coordinates
          };
          returnShipment.scheduledAt = new Date(returnData.requestedReturnDate);
          await returnShipment.save();
        }
      }

      // 8. Create early return request
      const earlyReturnRequest = new EarlyReturnRequest({
        subOrder: subOrderId,
        masterOrder: subOrder.masterOrder._id,
        renter: renterId,
        owner: subOrder.owner._id,
        returnShipment: returnShipment?._id,
        originalPeriod: {
          startDate: rentalPeriod.startDate,
          endDate: rentalPeriod.endDate
        },
        requestedReturnDate: returnData.requestedReturnDate,
        returnAddress,
        deliveryMethod,
        renterNotes: returnData.notes,
        depositRefund: {
          amount: subOrder.pricing?.subtotalDeposit || 0,
          status: 'PENDING'
        }
      });

      await earlyReturnRequest.save();

      // 9. Create notification for owner
      const Notification = require('../models/Notification');
      const notification = new Notification({
        recipient: subOrder.owner._id,
        sender: renterId,
        type: 'EARLY_RETURN_REQUEST',
        title: 'Yêu cầu trả hàng sớm',
        message: `${renter.name} sẽ trả hàng sớm vào ${new Date(returnData.requestedReturnDate).toLocaleDateString('vi-VN')}. Bạn cần có mặt tại ${returnAddress.streetAddress}, ${returnAddress.ward}, ${returnAddress.district}, ${returnAddress.city} để nhận sản phẩm.`,
        relatedId: earlyReturnRequest._id,
        relatedModel: 'EarlyReturnRequest',
        metadata: {
          requestNumber: earlyReturnRequest.requestNumber,
          subOrderNumber: subOrder.subOrderNumber,
          requestedReturnDate: returnData.requestedReturnDate,
          returnAddress: {
            full: `${returnAddress.streetAddress}, ${returnAddress.ward}, ${returnAddress.district}, ${returnAddress.city}`,
            coordinates: returnAddress.coordinates
          },
          deliveryMethod
        }
      });
      await notification.save();

      // 10. Send socket notification to owner
      if (global.chatGateway) {
        global.chatGateway.emitToUser(subOrder.owner._id.toString(), 'early-return-request', {
          type: 'early_return_requested',
          requestId: earlyReturnRequest._id,
          requestNumber: earlyReturnRequest.requestNumber,
          renterName: renter.name,
          requestedDate: returnData.requestedReturnDate,
          returnAddress: `${returnAddress.streetAddress}, ${returnAddress.ward}, ${returnAddress.district}, ${returnAddress.city}`,
          subOrderNumber: subOrder.subOrderNumber,
          deliveryMethod,
          message: `${renter.name} sẽ trả hàng sớm vào ${new Date(returnData.requestedReturnDate).toLocaleDateString('vi-VN')}. ${deliveryMethod === 'PICKUP' ? 'Khách hàng sẽ đến địa chỉ của bạn.' : 'Bạn cần có mặt để nhận hàng.'}`
        });
      }

      return {
        success: true,
        earlyReturnRequest,
        message: 'Early return request created successfully'
      };
    } catch (error) {
      console.error('Create early return request error:', error);
      throw error;
    }
  }

  /**
   * Get early return requests for renter
   * @param {string} renterId - Renter user ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>}
   */
  async getRenterRequests(renterId, options = {}) {
    try {
      const { page = 1, limit = 20, status } = options;

      const query = { renter: renterId };
      if (status) query.status = status;

      const [requests, total] = await Promise.all([
        EarlyReturnRequest.find(query)
          .populate('subOrder', 'subOrderNumber status pricing')
          .populate({
            path: 'masterOrder',
            select: 'masterOrderNumber'
          })
          .populate('owner', 'name email phone avatar profile')
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip((page - 1) * limit)
          .lean(),
        EarlyReturnRequest.countDocuments(query)
      ]);

      return {
        requests,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      };
    } catch (error) {
      throw new Error(`Failed to get renter requests: ${error.message}`);
    }
  }

  /**
   * Get early return requests for owner
   * @param {string} ownerId - Owner user ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>}
   */
  async getOwnerRequests(ownerId, options = {}) {
    try {
      const { page = 1, limit = 20, status } = options;

      const query = { owner: ownerId };
      if (status) query.status = status;

      const [requests, total] = await Promise.all([
        EarlyReturnRequest.find(query)
          .populate('subOrder', 'subOrderNumber status pricing')
          .populate({
            path: 'masterOrder',
            select: 'masterOrderNumber'
          })
          .populate('renter', 'email phone profile')
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip((page - 1) * limit)
          .lean(),
        EarlyReturnRequest.countDocuments(query)
      ]);

      return {
        requests,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total
        }
      };
    } catch (error) {
      throw new Error(`Failed to get owner requests: ${error.message}`);
    }
  }

  /**
   * Confirm return received by owner
   * @param {string} requestId - Early return request ID
   * @param {string} ownerId - Owner user ID
   * @param {Object} confirmData - Confirmation data (quality check, notes)
   * @returns {Promise<Object>}
   */
  async confirmReturnReceived(requestId, ownerId, confirmData = {}) {
    // Try to use session, fallback to standalone if not available
    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (sessionError) {
      // Standalone MongoDB - continue without session
      session = null;
    }

    try {
      // 1. Find early return request
      const request = session
        ? await EarlyReturnRequest.findById(requestId).session(session)
        : await EarlyReturnRequest.findById(requestId);

      if (!request) {
        throw new Error('Early return request not found');
      }

      // Verify ownership
      if (request.owner.toString() !== ownerId.toString()) {
        throw new Error('Unauthorized: You are not the owner of this request');
      }

      // Check status
      if (request.status === 'RETURNED' || request.status === 'COMPLETED') {
        throw new Error('Return already confirmed');
      }

      // 2. Update request status
      request.status = 'RETURNED';
      request.ownerConfirmation = {
        returnedAt: new Date(),
        notes: confirmData.notes,
        qualityCheck: confirmData.qualityCheck
      };

      if (session) {
        await request.save({ session });
      } else {
        await request.save();
      }

      // 3. Update SubOrder status
      const subOrder = session
        ? await SubOrder.findById(request.subOrder)
            .populate('masterOrder', 'renter')
            .populate('owner', '_id email')
            .session(session)
        : await SubOrder.findById(request.subOrder)
            .populate('masterOrder', 'renter')
            .populate('owner', '_id email');

      if (session) {
        await SubOrder.findByIdAndUpdate(request.subOrder, { status: 'RETURNED' }, { session });
      } else {
        await SubOrder.findByIdAndUpdate(request.subOrder, { status: 'RETURNED' });
      }

      // 4. Process deposit refund
      const refundResult = await this._processDepositRefundStandalone(request, session);

      // 5. Award loyalty points to both owner and renter after successful return (ONLY for online payments)
      if (subOrder && subOrder.masterOrder && subOrder.owner) {
        try {
          // Get full MasterOrder to check payment method
          const fullMasterOrder = session
            ? await MasterOrder.findById(subOrder.masterOrder._id).session(session)
            : await MasterOrder.findById(subOrder.masterOrder._id);

          const isOnlinePayment =
            fullMasterOrder &&
            ['WALLET', 'PAYOS', 'BANK_TRANSFER'].includes(fullMasterOrder.paymentMethod);

          if (isOnlinePayment) {
            // Award 5 points to renter
            await voucherService.awardLoyaltyPoints(
              subOrder.masterOrder.renter,
              5,
              `SubOrder returned - ${request.requestNumber} (${fullMasterOrder.paymentMethod})`
            );

            // Award 5 points to owner
            await voucherService.awardLoyaltyPoints(
              subOrder.owner._id,
              5,
              `SubOrder returned - ${request.requestNumber} (${fullMasterOrder.paymentMethod})`
            );

            console.log(
              `✅ Loyalty points awarded to owner and renter for SubOrder return (Payment: ${fullMasterOrder.paymentMethod})`
            );
          } else {
            console.log(
              `ℹ️ Skipping loyalty points for COD order (Payment: ${fullMasterOrder?.paymentMethod})`
            );
          }
        } catch (loyaltyError) {
          console.error('❌ Error awarding loyalty points:', loyaltyError);
          // Don't fail the whole transaction if loyalty points fail
        }
      }

      if (session) {
        await session.commitTransaction();
      }

      // 6. Send notification to renter
      if (global.chatGateway) {
        global.chatGateway.emitToUser(request.renter.toString(), 'return-confirmed', {
          type: 'return_confirmed',
          requestId: request._id,
          requestNumber: request.requestNumber,
          depositRefunded: refundResult.refunded,
          refundAmount: refundResult.amount,
          message: 'Chủ đã xác nhận nhận hàng. Tiền cọc đã được hoàn trả.'
        });
      }

      return {
        success: true,
        request,
        refundResult,
        message: 'Return confirmed and deposit refunded successfully'
      };
    } catch (error) {
      if (session) {
        await session.abortTransaction();
      }
      console.error('Confirm return error:', error);
      throw error;
    } finally {
      if (session) {
        session.endSession();
      }
    }
  }

  /**
   * Process deposit refund (internal method)
   * @private
   * @param {Object} request - Early return request
   * @param {Object} session - Mongoose session
   * @returns {Promise<Object>}
   */
  async _processDepositRefund(request, session) {
    try {
      const depositAmount = request.depositRefund.amount;

      if (depositAmount <= 0) {
        return { refunded: false, amount: 0, message: 'No deposit to refund' };
      }

      // Get renter's wallet
      const wallet = await Wallet.findOne({ user: request.renter }).session(session);
      if (!wallet) {
        throw new Error('Renter wallet not found');
      }

      // Add deposit back to wallet
      wallet.balance.available += depositAmount;
      await wallet.save({ session });

      // Create transaction record
      const transaction = new Transaction({
        user: request.renter,
        wallet: wallet._id,
        type: 'refund',
        amount: depositAmount,
        status: 'success',
        description: `Hoàn cọc trả hàng sớm - ${request.requestNumber}`,
        metadata: {
          earlyReturnRequest: request._id,
          subOrder: request.subOrder,
          originalEndDate: request.originalPeriod.endDate,
          actualReturnDate: request.requestedReturnDate
        },
        processedAt: new Date()
      });

      await transaction.save({ session });

      // Update request with refund info
      request.depositRefund = {
        amount: depositAmount,
        status: 'COMPLETED',
        refundedAt: new Date(),
        transactionId: transaction._id
      };
      request.status = 'COMPLETED';

      await request.save({ session });

      // Emit wallet update
      if (global.chatGateway) {
        global.chatGateway.emitWalletUpdate(request.renter.toString(), {
          type: 'balance_updated',
          amount: depositAmount,
          newBalance: wallet.balance.available,
          transactionId: transaction._id,
          reason: 'deposit_refund'
        });
      }

      return {
        refunded: true,
        amount: depositAmount,
        newBalance: wallet.balance.available,
        transactionId: transaction._id
      };
    } catch (error) {
      console.error('Deposit refund error:', error);
      throw error;
    }
  }

  /**
   * Auto-complete orders 24h after original end date
   * Called by scheduled job
   * @returns {Promise<Object>}
   */
  async autoCompleteExpiredReturns() {
    try {
      const now = new Date();

      // Find all ACKNOWLEDGED requests where auto-completion date has passed
      const expiredRequests = await EarlyReturnRequest.find({
        status: { $in: ['PENDING', 'ACKNOWLEDGED'] },
        autoCompletionDate: { $lte: now },
        autoCompletionScheduled: false
      });

      const results = [];

      for (const request of expiredRequests) {
        // Use session only if replica set is available
        let session = null;
        try {
          session = await mongoose.startSession();
          session.startTransaction();
        } catch (sessionError) {
          // Standalone MongoDB - continue without session
          session = null;
        }

        try {
          // Mark as returned
          request.status = 'RETURNED';
          request.ownerConfirmation = {
            returnedAt: new Date(),
            notes: 'Auto-completed after 24h without owner confirmation'
          };

          if (session) {
            await request.save({ session });
          } else {
            await request.save();
          }

          // Process deposit refund (will handle session internally)
          const refundResult = await this._processDepositRefundStandalone(request, session);

          // Get SubOrder details for loyalty points
          const subOrder = await SubOrder.findById(request.subOrder)
            .populate('masterOrder', 'renter')
            .populate('owner', '_id email');

          // Update SubOrder
          if (session) {
            await SubOrder.findByIdAndUpdate(
              request.subOrder,
              { status: 'COMPLETED' },
              { session }
            );
          } else {
            await SubOrder.findByIdAndUpdate(request.subOrder, { status: 'COMPLETED' });
          }

          // Award loyalty points to both owner and renter after completion (ONLY for online payments)
          if (subOrder && subOrder.masterOrder && subOrder.owner) {
            try {
              // Get full MasterOrder to check payment method
              const fullMasterOrder = await MasterOrder.findById(subOrder.masterOrder._id);
              const isOnlinePayment =
                fullMasterOrder &&
                ['WALLET', 'PAYOS', 'BANK_TRANSFER'].includes(fullMasterOrder.paymentMethod);

              if (isOnlinePayment) {
                // Award 5 points to renter
                await voucherService.awardLoyaltyPoints(
                  subOrder.masterOrder.renter,
                  5,
                  `SubOrder ${request.requestNumber} completed (${fullMasterOrder.paymentMethod})`
                );

                // Award 5 points to owner
                await voucherService.awardLoyaltyPoints(
                  subOrder.owner._id,
                  5,
                  `SubOrder ${request.requestNumber} completed (${fullMasterOrder.paymentMethod})`
                );

                console.log(
                  `✅ Loyalty points awarded to owner and renter for SubOrder completion (Payment: ${fullMasterOrder.paymentMethod})`
                );
              } else {
                console.log(
                  `ℹ️ Skipping loyalty points for COD order (Payment: ${fullMasterOrder?.paymentMethod})`
                );
              }
            } catch (loyaltyError) {
              console.error('❌ Error awarding loyalty points:', loyaltyError);
              // Don't fail the whole transaction if loyalty points fail
            }
          }

          // Update final status
          request.status = 'AUTO_COMPLETED';
          request.autoCompletionScheduled = true;

          if (session) {
            await request.save({ session });
            await session.commitTransaction();
          } else {
            await request.save();
          }

          results.push({
            requestId: request._id,
            requestNumber: request.requestNumber,
            success: true,
            refunded: refundResult.refunded,
            amount: refundResult.amount
          });

          // Send notification to renter
          if (global.chatGateway) {
            global.chatGateway.emitToUser(request.renter.toString(), 'return-auto-completed', {
              type: 'return_auto_completed',
              requestId: request._id,
              requestNumber: request.requestNumber,
              depositRefunded: refundResult.refunded,
              refundAmount: refundResult.amount,
              message: 'Đơn hàng đã được tự động hoàn thành. Tiền cọc đã được hoàn trả.'
            });
          }
        } catch (error) {
          if (session) {
            await session.abortTransaction();
          }
          console.error(`Failed to auto-complete request ${request._id}:`, error);
          results.push({
            requestId: request._id,
            requestNumber: request.requestNumber,
            success: false,
            error: error.message
          });
        } finally {
          if (session) {
            session.endSession();
          }
        }
      }

      return {
        success: true,
        totalProcessed: results.length,
        results
      };
    } catch (error) {
      console.error('Auto-complete error:', error);
      throw error;
    }
  }

  /**
   * Process deposit refund for standalone MongoDB (no session required)
   * @private
   * @param {Object} request - Early return request
   * @param {Object} session - Mongoose session (optional)
   * @returns {Promise<Object>}
   */
  async _processDepositRefundStandalone(request, session = null) {
    try {
      const depositAmount = request.depositRefund.amount;

      if (depositAmount <= 0) {
        return { refunded: false, amount: 0, message: 'No deposit to refund' };
      }

      // Get renter's wallet
      const wallet = session
        ? await Wallet.findOne({ user: request.renter }).session(session)
        : await Wallet.findOne({ user: request.renter });

      if (!wallet) {
        throw new Error('Renter wallet not found');
      }

      // Add deposit back to wallet
      wallet.balance.available += depositAmount;

      if (session) {
        await wallet.save({ session });
      } else {
        await wallet.save();
      }

      // Create transaction record
      const transaction = new Transaction({
        user: request.renter,
        wallet: wallet._id,
        type: 'refund',
        amount: depositAmount,
        status: 'success',
        description: `Hoàn cọc trả hàng sớm - ${request.requestNumber}`,
        metadata: {
          earlyReturnRequest: request._id,
          subOrder: request.subOrder,
          originalEndDate: request.originalPeriod.endDate,
          actualReturnDate: request.requestedReturnDate
        },
        processedAt: new Date()
      });

      if (session) {
        await transaction.save({ session });
      } else {
        await transaction.save();
      }

      // Update request with refund info
      request.depositRefund = {
        amount: depositAmount,
        status: 'COMPLETED',
        refundedAt: new Date(),
        transactionId: transaction._id
      };
      request.status = 'COMPLETED';

      if (session) {
        await request.save({ session });
      } else {
        await request.save();
      }

      // Emit wallet update
      if (global.chatGateway) {
        global.chatGateway.emitWalletUpdate(request.renter.toString(), {
          type: 'balance_updated',
          amount: depositAmount,
          newBalance: wallet.balance.available,
          transactionId: transaction._id,
          reason: 'deposit_refund'
        });
      }

      return {
        refunded: true,
        amount: depositAmount,
        newBalance: wallet.balance.available,
        transactionId: transaction._id
      };
    } catch (error) {
      console.error('Deposit refund error:', error);
      throw error;
    }
  }

  /**
   * Cancel early return request (renter only)
   * @param {string} requestId - Early return request ID
   * @param {string} renterId - Renter user ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>}
   */
  async cancelRequest(requestId, renterId, reason) {
    try {
      const request = await EarlyReturnRequest.findById(requestId);

      if (!request) {
        throw new Error('Early return request not found');
      }

      if (request.renter.toString() !== renterId.toString()) {
        throw new Error('Unauthorized: You can only cancel your own requests');
      }

      if (!['PENDING', 'ACKNOWLEDGED'].includes(request.status)) {
        throw new Error('Cannot cancel request in current status');
      }

      request.status = 'CANCELLED';
      request.cancellation = {
        cancelledBy: renterId,
        cancelledAt: new Date(),
        reason
      };

      await request.save();

      // Notify owner
      if (global.chatGateway) {
        global.chatGateway.emitToUser(request.owner.toString(), 'return-cancelled', {
          type: 'return_cancelled',
          requestId: request._id,
          requestNumber: request.requestNumber,
          message: 'Yêu cầu trả hàng sớm đã bị hủy'
        });
      }

      return {
        success: true,
        request,
        message: 'Early return request cancelled successfully'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create owner review for renter (after return confirmed)
   * @param {string} requestId - Early return request ID
   * @param {string} ownerId - Owner user ID
   * @param {Object} reviewData - Review data
   * @returns {Promise<Object>}
   */
  async createOwnerReview(requestId, ownerId, reviewData) {
    try {
      // 1. Find early return request
      const request = await EarlyReturnRequest.findById(requestId).populate('subOrder');

      if (!request) {
        throw new Error('Early return request not found');
      }

      // Verify ownership
      if (request.owner.toString() !== ownerId.toString()) {
        throw new Error('Unauthorized: You are not the owner of this request');
      }

      // Check if return is confirmed
      if (!['RETURNED', 'COMPLETED', 'AUTO_COMPLETED'].includes(request.status)) {
        throw new Error('Can only review after return is confirmed');
      }

      // Check if already reviewed
      if (request.ownerReview || !request.canOwnerReview) {
        throw new Error('You have already reviewed this renter for this order');
      }

      // 2. Create review
      const review = new Review({
        order: request.subOrder._id,
        reviewer: ownerId,
        reviewee: request.renter,
        type: 'USER_REVIEW',
        intendedFor: 'RENTER',
        rating: reviewData.rating,
        detailedRating: reviewData.detailedRating,
        title: reviewData.title,
        comment: reviewData.comment,
        photos: reviewData.photos || [],
        status: 'APPROVED' // Auto-approve owner reviews
      });

      await review.save();

      // 3. Update request
      request.ownerReview = review._id;
      request.canOwnerReview = false;
      await request.save();

      // 4. Notify renter
      if (global.chatGateway) {
        global.chatGateway.emitToUser(request.renter.toString(), 'owner-reviewed', {
          type: 'owner_reviewed',
          reviewId: review._id,
          rating: reviewData.rating,
          message: 'Chủ đã đánh giá bạn'
        });
      }

      return {
        success: true,
        review,
        message: 'Review created successfully'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate additional shipping fee WITHOUT creating request
   * Used for upfront fee display
   * @param {string} subOrderId - SubOrder ID
   * @param {string} renterId - Renter user ID
   * @param {Object} newAddress - New return address with coordinates
   * @returns {Promise<Object>}
   */
  async calculateAdditionalFee(subOrderId, renterId, newAddress) {
    try {
      const vietmapService = require('./vietmap.service');
      
      // Get SubOrder with owner and products populated, AND masterOrder for delivery address
      const subOrder = await SubOrder.findById(subOrderId)
        .populate('owner', 'addresses')
        .populate('products.product', 'location')
        .populate('masterOrder', 'deliveryAddress');

      if (!subOrder) {
        throw new Error('SubOrder not found');
      }

      console.log('[CalculateFee] SubOrder found:', subOrderId);
      console.log('[CalculateFee] SubOrder.ownerAddress exists:', !!subOrder.ownerAddress);
      console.log('[CalculateFee] SubOrder.owner exists:', !!subOrder.owner);
      console.log('[CalculateFee] Products count:', subOrder.products?.length);
      console.log('[CalculateFee] MasterOrder deliveryAddress:', subOrder.masterOrder?.deliveryAddress);
      console.log('[CalculateFee] Shipping info:', {
        distance: subOrder.shipping?.distance,
        vietmapResponse: subOrder.shipping?.vietmapResponse
      });

      // Try to get owner's address from multiple sources
      let ownerAddress;
      
      // First, try SubOrder.ownerAddress
      if (subOrder.ownerAddress?.latitude && subOrder.ownerAddress?.longitude) {
        ownerAddress = {
          latitude: subOrder.ownerAddress.latitude,
          longitude: subOrder.ownerAddress.longitude
        };
        console.log('[CalculateFee] Using SubOrder.ownerAddress:', ownerAddress);
      } 
      // Second, try product location (products are located at owner's address)
      else if (subOrder.products?.[0]?.product?.location?.coordinates?.latitude && 
               subOrder.products?.[0]?.product?.location?.coordinates?.longitude) {
        const productLocation = subOrder.products[0].product.location;
        ownerAddress = {
          latitude: productLocation.coordinates.latitude,
          longitude: productLocation.coordinates.longitude
        };
        console.log('[CalculateFee] Using product location:', ownerAddress);
      }
      // Third, try owner's user addresses
      else if (subOrder.owner?.addresses?.length > 0) {
        const userAddress = subOrder.owner.addresses.find(a => a.isDefault) || subOrder.owner.addresses[0];
        if (userAddress?.coordinates?.latitude && userAddress?.coordinates?.longitude) {
          ownerAddress = {
            latitude: userAddress.coordinates.latitude,
            longitude: userAddress.coordinates.longitude
          };
          console.log('[CalculateFee] Using owner user address:', ownerAddress);
        }
      }

      if (!ownerAddress?.latitude || !ownerAddress?.longitude) {
        console.error('[CalculateFee] Owner address not found. SubOrder:', {
          hasOwnerAddress: !!subOrder.ownerAddress,
          ownerAddressData: subOrder.ownerAddress,
          hasOwner: !!subOrder.owner,
          ownerAddresses: subOrder.owner?.addresses,
          hasProducts: !!subOrder.products?.length,
          productLocation: subOrder.products?.[0]?.product?.location
        });

        // Try to use geocoding as fallback
        console.log('[CalculateFee] Attempting to geocode owner address...');
        
        let addressToGeocode;
        if (subOrder.ownerAddress?.streetAddress) {
          addressToGeocode = `${subOrder.ownerAddress.streetAddress}, ${subOrder.ownerAddress.ward}, ${subOrder.ownerAddress.district}, ${subOrder.ownerAddress.city}`;
        } else if (subOrder.products?.[0]?.product?.location?.address?.street) {
          const loc = subOrder.products[0].product.location.address;
          addressToGeocode = `${loc.street}, ${loc.ward}, ${loc.district}, ${loc.city}`;
        } else if (subOrder.masterOrder?.deliveryAddress && subOrder.shipping?.distance) {
          // Last resort: We have the delivery address coords and original distance
          // We can still calculate the NEW distance and compare
          console.log('[CalculateFee] Using delivery address as reference point');
          const deliveryAddr = subOrder.masterOrder.deliveryAddress;
          
          if (deliveryAddr?.latitude && deliveryAddr?.longitude) {
            // Calculate distance from delivery address to new address
            const distanceFromDeliveryToNew = await vietmapService.calculateDistance(
              deliveryAddr.longitude,
              deliveryAddr.latitude,
              newAddress.coordinates.longitude,
              newAddress.coordinates.latitude
            );
            
            console.log('[CalculateFee] Distance from delivery to new address:', distanceFromDeliveryToNew.distanceKm, 'km');
            console.log('[CalculateFee] Original shipping distance was:', subOrder.shipping.distance, 'km');
            
            // If new address is farther from delivery point, user might need to pay more
            const originalDistance = { distanceKm: subOrder.shipping.distance || 0 };
            const newDistance = distanceFromDeliveryToNew;
            const distanceDiff = newDistance.distanceKm - originalDistance.distanceKm;
            
            let additionalFee = 0;
            if (distanceDiff > 0) {
              const feeCalculation = vietmapService.calculateShippingFee(distanceDiff);
              additionalFee = feeCalculation.finalFee;
              console.log('[CalculateFee] Additional fee:', additionalFee, 'VND');
            }
            
            return {
              success: true,
              requiresPayment: additionalFee > 0,
              additionalFee,
              distanceDiff,
              originalDistance: originalDistance.distanceKm,
              newDistance: newDistance.distanceKm,
              message: additionalFee > 0 
                ? `Địa chỉ mới xa hơn ${distanceDiff.toFixed(1)}km. Phí ship thêm: ${additionalFee.toLocaleString()}đ`
                : 'Địa chỉ mới gần hơn hoặc bằng địa chỉ gốc'
            };
          }
        }

        if (addressToGeocode) {
          console.log('[CalculateFee] Geocoding address:', addressToGeocode);
          const geocodeResult = await vietmapService.geocodeAddress(addressToGeocode);
          
          if (geocodeResult.success && geocodeResult.latitude && geocodeResult.longitude) {
            ownerAddress = {
              latitude: geocodeResult.latitude,
              longitude: geocodeResult.longitude
            };
            console.log('[CalculateFee] Geocoding successful:', ownerAddress);
          } else {
            console.error('[CalculateFee] Geocoding failed:', geocodeResult);
          }
        }

        // If still no coordinates, throw error
        if (!ownerAddress?.latitude || !ownerAddress?.longitude) {
          throw new Error('Owner address coordinates not found. Please contact support.');
        }
      }

      console.log('[CalculateFee] Final owner coords:', ownerAddress);

      // Get renter's delivery address (use MasterOrder deliveryAddress which was used for original shipping)
      let renterAddress;
      
      if (subOrder.masterOrder?.deliveryAddress?.coordinates?.latitude && 
          subOrder.masterOrder?.deliveryAddress?.coordinates?.longitude) {
        renterAddress = {
          coordinates: subOrder.masterOrder.deliveryAddress.coordinates
        };
        console.log('[CalculateFee] Using MasterOrder delivery address as renter address:', renterAddress.coordinates);
      } else {
        // Fallback: Get from renter's user profile
        const renter = await User.findById(renterId);
        if (!renter) {
          throw new Error('Renter not found');
        }
        renterAddress = renter.addresses?.find(a => a.isDefault) || renter.addresses?.[0];
        console.log('[CalculateFee] Using renter default address from user profile');
      }
      
      // Calculate original distance (owner → renter default address)
      let originalDistance;
      if (renterAddress?.coordinates?.latitude && renterAddress?.coordinates?.longitude) {
        console.log('[CalculateFee] Calculating original distance from owner to renter');
        console.log('[CalculateFee] Owner coords:', ownerAddress);
        console.log('[CalculateFee] Renter coords:', renterAddress.coordinates);
        
        originalDistance = await vietmapService.calculateDistance(
          ownerAddress.longitude,
          ownerAddress.latitude,
          renterAddress.coordinates.longitude,
          renterAddress.coordinates.latitude
        );
        
        console.log('[CalculateFee] Original distance:', originalDistance.distanceKm, 'km');
      } else {
        console.log('[CalculateFee] No renter coordinates, using SubOrder shipping distance:', subOrder.shipping?.distance);
        // Use the shipping distance from the SubOrder as fallback
        originalDistance = { 
          distanceKm: subOrder.shipping?.distance || 0, 
          distanceMeters: (subOrder.shipping?.distance || 0) * 1000 
        };
      }

      // Validate new address has coordinates
      if (!newAddress.coordinates?.latitude || !newAddress.coordinates?.longitude) {
        throw new Error('New address must have valid coordinates');
      }

      // Calculate new distance (owner → new return address)
      console.log('[CalculateFee] Calculating new distance from owner to new address');
      console.log('[CalculateFee] New address coords:', newAddress.coordinates);
      
      const newDistance = await vietmapService.calculateDistance(
        ownerAddress.longitude,
        ownerAddress.latitude,
        newAddress.coordinates.longitude,
        newAddress.coordinates.latitude
      );
      
      console.log('[CalculateFee] New distance:', newDistance.distanceKm, 'km');

      // Calculate additional fee if new distance is farther
      const distanceDiff = newDistance.distanceKm - originalDistance.distanceKm;
      console.log('[CalculateFee] Distance difference:', distanceDiff, 'km');
      
      let additionalFee = 0;

      if (distanceDiff > 0) {
        const feeCalculation = vietmapService.calculateShippingFee(distanceDiff);
        additionalFee = feeCalculation.finalFee;
        console.log('[CalculateFee] Additional fee:', additionalFee, 'VND');
      } else {
        console.log('[CalculateFee] New address is closer or same distance');
      }

      return {
        success: true,
        requiresPayment: additionalFee > 0,
        additionalFee,
        distanceDiff,
        originalDistance: originalDistance.distanceKm,
        newDistance: newDistance.distanceKm,
        message: additionalFee > 0 
          ? `Địa chỉ mới xa hơn ${distanceDiff.toFixed(1)}km. Phí ship thêm: ${additionalFee.toLocaleString()}đ`
          : 'Địa chỉ mới gần hơn hoặc bằng địa chỉ gốc'
      };
    } catch (error) {
      console.error('[CalculateFee] Error:', error);
      throw error;
    }
  }

  /**
   * Update return address and calculate additional shipping fee
   * @param {string} requestId - Early return request ID
   * @param {string} renterId - Renter user ID
   * @param {Object} newAddress - New return address with coordinates
   * @returns {Promise<Object>}
   */
  async updateReturnAddress(requestId, renterId, newAddress) {
    try {
      const vietmapService = require('./vietmap.service');
      const request = await EarlyReturnRequest.findById(requestId)
        .populate({
          path: 'subOrder',
          populate: { path: 'owner', select: 'addresses' }
        });

      if (!request) {
        throw new Error('Early return request not found');
      }

      if (request.renter.toString() !== renterId.toString()) {
        throw new Error('Unauthorized: You can only update your own requests');
      }

      if (request.status !== 'PENDING') {
        throw new Error('Can only update address for pending requests');
      }

      // Get owner's address from subOrder.owner
      const ownerAddresses = request.subOrder.owner.addresses;
      const ownerAddress = ownerAddresses?.find(a => a.isDefault) || ownerAddresses?.[0];

      if (!ownerAddress?.coordinates) {
        throw new Error('Owner address coordinates not found');
      }

      // Validate new address has coordinates
      if (!newAddress.coordinates?.latitude || !newAddress.coordinates?.longitude) {
        throw new Error('New address must have valid coordinates');
      }

      // Calculate original distance (owner → old return address)
      let originalDistance;
      if (request.returnAddress?.coordinates?.latitude && request.returnAddress?.coordinates?.longitude) {
        console.log('[UpdateAddress] Calculating original distance from owner to renter address');
        console.log('[UpdateAddress] Owner coords:', ownerAddress.coordinates);
        console.log('[UpdateAddress] Renter original coords:', request.returnAddress.coordinates);
        
        originalDistance = await vietmapService.calculateDistance(
          ownerAddress.coordinates.longitude,
          ownerAddress.coordinates.latitude,
          request.returnAddress.coordinates.longitude,
          request.returnAddress.coordinates.latitude
        );
        
        console.log('[UpdateAddress] Original distance result:', originalDistance);
      } else {
        console.log('[UpdateAddress] No original coordinates found, using 0 distance');
        // No original coordinates, assume 0 distance
        originalDistance = { distanceKm: 0, distanceMeters: 0 };
      }

      // Calculate new distance (owner → new return address)
      console.log('[UpdateAddress] Calculating new distance from owner to new address');
      console.log('[UpdateAddress] New address coords:', newAddress.coordinates);
      
      const newDistance = await vietmapService.calculateDistance(
        ownerAddress.coordinates.longitude,
        ownerAddress.coordinates.latitude,
        newAddress.coordinates.longitude,
        newAddress.coordinates.latitude
      );
      
      console.log('[UpdateAddress] New distance result:', newDistance);

      // Calculate additional fee if new distance is farther
      const distanceDiff = newDistance.distanceKm - originalDistance.distanceKm;
      console.log('[UpdateAddress] Distance difference:', distanceDiff, 'km');
      
      let additionalFee = 0;

      if (distanceDiff > 0) {
        // Calculate fee for additional distance
        const feeCalculation = vietmapService.calculateShippingFee(distanceDiff);
        additionalFee = feeCalculation.finalFee;
        console.log('[UpdateAddress] Additional fee calculated:', additionalFee, 'VND');
      } else {
        console.log('[UpdateAddress] New address is closer or same distance, no additional fee');
      }

      // Update request with new address and shipping info
      request.returnAddress = {
        streetAddress: newAddress.streetAddress,
        ward: newAddress.ward,
        district: newAddress.district,
        city: newAddress.city,
        province: newAddress.province,
        coordinates: newAddress.coordinates,
        contactName: newAddress.contactName,
        contactPhone: newAddress.contactPhone,
        isOriginalAddress: false
      };

      request.additionalShipping = {
        originalDistance: {
          km: originalDistance.distanceKm,
          meters: originalDistance.distanceMeters || 0
        },
        newDistance: {
          km: newDistance.distanceKm,
          meters: newDistance.distanceMeters
        },
        additionalFee,
        paymentStatus: additionalFee > 0 ? 'pending' : 'none'
      };

      await request.save();

      return {
        success: true,
        request,
        requiresPayment: additionalFee > 0,
        additionalFee,
        distanceDiff,
        originalDistance: originalDistance.distanceKm,
        newDistance: newDistance.distanceKm,
        message: additionalFee > 0 
          ? `Địa chỉ mới xa hơn ${distanceDiff.toFixed(1)}km. Phí ship thêm: ${additionalFee.toLocaleString()}đ`
          : 'Địa chỉ đã cập nhật thành công'
      };
    } catch (error) {
      console.error('Update return address error:', error);
      throw error;
    }
  }

  /**
   * Pay additional shipping fee (Wallet or PayOS)
   * @param {string} requestId - Early return request ID
   * @param {string} renterId - Renter user ID
   * @param {string} paymentMethod - 'wallet' or 'payos'
   * @returns {Promise<Object>}
   */
  async payAdditionalShipping(requestId, renterId, paymentMethod) {
    try {
      const paymentService = require('./payment.service');
      const request = await EarlyReturnRequest.findById(requestId);

      if (!request) {
        throw new Error('Early return request not found');
      }

      if (request.renter.toString() !== renterId.toString()) {
        throw new Error('Unauthorized');
      }

      if (request.additionalShipping?.paymentStatus !== 'pending') {
        throw new Error('No pending payment required');
      }

      const amount = request.additionalShipping.additionalFee;

      if (paymentMethod === 'wallet') {
        // Process wallet payment immediately
        const walletResult = await paymentService.processWalletPaymentForOrder(
          renterId,
          amount,
          {
            orderNumber: request.requestNumber,
            orderType: 'early_return_additional_shipping'
          }
        );

        // Update request
        request.additionalShipping.paymentStatus = 'paid';
        request.additionalShipping.paymentMethod = 'wallet';
        request.additionalShipping.transactionId = walletResult.transactionId;
        request.additionalShipping.paidAt = new Date();
        await request.save();

        return {
          success: true,
          paymentMethod: 'wallet',
          transactionId: walletResult.transactionId,
          balanceAfter: walletResult.balanceAfter,
          message: 'Thanh toán thành công qua ví'
        };
      } else if (paymentMethod === 'payos') {
        // Create PayOS payment session
        const orderCode = Date.now();
        const paymentLink = await paymentService.createPaymentLink({
          orderCode,
          amount,
          description: `PIRA Ship ${Math.round(amount / 1000)}k`,
          returnUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rental-orders/shipping-payment-success?orderCode=${orderCode}&requestId=${requestId}`,
          cancelUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rental-orders/shipping-payment-cancel?orderCode=${orderCode}&requestId=${requestId}`
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
          description: `Phí ship thêm - ${request.requestNumber}`,
          metadata: {
            earlyReturnRequestId: requestId,
            requestNumber: request.requestNumber,
            orderType: 'early_return_additional_shipping'
          },
          expiredAt: new Date(Date.now() + 15 * 60 * 1000)
        });

        await transaction.save();

        // Update request with PayOS order code
        request.additionalShipping.payosOrderCode = orderCode.toString();
        request.additionalShipping.paymentMethod = 'payos';
        await request.save();

        return {
          success: true,
          paymentMethod: 'payos',
          checkoutUrl: paymentLink.checkoutUrl,
          orderCode,
          message: 'Chuyển đến trang thanh toán PayOS'
        };
      } else {
        throw new Error('Invalid payment method');
      }
    } catch (error) {
      console.error('Pay additional shipping error:', error);
      throw error;
    }
  }

  /**
   * Verify additional shipping payment (for PayOS)
   * @param {string} orderCode - PayOS order code
   * @param {string} renterId - Renter user ID
   * @returns {Promise<Object>}
   */
  async verifyAdditionalShippingPayment(orderCode, renterId) {
    try {
      const { PayOS } = require('@payos/node');
      const payos = new PayOS({
        clientId: process.env.PAYOS_CLIENT_ID,
        apiKey: process.env.PAYOS_API_KEY,
        checksumKey: process.env.PAYOS_CHECKSUM_KEY
      });

      // Find request by PayOS order code
      const request = await EarlyReturnRequest.findOne({
        'additionalShipping.payosOrderCode': orderCode.toString(),
        renter: renterId
      });

      if (!request) {
        throw new Error('Early return request not found');
      }

      // Check if already paid
      if (request.additionalShipping.paymentStatus === 'paid') {
        return {
          success: true,
          status: 'paid',
          message: 'Đã thanh toán thành công',
          request
        };
      }

      // Verify with PayOS directly
      try {
        const payosStatus = await payos.paymentRequests.get(Number(orderCode));

        if (payosStatus.status === 'PAID') {
          // Find transaction and update
          const Transaction = require('../models/Transaction');
          const transaction = await Transaction.findOne({
            externalId: orderCode.toString()
          });

          if (transaction) {
            transaction.status = 'success';
            transaction.processedAt = new Date();
            await transaction.save();
          }

          // Update request
          request.additionalShipping.paymentStatus = 'paid';
          request.additionalShipping.transactionId = transaction?._id;
          request.additionalShipping.paidAt = new Date();
          await request.save();

          return {
            success: true,
            status: 'paid',
            message: 'Thanh toán thành công',
            request
          };
        } else {
          return {
            success: true,
            status: 'pending',
            message: 'Đang chờ thanh toán',
            payosStatus: payosStatus.status
          };
        }
      } catch (payosError) {
        console.error('PayOS check failed:', payosError.message);
        return {
          success: true,
          status: 'pending',
          message: 'Đang chờ thanh toán'
        };
      }
    } catch (error) {
      console.error('Verify additional shipping payment error:', error);
      throw error;
    }
  }

  /**
   * Get early return request details
   * @param {string} requestId - Early return request ID
   * @param {string} userId - User ID (renter or owner)
   * @returns {Promise<Object>}
   */
  async getRequestDetails(requestId, userId) {
    try {
      const request = await EarlyReturnRequest.findById(requestId)
        .populate('subOrder')
        .populate('masterOrder')
        .populate('renter', 'name email phone avatar')
        .populate('owner', 'name email phone avatar')
        .populate('returnShipment')
        .populate('ownerReview')
        .lean();

      if (!request) {
        throw new Error('Early return request not found');
      }

      // Verify user has access
      const isRenter = request.renter._id.toString() === userId.toString();
      const isOwner = request.owner._id.toString() === userId.toString();

      if (!isRenter && !isOwner) {
        throw new Error('Unauthorized: You do not have access to this request');
      }

      return {
        success: true,
        request,
        userRole: isOwner ? 'owner' : 'renter'
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new EarlyReturnRequestService();
