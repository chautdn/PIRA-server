/**
 * Return Shipment Service
 * Xử lý luồng trả hàng khi rental kết thúc
 */

const Shipment = require('../models/Shipment');
const SubOrder = require('../models/SubOrder');
const User = require('../models/User');
const SystemWalletService = require('./systemWallet.service');

class ReturnShipmentService {
  /**
   * Tạo shipment trả hàng
   * Được gọi khi rental kết thúc (ngày trả hàng)
   */
  async createReturnShipment(subOrderId, returnType = 'NORMAL', notes = '') {
    try {
      console.log(`📦 Creating return shipment for SubOrder ${subOrderId}`);
      console.log(`   Return type: ${returnType}`);

      // Get SubOrder
      const subOrder = await SubOrder.findById(subOrderId)
        .populate('masterOrder')
        .populate('owner')
        .populate('products.product');

      if (!subOrder) {
        throw new Error('SubOrder not found');
      }

      // Get renter từ MasterOrder
      const masterOrder = subOrder.masterOrder;
      const renter = await User.findById(masterOrder.renter);

      if (!renter) {
        throw new Error('Renter not found');
      }

      // Create return shipment for each product
      const returnShipments = [];
      const shipmentGroupId = `RET${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      for (let i = 0; i < subOrder.products.length; i++) {
        const product = subOrder.products[i];

        const shipmentId = `SHP${Date.now()}${i}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
        
        const returnShipment = new Shipment({
          shipmentId,
          subOrder: subOrderId,
          productId: product.product._id,
          productIndex: i,
          type: 'RETURN',
          returnType,
          // Renter location → Owner location
          fromAddress: renter.address, // Renter's address
          toAddress: subOrder.owner.address, // Owner's address
          contactInfo: {
            name: renter.profile?.firstName || 'Customer',
            phone: renter.phone,
            notes
          },
          status: 'PENDING',
          tracking: {
            photos: []
          }
        });

        await returnShipment.save();
        returnShipments.push(returnShipment);
        console.log(`✅ Created return shipment: ${shipmentId}`);
      }

      // Update SubOrder status
      subOrder.status = 'RETURN_PENDING';
      await subOrder.save();

      return {
        success: true,
        subOrderId,
        shipmentGroupId,
        returnShipments,
        message: `Created ${returnShipments.length} return shipments`
      };
    } catch (error) {
      console.error('❌ Error creating return shipment:', error.message);
      throw error;
    }
  }

  /**
   * Shipper nhận trả hàng
   * Bước 1: Shipper confirm họ sẽ nhận hàng
   */
  async shipperConfirmReturn(shipmentId, shipperId) {
    try {
      console.log(`🚚 Shipper confirming return: ${shipmentId}`);

      const shipment = await Shipment.findById(shipmentId);
      if (!shipment) {
        throw new Error('Shipment not found');
      }

      if (shipment.type !== 'RETURN') {
        throw new Error('This is not a return shipment');
      }

      if (shipment.status !== 'PENDING') {
        throw new Error(`Cannot confirm: shipment status is ${shipment.status}`);
      }

      shipment.shipper = shipperId;
      shipment.status = 'SHIPPER_CONFIRMED';
      await shipment.save();

      console.log(`✅ Shipper confirmed return shipment`);
      return shipment;
    } catch (error) {
      console.error('❌ Error confirming return:', error.message);
      throw error;
    }
  }

  /**
   * Shipper cập nhật: Đã nhận hàng từ renter
   * Bước 2: Shipper chụp ảnh, upload, xác nhận trạng thái
   */
  async shipperPickupReturn(shipmentId, pickupData) {
    try {
      console.log(`📸 Shipper picking up return: ${shipmentId}`);
      console.log(`   Photos: ${pickupData.photos?.length || 0}`);

      const shipment = await Shipment.findById(shipmentId).populate('subOrder');
      if (!shipment) {
        throw new Error('Shipment not found');
      }

      if (shipment.status !== 'SHIPPER_CONFIRMED') {
        throw new Error(`Cannot pickup: shipment status is ${shipment.status}`);
      }

      // Update tracking
      shipment.status = 'IN_TRANSIT';
      shipment.tracking.pickedUpAt = new Date();
      shipment.tracking.photos = (shipment.tracking.photos || []).concat(pickupData.photos || []);
      
      // Optional: Add condition/notes
      if (pickupData.condition) {
        shipment.tracking.returnCondition = pickupData.condition; // e.g., "GOOD", "DAMAGED"
      }
      if (pickupData.notes) {
        shipment.tracking.notes = pickupData.notes;
      }

      await shipment.save();

      console.log(`✅ Return shipment in transit`);
      return shipment;
    } catch (error) {
      console.error('❌ Error picking up return:', error.message);
      throw error;
    }
  }

  /**
   * Shipper xác nhận: Đã giao lại cho owner
   * Bước 3: Shipper giao hàng về cho owner, xác nhận và tính deposit refund
   */
  async shipperCompleteReturn(shipmentId, completeData) {
    try {
      console.log(`🏁 Shipper completing return: ${shipmentId}`);

      const shipment = await Shipment.findById(shipmentId)
        .populate('subOrder')
        .populate({
          path: 'subOrder',
          populate: [
            { path: 'owner' },
            { path: 'masterOrder', populate: { path: 'renter' } }
          ]
        });

      if (!shipment) {
        throw new Error('Shipment not found');
      }

      if (shipment.status !== 'IN_TRANSIT') {
        throw new Error(`Cannot complete: shipment status is ${shipment.status}`);
      }

      // Update tracking
      shipment.status = 'DELIVERED';
      shipment.tracking.deliveredAt = new Date();
      shipment.tracking.photos = (shipment.tracking.photos || []).concat(completeData.photos || []);
      
      if (completeData.condition) {
        shipment.tracking.returnConditionAtOwner = completeData.condition; // Condition khi giao cho owner
      }
      if (completeData.notes) {
        shipment.tracking.completionNotes = completeData.notes;
      }

      await shipment.save();

      // Update SubOrder status
      const subOrder = shipment.subOrder;
      const allShipmentsCompleted = await Shipment.countDocuments({
        subOrder: subOrder._id,
        type: 'RETURN',
        status: { $ne: 'DELIVERED' }
      });

      if (allShipmentsCompleted === 0) {
        subOrder.status = 'RETURN_COMPLETED';
        await subOrder.save();

        // 🔑 Refund deposit to renter
        console.log(`💰 Processing deposit refund for renter`);
        const depositAmount = subOrder.pricing?.subtotalDeposit || 0;
        
        if (depositAmount > 0) {
          try {
            const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
            const renterId = subOrder.masterOrder.renter._id;

            console.log(`   Deposit refund: ${depositAmount} VND → renter ${renterId}`);
            
            const refundResult = await SystemWalletService.transferToUser(
              adminId,
              renterId,
              depositAmount,
              `Deposit refund for return shipment ${shipment.shipmentId}`
            );

            console.log(`✅ Deposit refunded: ${depositAmount} VND`);
            subOrder.depositRefunded = true;
            subOrder.depositRefundedAt = new Date();
            await subOrder.save();
          } catch (err) {
            console.error(`❌ Failed to refund deposit:`, err.message);
            // Don't throw - refund can be retried later
          }
        }
      }

      console.log(`✅ Return shipment completed`);
      return shipment;
    } catch (error) {
      console.error('❌ Error completing return:', error.message);
      throw error;
    }
  }

  /**
   * List return shipments for shipper
   */
  async listReturnShipmentsForShipper(shipperId, status = null) {
    try {
      const filter = {
        type: 'RETURN',
        $or: [
          { shipper: shipperId },
          { shipper: null, status: 'PENDING' } // Available for shipper to accept
        ]
      };

      if (status) {
        filter.status = status;
      }

      const shipments = await Shipment.find(filter)
        .populate('subOrder')
        .populate('owner', 'profile email phone')
        .sort({ createdAt: -1 });

      return shipments;
    } catch (error) {
      console.error('❌ Error listing return shipments:', error.message);
      throw error;
    }
  }

  /**
   * Get return shipment detail
   */
  async getReturnShipmentDetail(shipmentId) {
    try {
      const shipment = await Shipment.findById(shipmentId)
        .populate('subOrder')
        .populate('shipper', 'profile email phone')
        .populate({
          path: 'subOrder',
          populate: [
            { path: 'owner', select: 'profile email phone address' },
            { path: 'masterOrder', populate: { path: 'renter', select: 'profile email phone address' } }
          ]
        });

      if (!shipment) {
        throw new Error('Shipment not found');
      }

      return shipment;
    } catch (error) {
      console.error('❌ Error getting return shipment detail:', error.message);
      throw error;
    }
  }
}

module.exports = new ReturnShipmentService();
