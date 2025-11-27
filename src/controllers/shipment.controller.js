const ShipmentService = require('../services/shipment.service');
const RentalOrderService = require('../services/rentalOrder.service');
const User = require('../models/User');
const SubOrder = require('../models/SubOrder');

class ShipmentController {
  async createShipment(req, res) {
    try {
      const payload = req.body || {};
      const ownerId = req.user?._id;

      // Validate subOrder belongs to owner
      if (!payload.subOrder) return res.status(400).json({ status: 'error', message: 'subOrder is required' });
      const subOrder = await SubOrder.findById(payload.subOrder);
      if (!subOrder) return res.status(404).json({ status: 'error', message: 'SubOrder not found' });
      if (String(subOrder.owner) !== String(ownerId)) return res.status(403).json({ status: 'error', message: 'You are not owner of this suborder' });

      // If a shipperId is provided, ensure it exists
      if (payload.shipper) {
        const shipper = await User.findById(payload.shipper);
        if (!shipper || shipper.role !== 'SHIPPER') {
          return res.status(400).json({ status: 'error', message: 'Invalid shipper selected' });
        }
      }

      payload.createdBy = ownerId;
      payload.status = 'PENDING'; // owner sent request to shipper

      const shipment = await ShipmentService.createShipment(payload);
      return res.json({ status: 'success', message: 'Shipment request created', data: shipment });
    } catch (err) {
      console.error('createShipment error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async getShipment(req, res) {
    try {
      const shipment = await ShipmentService.getShipment(req.params.id);
      if (!shipment) return res.status(404).json({ status: 'error', message: 'Not found' });
      return res.json({ status: 'success', data: shipment });
    } catch (err) {
      console.error('getShipment error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async shipperAccept(req, res) {
    try {
      // only shipper can accept
      if (req.user.role !== 'SHIPPER') return res.status(403).json({ status: 'error', message: 'Only shippers can accept shipments' });

      const shipment = await ShipmentService.shipperAccept(req.params.id, req.user._id);
      return res.json({ status: 'success', data: shipment });
    } catch (err) {
      console.error('shipperAccept error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async listMyShipments(req, res) {
    try {
      if (req.user.role !== 'SHIPPER') return res.status(403).json({ status: 'error', message: 'Only shippers can view their shipments' });
      const shipments = await ShipmentService.listByShipper(req.user._id);
      return res.json({ status: 'success', data: shipments });
    } catch (err) {
      console.error('listMyShipments error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  /**
   * List available PENDING shipments grouped by type (DELIVERY vs RETURN)
   * Shipper can see which ones need to be picked up
   */
  async listAvailableShipments(req, res) {
    try {
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can view available shipments' 
        });
      }
      const grouped = await ShipmentService.listAvailableShipments(req.user._id);
      return res.json({ 
        status: 'success',
        data: grouped,
        message: `Available: ${grouped.DELIVERY.length} deliveries, ${grouped.RETURN.length} returns`
      });
    } catch (err) {
      console.error('listAvailableShipments error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  // List shippers by ward or district
  async listShippers(req, res) {
    try {
      const { ward, district, city } = req.query;
      const filter = { role: 'SHIPPER', status: 'ACTIVE' };

      // Use ward if provided (some users may store ward in address.ward)
      if (ward) {
        filter['address.ward'] = ward;
      } else if (district) {
        filter['address.district'] = district;
      } else if (city) {
        filter['address.city'] = city;
      }

      const shippers = await User.find(filter).select('profile firstName lastName profile avatar phone address');
      return res.json({ status: 'success', data: shippers });
    } catch (err) {
      console.error('listShippers error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async pickup(req, res) {
    try {
      const shipment = await ShipmentService.updatePickup(req.params.id, req.body);
      return res.json({ status: 'success', data: shipment });
    } catch (err) {
      console.error('pickup error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async deliver(req, res) {
    try {
      const shipment = await ShipmentService.markDelivered(req.params.id, req.body);
      return res.json({ status: 'success', data: shipment });
    } catch (err) {
      console.error('deliver error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async renterConfirm(req, res) {
    try {
      const result = await ShipmentService.renterConfirmDelivered(req.params.id, req.user._id);
      // result may be { shipment, transferResult } or a shipment (backwards compatibility)
      if (result && result.shipment) {
        return res.json({
          status: 'success',
          data: result.shipment,
          transfer: {
            result: result.transferResult || null,
            error: result.transferError || null
          }
        });
      }

      // fallback - return whatever service returned
      return res.json({ status: 'success', data: result });
    } catch (err) {
      console.error('renterConfirm error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async createDeliveryAndReturnShipments(req, res) {
    try {
      // Only admin or system can trigger shipment creation
      if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SYSTEM') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only admin can create shipments for orders' 
        });
      }

      const { masterOrderId } = req.params;
      if (!masterOrderId) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'masterOrderId is required' 
        });
      }

      const result = await ShipmentService.createDeliveryAndReturnShipments(masterOrderId);

      return res.json({ 
        status: 'success', 
        message: `Created ${result.count} shipments (${result.pairs} pairs)`,
        data: result 
      });
    } catch (err) {
      console.error('createDeliveryAndReturnShipments error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }
}

module.exports = new ShipmentController();
