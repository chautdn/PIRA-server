const mongoose = require('mongoose');
const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Extension = require('../models/Extension');
const User = require('../models/User');
const { NotFoundError, BadRequest, ForbiddenError } = require('../core/error');
const SystemWalletService = require('../services/systemWallet.service');
const { sendNotification } = require('../services/notification.service');

class ExtensionController {
  /**
   * Renter requests extension
   */
  static async requestExtension(req, res) {
    try {
      const { subOrderId, extendDays, extensionFee, notes } = req.body;
      const renterId = req.user.id;

      // Validate input
      if (!subOrderId || !extendDays || extensionFee === undefined) {
        throw new BadRequest('Missing required fields: subOrderId, extendDays, extensionFee');
      }

      if (extendDays < 1 || extendDays > 365) {
        throw new BadRequest('Extend days must be between 1 and 365');
      }

      // Get suborder with master order info
      const subOrder = await SubOrder.findById(subOrderId).populate('masterOrder owner');
      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      console.log('📋 SubOrder data:', {
        subOrderId,
        productCount: subOrder.products?.length,
        productStatuses: subOrder.products?.map(p => p.productStatus),
        rentalPeriods: subOrder.products?.map(p => ({
          startDate: p.rentalPeriod?.startDate,
          endDate: p.rentalPeriod?.endDate
        }))
      });

      // Verify the renter owns this masterOrder
      const masterOrder = await MasterOrder.findById(subOrder.masterOrder._id);
      if (!masterOrder || masterOrder.renter.toString() !== renterId) {
        throw new ForbiddenError('You do not have permission to extend this order');
      }

      // Check if order has products with valid rental periods
      // Accept CONFIRMED, ACTIVE, DELIVERED, or COMPLETED status as they can be extended
      const validProducts = subOrder.products.filter(p => 
        (p.productStatus === 'CONFIRMED' || p.productStatus === 'ACTIVE' || p.productStatus === 'DELIVERED' || p.productStatus === 'COMPLETED') &&
        p.rentalPeriod?.endDate
      );

      if (validProducts.length === 0) {
        console.error('❌ No valid products for extension:', {
          products: subOrder.products.map(p => ({
            status: p.productStatus,
            hasRentalPeriod: !!p.rentalPeriod,
            endDate: p.rentalPeriod?.endDate
          }))
        });
        throw new BadRequest('No valid products in this order to extend. Order must still be in rental period.');
      }

      // Get current end date from first valid product
      const currentEndDate = validProducts[0]?.rentalPeriod?.endDate;
      if (!currentEndDate) {
        throw new BadRequest('Cannot determine current rental end date');
      }

      // Calculate new end date
      const newEndDate = new Date(
        new Date(currentEndDate).getTime() + extendDays * 24 * 60 * 60 * 1000
      );

      // Create extension request
      const extension = new Extension({
        masterOrder: subOrder.masterOrder._id,
        subOrder: subOrderId,
        renter: renterId,
        owner: subOrder.owner._id,
        extendDays,
        extensionFee,
        notes,
        currentEndDate,
        newEndDate,
        status: 'PENDING'
      });

      await extension.save();

      // Populate for response
      await extension.populate('masterOrder renter owner');

      // Send notification to owner
      try {
        await sendNotification(
          subOrder.owner._id,
          'Yêu cầu gia hạn thuê mới',
          `${masterOrder.renter.profile?.firstName || 'Người thuê'} yêu cầu gia hạn ${extendDays} ngày`,
          {
            type: 'EXTENSION_REQUEST',
            category: 'INFO',
            relatedExtension: extension._id,
            data: {
              extensionId: extension._id.toString(),
              subOrderId,
              extendDays,
              extensionFee
            }
          }
        );
      } catch (notifError) {
        console.error('Notification error:', notifError);
        // Continue even if notification fails
      }

      console.log('✅ Extension request created:', {
        extensionId: extension._id,
        subOrderId,
        extendDays,
        extensionFee,
        renter: renterId,
        owner: subOrder.owner._id,
        currentEndDate,
        newEndDate
      });

      res.json({
        success: true,
        data: extension,
        message: 'Extension request created successfully'
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get extension requests for renter
   */
  static async getRenterExtensionRequests(req, res) {
    try {
      const renterId = req.user.id;
      const { status = 'PENDING', page = 1, limit = 10 } = req.query;

      const skip = (page - 1) * limit;

      const query = { renter: renterId };
      if (status) {
        query.status = status;
      }

      const extensions = await Extension.find(query)
        .populate('masterOrder', 'masterOrderNumber renter')
        .populate('owner', 'firstName lastName email phone')
        .populate('subOrder')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Extension.countDocuments(query);

      res.json({
        success: true,
        data: extensions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get extension requests for owner
   */
  static async getOwnerExtensionRequests(req, res) {
    try {
      const ownerId = req.user.id;
      const { status = 'PENDING', page = 1, limit = 10 } = req.query;

      const skip = (page - 1) * limit;

      const query = { owner: ownerId };
      if (status) {
        query.status = status;
      }

      const extensions = await Extension.find(query)
        .populate('masterOrder', 'masterOrderNumber status totalAmount totalDepositAmount')
        .populate('renter', 'email phone profile')
        .populate('subOrder')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Extension.countDocuments(query);

      console.log('📋 Owner extension requests:', {
        ownerId,
        status,
        found: extensions.length,
        renterSample: extensions[0]?.renter
      });

      res.json({
        success: true,
        data: extensions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get extension request detail
   */
  static async getExtensionRequestDetail(req, res) {
    try {
      const { requestId } = req.params;

      const extension = await Extension.findById(requestId)
        .populate('masterOrder', 'masterOrderNumber status totalAmount totalDepositAmount')
        .populate('subOrder')
        .populate('renter', 'email phone profile')
        .populate('owner', 'firstName lastName email phone profile');

      if (!extension) {
        throw new NotFoundError('Extension request not found');
      }

      // Check authorization
      const userId = req.user.id;
      if (
        extension.renter._id.toString() !== userId &&
        extension.owner._id.toString() !== userId
      ) {
        throw new ForbiddenError('You do not have permission to view this request');
      }

      res.json({
        success: true,
        data: extension
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Approve extension request
   */
  static async approveExtension(req, res) {
    try {
      const { requestId } = req.params;
      const ownerId = req.user.id;

      const extension = await Extension.findById(requestId).populate('masterOrder renter owner');
      if (!extension) {
        throw new NotFoundError('Extension request not found');
      }

      // Verify owner
      if (extension.owner._id.toString() !== ownerId) {
        throw new ForbiddenError('Only the owner can approve this extension');
      }

      // Check if already processed
      if (extension.status !== 'PENDING') {
        throw new BadRequest(`Extension request is already ${extension.status}`);
      }

      // Get suborder and masterorder for updating
      const subOrder = await SubOrder.findById(extension.subOrder);
      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      const masterOrder = await MasterOrder.findById(extension.masterOrder._id);
      if (!masterOrder) {
        throw new NotFoundError('MasterOrder not found');
      }

      // Deduct from renter wallet
      try {
        await SystemWalletService.transferFromUser(
          ownerId,
          extension.renter._id,
          extension.extensionFee,
          `Extension fee for rental order ${masterOrder.masterOrderNumber}`
        );
        console.log('✅ Wallet deducted:', {
          renter: extension.renter._id,
          amount: extension.extensionFee
        });
      } catch (walletError) {
        console.error('Wallet deduction error:', walletError);
        throw new BadRequest('Failed to deduct extension fee from renter wallet: ' + walletError.message);
      }

      // Update product rental periods in suborder
      const extendDays = extension.extendDays;
      let updatedCount = 0;
      subOrder.products.forEach(product => {
        // Update all products that have rental periods (regardless of status)
        if (product.rentalPeriod && product.rentalPeriod.endDate) {
          const oldEndDate = new Date(product.rentalPeriod.endDate);
          const newEndDate = new Date(oldEndDate.getTime() + extendDays * 24 * 60 * 60 * 1000);
          product.rentalPeriod.endDate = newEndDate;
          updatedCount++;
          console.log('📅 Updated product period:', {
            productId: product.product,
            oldDate: oldEndDate,
            newDate: newEndDate,
            status: product.productStatus
          });
        }
      });

      await subOrder.save();

      // Update extension request status
      extension.status = 'APPROVED';
      extension.approvedAt = new Date();
      extension.approvedBy = ownerId;
      await extension.save();

      console.log('✅ Extension approved:', {
        extensionId: extension._id,
        productsUpdated: updatedCount,
        newEndDate: extension.newEndDate
      });

      // Send notification to renter
      try {
        await sendNotification(
          extension.renter._id,
          '✅ Yêu cầu gia hạn được phê duyệt',
          `${extension.owner.profile?.firstName || 'Chủ hàng'} đã phê duyệt yêu cầu gia hạn của bạn`,
          {
            type: 'EXTENSION_APPROVED',
            category: 'SUCCESS',
            relatedExtension: extension._id,
            data: {
              extensionId: extension._id.toString(),
              newEndDate: extension.newEndDate.toISOString()
            }
          }
        );
      } catch (notifError) {
        console.error('Notification error:', notifError);
      }

      res.json({
        success: true,
        data: extension,
        message: 'Extension request approved successfully'
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Reject extension request
   */
  static async rejectExtension(req, res) {
    try {
      const { requestId } = req.params;
      const { rejectionReason } = req.body;
      const ownerId = req.user.id;

      if (!rejectionReason || !rejectionReason.trim()) {
        throw new BadRequest('Rejection reason is required');
      }

      const extension = await Extension.findById(requestId).populate('masterOrder renter owner');
      if (!extension) {
        throw new NotFoundError('Extension request not found');
      }

      // Verify owner
      if (extension.owner._id.toString() !== ownerId) {
        throw new ForbiddenError('Only the owner can reject this extension');
      }

      // Check if already processed
      if (extension.status !== 'PENDING') {
        throw new BadRequest(`Extension request is already ${extension.status}`);
      }

      // Update extension request status
      extension.status = 'REJECTED';
      extension.rejectionReason = rejectionReason;
      extension.rejectedAt = new Date();
      extension.rejectedBy = ownerId;
      await extension.save();

      console.log('❌ Extension rejected:', {
        extensionId: extension._id,
        rejectionReason: rejectionReason,
        renter: extension.renter._id
      });

      // Send notification to renter with rejection reason
      try {
        // Create a detailed notification message with rejection reason
        const ownerName = extension.owner.profile?.firstName || extension.owner.firstName || 'Chủ hàng';
        const notificationTitle = '❌ Yêu cầu gia hạn bị từ chối';
        const notificationBody = `${ownerName} từ chối yêu cầu gia hạn của bạn.\n\nLý do: ${rejectionReason}`;
        
        await sendNotification(
          extension.renter._id,
          notificationTitle,
          notificationBody,
          { 
            type: 'EXTENSION_REJECTED', 
            category: 'ERROR',
            relatedExtension: extension._id,
            data: {
              extensionId: extension._id.toString(),
              rejectionReason: rejectionReason,
              ownerName: ownerName
            }
          }
        );
        console.log('✅ Rejection notification sent to renter');
      } catch (notifError) {
        console.error('Notification error:', notifError);
        // Continue even if notification fails
      }

      res.json({
        success: true,
        data: extension,
        message: 'Extension request rejected successfully'
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cancel extension request (by renter)
   */
  static async cancelExtension(req, res) {
    try {
      const { requestId } = req.params;
      const renterId = req.user.id;

      const extension = await Extension.findById(requestId).populate('masterOrder renter owner');
      if (!extension) {
        throw new NotFoundError('Extension request not found');
      }

      // Verify renter
      if (extension.renter._id.toString() !== renterId) {
        throw new ForbiddenError('Only the renter can cancel this extension');
      }

      // Check if can be cancelled (only PENDING requests)
      if (extension.status !== 'PENDING') {
        throw new BadRequest(`Cannot cancel ${extension.status} extension request`);
      }

      // Update extension request status
      extension.status = 'CANCELLED';
      extension.cancelledAt = new Date();
      extension.cancelledBy = renterId;
      await extension.save();

      res.json({
        success: true,
        data: extension,
        message: 'Extension request cancelled successfully'
      });
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ExtensionController;
