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

      // Transfer ONLY rental fee to owner (NOT deposit, deposit stays in system wallet)
      let transferResult = null;
      let transferError = null;
      try {
        const ownerId = shipment.subOrder.owner;
        // Only transfer rental amount, NOT deposit (deposit is held by admin for renter refund)
        const rentalAmount = shipment.subOrder.pricing?.subtotalRental || 0;
        const depositAmount = shipment.subOrder.pricing?.subtotalDeposit || 0;
        
        console.log(`💰 renterConfirmDelivered: Rental breakdown`);
        console.log(`   - Rental fee (→ owner): ${rentalAmount} VND`);
        console.log(`   - Deposit (→ admin holds): ${depositAmount} VND`);
        console.log(`   - Attempting transfer: ${rentalAmount} VND to owner ${ownerId}`);
        
        if (rentalAmount > 0) {
          // Get SYSTEM_ADMIN_ID from env, or use a placeholder string for tracking
          const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
          transferResult = await SystemWalletService.transferToUser(
            adminId,
            ownerId,
            rentalAmount,
            `Rental fee for shipment ${shipment.shipmentId}`
          );
          console.log(`✅ Transfer successful: ${rentalAmount} VND transferred to owner ${ownerId}`);
          console.log(`   Deposit ${depositAmount} VND remains in admin wallet for renter refund`);
        } else {
          console.log('⚠️ renterConfirmDelivered: rental amount is 0, skipping transfer');
        }
      } catch (err) {
        transferError = err.message || String(err);
        console.error(`❌ Failed to transfer payment to owner:`, transferError);
      }
      // return both shipment and transfer info so controller/client can surface result
      await shipment.save();
      return { shipment, transferResult, transferError };
    }
    await shipment.save();
    return { shipment };
  }

  // Auto confirm delivered for shipments delivered > thresholdHours ago
  async autoConfirmDelivered(thresholdHours = 24) {
    const cutoff = new Date(Date.now() - thresholdHours * 3600 * 1000);
    const shipments = await Shipment.find({ status: 'DELIVERED', 'tracking.deliveredAt': { $lte: cutoff } }).populate('subOrder');
    console.log(`🔄 autoConfirmDelivered: Processing ${shipments.length} shipments...`);

    for (const s of shipments) {
      try {
        if (s.subOrder) {
          // Check if already auto-confirmed
          if (s.subOrder.status === 'DELIVERED') {
            console.log(`⏭️  Shipment ${s.shipmentId}: SubOrder already DELIVERED, skipping`);
            continue;
          }

          // Auto-confirm as DELIVERED (renter confirmation auto after threshold)
          console.log(`🔄 Shipment ${s.shipmentId}: Auto-confirming SubOrder as DELIVERED`);
          s.subOrder.status = 'DELIVERED';
          await s.subOrder.save();

          // Transfer ONLY rental fee to owner (NOT deposit)
          const ownerId = s.subOrder.owner;
          const rentalAmount = s.subOrder.pricing?.subtotalRental || 0;
          const depositAmount = s.subOrder.pricing?.subtotalDeposit || 0;
          
          try {
            if (rentalAmount > 0) {
              const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
              console.log(`💰 autoConfirmDelivered: Transferring rental fee ${rentalAmount} VND to owner ${ownerId}`);
              console.log(`   Deposit ${depositAmount} VND remains in admin wallet`);
              await SystemWalletService.transferToUser(
                adminId,
                ownerId,
                rentalAmount,
                `Rental fee for shipment ${s.shipmentId}`
              );
              console.log(`✅ Transfer successful for shipment ${s.shipmentId}`);
            } else {
              console.log(`⚠️ Shipment ${s.shipmentId}: Rental amount is 0, skipping transfer`);
            }
          } catch (err) {
            console.error(`❌ Auto transfer failed for shipment ${s.shipmentId}, owner ${ownerId}:`, err.message || String(err));
          }
        }
        // mark shipment as final
        s.status = 'DELIVERED';
        await s.save();
      } catch (err) {
        console.error(`❌ Auto confirm failed for shipment ${s._id}:`, err.message);
      }
    }

    console.log(`✅ autoConfirmDelivered: Processed ${shipments.length} shipments`);
    return { processed: shipments.length };
  }
}

module.exports = new ShipmentService();
