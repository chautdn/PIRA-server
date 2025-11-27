/**
 * Return Shipment Controller
 * Xử lý HTTP requests cho luồng trả hàng
 */

const ReturnShipmentService = require('../services/returnShipment.service');
const User = require('../models/User');

class ReturnShipmentController {
  /**
   * Tạo return shipment (được gọi khi rental kết thúc)
   * POST /return-shipments/initiate/:subOrderId
   */
  async initiateReturn(req, res) {
    try {
      const { subOrderId } = req.params;
      const { returnType = 'NORMAL', notes = '' } = req.body;
      const userId = req.user?._id;

      console.log(`📦 [Return] Initiating return for SubOrder: ${subOrderId}`);

      // Verify user has permission (admin or owner)
      if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only admin or owner can initiate returns' 
        });
      }

      const result = await ReturnShipmentService.createReturnShipment(
        subOrderId,
        returnType,
        notes
      );

      return res.json({
        status: 'success',
        message: 'Return shipment initiated',
        data: result
      });
    } catch (err) {
      console.error('❌ initiateReturn error:', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  /**
   * Shipper nhận return task
   * POST /return-shipments/:shipmentId/confirm
   */
  async shipperConfirmReturn(req, res) {
    try {
      const { shipmentId } = req.params;
      const shipperId = req.user?._id;

      // Verify shipper role
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can confirm returns' 
        });
      }

      console.log(`🚚 [Return] Shipper confirming: ${shipmentId}`);

      const shipment = await ReturnShipmentService.shipperConfirmReturn(
        shipmentId,
        shipperId
      );

      return res.json({
        status: 'success',
        message: 'Return shipment confirmed',
        data: shipment
      });
    } catch (err) {
      console.error('❌ shipperConfirmReturn error:', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  /**
   * Shipper cập nhật: Đã nhận hàng từ renter (chụp ảnh, upload)
   * POST /return-shipments/:shipmentId/pickup
   * Body: { photos: [...], condition: "GOOD|DAMAGED", notes: "..." }
   */
  async shipperPickupReturn(req, res) {
    try {
      const { shipmentId } = req.params;
      const pickupData = req.body;

      // Verify shipper role
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can pickup returns' 
        });
      }

      console.log(`📸 [Return] Shipper picking up: ${shipmentId}`);

      const shipment = await ReturnShipmentService.shipperPickupReturn(
        shipmentId,
        pickupData
      );

      return res.json({
        status: 'success',
        message: 'Return shipment picked up and in transit',
        data: shipment
      });
    } catch (err) {
      console.error('❌ shipperPickupReturn error:', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  /**
   * Shipper xác nhận: Đã giao lại cho owner (chụp ảnh, xác nhận trạng thái)
   * POST /return-shipments/:shipmentId/complete
   * Body: { photos: [...], condition: "GOOD|DAMAGED", notes: "..." }
   */
  async shipperCompleteReturn(req, res) {
    try {
      const { shipmentId } = req.params;
      const completeData = req.body;

      // Verify shipper role
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can complete returns' 
        });
      }

      console.log(`🏁 [Return] Shipper completing: ${shipmentId}`);

      const shipment = await ReturnShipmentService.shipperCompleteReturn(
        shipmentId,
        completeData
      );

      return res.json({
        status: 'success',
        message: 'Return shipment completed and deposit refunded',
        data: shipment
      });
    } catch (err) {
      console.error('❌ shipperCompleteReturn error:', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  /**
   * Shipper xem danh sách return tasks
   * GET /return-shipments?status=PENDING|SHIPPER_CONFIRMED|IN_TRANSIT
   */
  async listReturnShipments(req, res) {
    try {
      const shipperId = req.user?._id;
      const { status } = req.query;

      // Verify shipper role
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can view return shipments' 
        });
      }

      console.log(`📦 [Return] Listing shipments for shipper: ${shipperId}`);

      const shipments = await ReturnShipmentService.listReturnShipmentsForShipper(
        shipperId,
        status
      );

      return res.json({
        status: 'success',
        count: shipments.length,
        data: shipments
      });
    } catch (err) {
      console.error('❌ listReturnShipments error:', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  /**
   * Chi tiết return shipment
   * GET /return-shipments/:shipmentId
   */
  async getReturnShipmentDetail(req, res) {
    try {
      const { shipmentId } = req.params;

      console.log(`📦 [Return] Getting detail: ${shipmentId}`);

      const shipment = await ReturnShipmentService.getReturnShipmentDetail(shipmentId);

      return res.json({
        status: 'success',
        data: shipment
      });
    } catch (err) {
      console.error('❌ getReturnShipmentDetail error:', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }
}

module.exports = new ReturnShipmentController();
