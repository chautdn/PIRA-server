const Shipment = require('../models/Shipment');
const SubOrder = require('../models/SubOrder');
const RentalOrderService = require('../services/rentalOrder.service');
const { SuccessResponse } = require('../core/success');
const { BadRequest, NotFoundError, ForbiddenError } = require('../core/error');

class ShipmentController {
  /**
   * Cập nhật trạng thái shipment
   * PUT /api/shipments/:shipmentId/status
   */
  async updateShipmentStatus(req, res) {
    try {
      const { shipmentId } = req.params;
      const { status, notes, photos, signature, condition } = req.body;

      console.log(`📦 [Shipment] Updating shipment ${shipmentId} status to ${status}`);

      // Validate status
      const validStatuses = ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        throw new BadRequest(`Invalid status: ${status}`);
      }

      // Find shipment
      const shipment = await Shipment.findById(shipmentId).populate('subOrder');
      if (!shipment) {
        throw new NotFoundError('Shipment not found');
      }

      console.log(`📦 [Shipment] Current status: ${shipment.status}, New status: ${status}`);

      // Update shipment status
      shipment.status = status;

      // If status is DELIVERED, mark delivery tracking
      if (status === 'DELIVERED') {
        shipment.tracking.deliveredAt = new Date();
        if (notes) {
          shipment.tracking.notes = notes;
        }
        if (photos && Array.isArray(photos)) {
          shipment.tracking.photos = photos;
        }
        if (signature) {
          shipment.tracking.signature = signature;
        }

        // Add quality check if provided
        if (condition) {
          shipment.qualityCheck = {
            condition: condition,
            notes: notes || '',
            checkedAt: new Date()
          };
        }

        console.log(`✅ [Shipment] Delivery confirmed at ${shipment.tracking.deliveredAt}`);
      }

      // If status is IN_TRANSIT, mark pickup tracking
      if (status === 'IN_TRANSIT') {
        shipment.tracking.pickedUpAt = new Date();
        console.log(`🚚 [Shipment] Shipment picked up at ${shipment.tracking.pickedUpAt}`);
      }

      // Save shipment status update
      await shipment.save();
      console.log(`✅ [Shipment] Shipment status updated successfully`);

      // If shipment is DELIVERED and linked to SubOrder, trigger rental transfer
      if (status === 'DELIVERED' && shipment.subOrder) {
        console.log(`\n🔄 [Shipment → Rental Transfer] Shipment DELIVERED, triggering rental transfer...`);
        
        try {
          const rentalOrderService = new RentalOrderService();
          
          // Check if rental transfer already done
          if (shipment.rentalTransferred) {
            console.log(`⚠️  [Shipment] Rental transfer already completed for this shipment`);
          } else {
            // Set subOrder status to ACTIVE if not already
            const subOrder = await SubOrder.findById(shipment.subOrder._id);
            if (subOrder && subOrder.status !== 'ACTIVE') {
              console.log(`[Shipment] Setting SubOrder status to ACTIVE before transfer`);
              subOrder.status = 'ACTIVE';
              await subOrder.save();
            }

            // Trigger transfer
            const transferResult = await rentalOrderService.transferRentalToOwner(shipment.subOrder._id);
            
            if (transferResult.success) {
              // Mark rental transfer as completed
              shipment.rentalTransferred = true;
              shipment.rentalTransferredAt = new Date();
              await shipment.save();
              console.log(`✅ [Shipment] Rental transfer completed and recorded`);
            } else {
              console.log(`⚠️  [Shipment] Rental transfer was not successful: ${transferResult.message}`);
            }
          }
        } catch (error) {
          console.error(`❌ [Shipment] Error triggering rental transfer: ${error.message}`);
          // Don't fail the shipment update, just log the error
          // The shipment status was already updated
        }
      }

      return res.json(
        new SuccessResponse(
          {
            shipment: shipment,
            message: 'Shipment status updated successfully'
          },
          'Cập nhật trạng thái vận chuyển thành công'
        )
      );
    } catch (error) {
      console.error('❌ Error updating shipment status:', error.message);
      throw error;
    }
  }

  /**
   * Lấy chi tiết shipment
   * GET /api/shipments/:shipmentId
   */
  async getShipmentDetail(req, res) {
    try {
      const { shipmentId } = req.params;

      const shipment = await Shipment.findById(shipmentId)
        .populate([
          { path: 'order', select: 'orderNumber status' },
          { path: 'subOrder', select: 'subOrderNumber status pricing owner' },
          { path: 'shipper', select: 'firstName lastName email phone' }
        ]);

      if (!shipment) {
        throw new NotFoundError('Shipment not found');
      }

      return res.json(
        new SuccessResponse(shipment, 'Lấy chi tiết vận chuyển thành công')
      );
    } catch (error) {
      console.error('❌ Error getting shipment detail:', error.message);
      throw error;
    }
  }

  /**
   * Danh sách shipment (cho shipper hoặc admin)
   * GET /api/shipments
   */
  async getShipments(req, res) {
    try {
      const { page = 1, limit = 10, status, subOrderId } = req.query;
      const userId = req.user.id;

      const query = {};

      // If user is shipper, filter by shipper
      if (req.user.role === 'USER') {
        query.shipper = userId;
      }

      if (status) {
        query.status = status;
      }

      if (subOrderId) {
        query.subOrder = subOrderId;
      }

      const skip = (page - 1) * limit;
      const shipments = await Shipment.find(query)
        .populate([
          { path: 'order', select: 'orderNumber' },
          { path: 'subOrder', select: 'subOrderNumber' },
          { path: 'shipper', select: 'firstName lastName' }
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Shipment.countDocuments(query);

      return res.json(
        new SuccessResponse(
          {
            shipments,
            pagination: {
              total,
              page: parseInt(page),
              limit: parseInt(limit),
              pages: Math.ceil(total / limit)
            }
          },
          'Lấy danh sách vận chuyển thành công'
        )
      );
    } catch (error) {
      console.error('❌ Error getting shipments:', error.message);
      throw error;
    }
  }

  /**
   * Tạo shipment (nội bộ, thường được gọi từ rental order service)
   * POST /api/shipments
   */
  async createShipment(req, res) {
    try {
      const {
        subOrderId,
        type,
        fromAddress,
        toAddress,
        contactInfo,
        scheduledAt,
        estimatedDuration,
        fee
      } = req.body;

      console.log(`📦 [Shipment] Creating shipment for SubOrder ${subOrderId}`);

      // Validate required fields
      if (!subOrderId || !type) {
        throw new BadRequest('Missing required fields: subOrderId, type');
      }

      if (!['PICKUP', 'DELIVERY', 'RETURN'].includes(type)) {
        throw new BadRequest('Invalid shipment type');
      }

      // Check SubOrder exists
      const subOrder = await SubOrder.findById(subOrderId);
      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      // Generate unique shipment ID
      const shipmentId = `SHIP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      const shipment = new Shipment({
        shipmentId,
        subOrder: subOrderId,
        type,
        fromAddress,
        toAddress,
        contactInfo,
        scheduledAt,
        estimatedDuration,
        fee: fee || 0,
        status: 'PENDING'
      });

      await shipment.save();
      console.log(`✅ [Shipment] Shipment created: ${shipmentId}`);

      return res.json(
        new SuccessResponse(shipment, 'Tạo vận chuyển thành công')
      );
    } catch (error) {
      console.error('❌ Error creating shipment:', error.message);
      throw error;
    }
  }

  /**
   * Gán shipper cho shipment
   * PUT /api/shipments/:shipmentId/assign-shipper
   */
  async assignShipper(req, res) {
    try {
      const { shipmentId } = req.params;
      const { shipperId } = req.body;

      if (!shipperId) {
        throw new BadRequest('Shipper ID is required');
      }

      const shipment = await Shipment.findById(shipmentId);
      if (!shipment) {
        throw new NotFoundError('Shipment not found');
      }

      shipment.shipper = shipperId;
      shipment.status = 'ASSIGNED';
      await shipment.save();

      console.log(`✅ [Shipment] Assigned shipper ${shipperId} to shipment ${shipmentId}`);

      return res.json(
        new SuccessResponse(shipment, 'Gán shipper thành công')
      );
    } catch (error) {
      console.error('❌ Error assigning shipper:', error.message);
      throw error;
    }
  }
}

module.exports = new ShipmentController();
