const Shipment = require('../models/Shipment');
const SubOrder = require('../models/SubOrder');
const User = require('../models/User');
const SystemWalletService = require('./systemWallet.service');
const RentalOrderService = require('./rentalOrder.service');

class ShipmentService {
  async createShipment(payload) {
    const shipmentId = `SHP${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const shipment = new Shipment({ shipmentId, ...payload });
    await shipment.save();
    return shipment;
  }

  async getShipment(id) {
    return Shipment.findById(id).populate('shipper subOrder');
  }

  async listByShipper(shipperId) {
    return Shipment.find({ shipper: shipperId }).populate('subOrder');
  }

  async shipperAccept(shipmentId, shipperId) {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) throw new Error('Shipment not found');

    // Ensure shipperId matches assigned shipper (owner selected)
    if (shipment.shipper && String(shipment.shipper) !== String(shipperId)) {
      throw new Error('You are not assigned to this shipment');
    }

    shipment.shipper = shipperId;
    shipment.status = 'SHIPPER_CONFIRMED';
    shipment.tracking.pickedUpAt = shipment.tracking.pickedUpAt || null;
    await shipment.save();
    return shipment;
  }

  async updatePickup(shipmentId, data) {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) throw new Error('Shipment not found');
    shipment.status = 'IN_TRANSIT';
    shipment.tracking.pickedUpAt = new Date();
    shipment.tracking.photos = (shipment.tracking.photos || []).concat(data.photos || []);
    await shipment.save();
    return shipment;
  }

  async markDelivered(shipmentId, data) {
    const shipment = await Shipment.findById(shipmentId).populate('subOrder');
    if (!shipment) throw new Error('Shipment not found');
    shipment.status = 'DELIVERED';
    shipment.tracking.deliveredAt = new Date();
    shipment.tracking.photos = (shipment.tracking.photos || []).concat(data.photos || []);
    await shipment.save();

    // Optionally mark subOrder status or notify renter
    try {
      if (shipment.subOrder) {
        shipment.subOrder.status = 'DELIVERED';
        await shipment.subOrder.save();
      }
    } catch (err) {
      console.warn('Failed to mark subOrder delivered:', err.message);
    }

    return shipment;
  }

  async renterConfirmDelivered(shipmentId, renterId) {
    const shipment = await Shipment.findById(shipmentId).populate('subOrder');
    if (!shipment) throw new Error('Shipment not found');
    shipment.status = 'DELIVERED';
    // mark renter confirmation on subOrder if available
    if (shipment.subOrder) {
      // DELIVERED is the renter confirmation status
      shipment.subOrder.status = 'DELIVERED';
      await shipment.subOrder.save();

      // Transfer payment to owner via system wallet
      try {
        const ownerId = shipment.subOrder.owner;
        const amount = shipment.subOrder.pricing?.totalAmount || 0;
        if (amount > 0) {
          await SystemWalletService.transferToUser(process.env.SYSTEM_ADMIN_ID || null, ownerId, amount, `Auto transfer for shipment ${shipment.shipmentId}`);
        }
      } catch (err) {
        console.error('Failed to transfer payment to owner:', err.message);
      }
    }
    await shipment.save();
    return shipment;
  }

  // Auto confirm delivered for shipments delivered > thresholdHours ago
  async autoConfirmDelivered(thresholdHours = 24) {
    const cutoff = new Date(Date.now() - thresholdHours * 3600 * 1000);
    const shipments = await Shipment.find({ status: 'DELIVERED', 'tracking.deliveredAt': { $lte: cutoff } }).populate('subOrder');
    for (const s of shipments) {
      try {
        if (s.subOrder) {
          // Auto-confirm as DELIVERED (renter confirmation auto after threshold)
          s.subOrder.status = 'DELIVERED';
          await s.subOrder.save();

          const ownerId = s.subOrder.owner;
          const amount = s.subOrder.pricing?.totalAmount || 0;
          if (amount > 0) {
            await SystemWalletService.transferToUser(process.env.SYSTEM_ADMIN_ID || null, ownerId, amount, `Auto transfer for shipment ${s.shipmentId}`);
          }
        }
        // mark shipment as final
        s.status = 'DELIVERED';
        await s.save();
      } catch (err) {
        console.error('Auto confirm failed for shipment', s._id, err.message);
      }
    }

    return { processed: shipments.length };
  }
}

module.exports = new ShipmentService();
