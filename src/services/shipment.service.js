const Shipment = require('../models/Shipment');
const SubOrder = require('../models/SubOrder');
const User = require('../models/User');
const ShipmentProof = require('../models/Shipment_Proof');
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
    return Shipment.find({ shipper: shipperId })
      .populate({
        path: 'subOrder',
        select: 'rentalPeriod owner pricing products masterOrder',
        populate: [
          {
            path: 'masterOrder',
            select: 'rentalPeriod renter',
            populate: {
              path: 'renter',
              select: 'profile email phone'
            }
          },
          {
            path: 'owner',
            select: 'profile email phone'
          }
        ]
      })
      .sort({ createdAt: -1 });
  }

  /**
   * List available shipments for shipper grouped by type
   * Shows PENDING shipments ready to be picked up
   */
  async listAvailableShipments(shipperId) {
    const shipments = await Shipment.find({
      status: 'PENDING'
    })
      .populate('subOrder', 'subOrderNumber rentalPeriod products')
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner', select: 'profile phone' },
          { path: 'masterOrder', select: 'renter', populate: { path: 'renter', select: 'profile phone' } }
        ]
      })
      .sort({ scheduledAt: 1 });

    // Group by type with clear labels
    const grouped = {
      DELIVERY: shipments.filter(s => s.type === 'DELIVERY'),
      RETURN: shipments.filter(s => s.type === 'RETURN')
    };

    // Enrich data with readable info
    const enriched = {
      DELIVERY: grouped.DELIVERY.map(s => ({
        ...s.toObject(),
        typeLabel: 'Giao hàng',
        typeIcon: '📦',
        direction: `Từ ${s.contactInfo?.name || 'Khách'} → ${s.toAddress?.district || 'đích'}`,
        scheduledLabel: `Dự kiến: ${new Date(s.scheduledAt).toLocaleDateString('vi-VN')}`
      })),
      RETURN: grouped.RETURN.map(s => ({
        ...s.toObject(),
        typeLabel: 'Nhận trả',
        typeIcon: '🔄',
        direction: `Từ ${s.contactInfo?.name || 'Chủ'} → ${s.toAddress?.district || 'đích'}`,
        scheduledLabel: `Dự kiến: ${new Date(s.scheduledAt).toLocaleDateString('vi-VN')}`
      }))
    };

    return enriched;
  }

  async shipperAccept(shipmentId, shipperId) {
    const shipment = await Shipment.findById(shipmentId).populate('subOrder');
    if (!shipment) throw new Error('Shipment not found');

    // Validate shipment is in PENDING status
    if (shipment.status !== 'PENDING') {
      throw new Error(`Cannot accept shipment with status ${shipment.status}. Must be PENDING.`);
    }

    // Check if this specific shipment already has a different shipper assigned
    if (shipment.shipper && String(shipment.shipper) !== String(shipperId)) {
      throw new Error('This shipment is already assigned to another shipper');
    }

    // Assign and confirm
    shipment.shipper = shipperId;
    shipment.status = 'SHIPPER_CONFIRMED';
    
    console.log(`✅ Shipper ${shipperId} confirmed shipment ${shipment.shipmentId}`);
    console.log(`   Type: ${shipment.type} (${shipment.type === 'DELIVERY' ? 'Giao hàng' : 'Nhận trả'})`);
    console.log(`   Scheduled: ${shipment.scheduledAt}`);
    
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

  /**
   * Mark shipment as delivered/returned (shipper completes delivery)
   * This updates the SPECIFIC shipment, not creating a new one
   */
  async markDelivered(shipmentId, data) {
    const shipment = await Shipment.findById(shipmentId).populate('subOrder');
    if (!shipment) throw new Error('Shipment not found');

    // Validate status transition
    if (shipment.status !== 'IN_TRANSIT') {
      throw new Error(`Cannot mark as delivered. Current status: ${shipment.status}`);
    }

    shipment.status = 'DELIVERED';
    shipment.tracking.deliveredAt = new Date();
    shipment.tracking.photos = (shipment.tracking.photos || []).concat(data.photos || []);

    console.log(`✅ Shipment ${shipment.shipmentId} marked as DELIVERED`);
    console.log(`   Type: ${shipment.type}`);
    console.log(`   DeliveredAt: ${shipment.tracking.deliveredAt}`);

    // Update SubOrder status to ACTIVE when DELIVERY shipment is delivered
    if (shipment.type === 'DELIVERY' && shipment.subOrder) {
      shipment.subOrder.status = 'ACTIVE';
      await shipment.subOrder.save();
      console.log(`   ✅ SubOrder status: ACTIVE (rental is now active for renter/owner)`);

      // Also update MasterOrder status to ACTIVE (rental starts)
      try {
        const MasterOrder = require('../models/MasterOrder');
        const SubOrder = require('../models/SubOrder');
        const masterOrderId = shipment.subOrder.masterOrder;
        if (masterOrderId) {
          // Check if all suborders have been delivered
          const allSubOrders = await SubOrder.find({ masterOrder: masterOrderId });
          const allDelivered = allSubOrders.every(sub => sub.status === 'ACTIVE' || sub.status === 'COMPLETED');
          
          if (allDelivered) {
            const masterOrder = await MasterOrder.findById(masterOrderId);
            if (masterOrder && masterOrder.status !== 'ACTIVE' && masterOrder.status !== 'COMPLETED') {
              masterOrder.status = 'ACTIVE';
              await masterOrder.save();
              console.log(`   ✅ MasterOrder ${masterOrderId} status set to ACTIVE (all suborders delivered)`);
            }
          } else {
            console.log(`   ℹ️ Not all suborders delivered yet, MasterOrder status remains at ${allSubOrders.map(s => `${s._id.slice(-4)}: ${s.status}`).join(', ')}`);
          }
        }
      } catch (moErr) {
        console.error('   ⚠️ Failed to update MasterOrder status:', moErr.message || moErr);
      }
    }

    await shipment.save();

    console.log(`\n📋 Shipment marked DELIVERED:`);
    if (shipment.type === 'DELIVERY') {
      console.log(`   ✓ SubOrder status: ACTIVE (renter/owner can see rental is active)`);
      console.log(`   ✓ Shipment status: DELIVERED`);
    } else if (shipment.type === 'RETURN') {
      console.log(`   ✓ Owner must confirm return receipt via ownerConfirmDelivery()`);
      console.log(`   ✓ Shipment status: DELIVERED`);
    }

    // Transfer shipping fee to shipper when RETURN shipment is DELIVERED
    // Only RETURN shipments pay the shipper, not DELIVERY shipments
    try {
      if (shipment.type === 'RETURN' && shipment.shipper && shipment.fee > 0) {
        const SystemWalletService = require('./systemWallet.service');
        const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
        
        console.log(`\n💰 Transferring shipping fee to shipper (RETURN shipment):`);
        console.log(`   Shipper ID: ${shipment.shipper}`);
        console.log(`   Fee: ${shipment.fee} VND`);
        
        const transferResult = await SystemWalletService.transferToUser(
          adminId,
          shipment.shipper,
          shipment.fee,
          `Shipping fee for return shipment ${shipment.shipmentId}`
        );
        
        console.log(`   ✅ Transfer successful`);
      } else if (shipment.type === 'DELIVERY') {
        console.log(`\n⏭️  DELIVERY shipment - no shipper payment (shipper payment only for RETURN)`);
      }
    } catch (err) {
      console.error(`   ❌ Failed to transfer shipping fee: ${err.message}`);
    }

    return shipment;
  }

  /**
   * Renter confirms receipt of delivered goods (DELIVERY shipment)
   * OR Renter confirms return was received (RETURN shipment)
   * Only DELIVERY shipment triggers payment transfer to owner
   */
  async renterConfirmDelivered(shipmentId, renterId) {
    const shipment = await Shipment.findById(shipmentId).populate('subOrder');
    if (!shipment) throw new Error('Shipment not found');

    // Validate shipment type
    if (shipment.type !== 'DELIVERY' && shipment.type !== 'RETURN') {
      throw new Error(`Invalid shipment type: ${shipment.type}`);
    }

    console.log(`\n📦 Renter ${renterId} confirming: ${shipment.shipmentId} (${shipment.type})`);
    console.log(`   Shipment details:`, {
      shipmentId: shipment._id,
      type: shipment.type,
      status: shipment.status,
      subOrderId: shipment.subOrder?._id
    });

    if (shipment.subOrder) {
      console.log('   SubOrder loaded:');
      console.log('     - products count:', shipment.subOrder.products?.length || 0);
      if (shipment.subOrder.products && shipment.subOrder.products.length > 0) {
        console.log('     - product[0] keys:', Object.keys(shipment.subOrder.products[0]));
        console.log('     - product[0].totalRental:', shipment.subOrder.products[0].totalRental);
        console.log('     - product[0].totalDeposit:', shipment.subOrder.products[0].totalDeposit);
      }
      console.log('     - pricing:', JSON.stringify(shipment.subOrder.pricing, null, 2));
    }

    shipment.status = 'DELIVERED';
    
    let transferResult = null;
    let transferError = null;

    // Only transfer payment for DELIVERY shipment, not for RETURN
    if (shipment.type === 'DELIVERY' && shipment.subOrder) {
      try {
        const ownerId = shipment.subOrder.owner;
        const rentalAmount = shipment.subOrder.pricing?.subtotalRental || 0;
        const depositAmount = shipment.subOrder.pricing?.subtotalDeposit || 0;
        
        console.log(`   Shipment type: DELIVERY (Giao hàng)`);
        console.log(`   SubOrder ID: ${shipment.subOrder._id}`);
        console.log(`   Owner ID: ${ownerId}`);
        console.log(`   SubOrder pricing:`, shipment.subOrder.pricing);
        console.log(`   💰 Payment breakdown:`);
        console.log(`      - Rental fee (→ owner): ${rentalAmount} VND`);
        console.log(`      - Deposit (→ admin holds): ${depositAmount} VND`);
        
        // Only transfer if SubOrder is not already ACTIVE (was already set by shipper markDelivered)
        if (shipment.subOrder.status !== 'ACTIVE') {
          console.log(`   ℹ️ SubOrder status is ${shipment.subOrder.status}, setting to ACTIVE`);
          shipment.subOrder.status = 'ACTIVE';
        } else {
          console.log(`   ℹ️ SubOrder already ACTIVE (set when shipper confirmed delivery)`);
        }

        if (rentalAmount > 0) {
          const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
          console.log(`   Admin ID for transfer: ${adminId}`);
          transferResult = await SystemWalletService.transferToUser(
            adminId,
            ownerId,
            rentalAmount,
            `Rental fee for shipment ${shipment.shipmentId}`
          );
          console.log(`   ✅ Transfer successful:`, transferResult);
          console.log(`   ℹ️  Deposit ${depositAmount} VND held in admin wallet for renter refund`);
        } else {
          console.log(`   ⚠️  No rental fee to transfer (amount = 0)`);
          console.log(`   Possible reasons: subtotalRental is missing or 0 in pricing`);
        }

        await shipment.subOrder.save();
        console.log(`   ✅ SubOrder saved with status: ${shipment.subOrder.status}`);

      } catch (err) {
        transferError = err.message || String(err);
        console.error(`   ❌ Payment error:`, err);
      }
    } else if (shipment.type === 'RETURN') {
      // RETURN shipment - no payment needed, just confirm receipt
      console.log(`   Shipment type: RETURN (Nhận trả)`);
      console.log(`   ℹ️  Return shipment confirmed (no payment transfer)`);
      
      if (shipment.subOrder) {
        shipment.subOrder.status = 'RETURNED';
        await shipment.subOrder.save();
        console.log(`   ✅ SubOrder status: RETURNED`);
      }
    }

    await shipment.save();
    console.log(`✅ Renter confirmation complete\n`);

    return { shipment, transferResult, transferError };
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

          // NOTE: Renter MUST manually confirm delivery by clicking button
          // Do NOT auto-confirm here - renter needs explicit action
          console.log(`ℹ️ Shipment ${s.shipmentId}: Waiting for renter to manually confirm delivery`);
          // Disabled auto-confirm logic - renter must click button
          // s.subOrder.status = 'DELIVERED';
          // await s.subOrder.save();
        }
        // mark shipment as final
        s.status = 'DELIVERED';
        await s.save();
      } catch (err) {
        console.error(`❌ Auto confirm failed for shipment ${s._id}:`, err.message);
      }
    }

    console.log(`✅ autoConfirmDelivered: Processed ${shipments.length} shipments (awaiting renter confirmation)`);
    return { processed: shipments.length };
  }

  /**
   * Create both outbound (DELIVERY) and return (RETURN) shipments when contract is signed
   * Called when all contracts for a master order are signed
   */
  async createDeliveryAndReturnShipments(masterOrderId, shipperId) {
    try {
      const MasterOrder = require('../models/MasterOrder');
      const SubOrder = require('../models/SubOrder');

      console.log(`\n📦 Creating shipments for master order: ${masterOrderId}`);
      if (shipperId) {
        console.log(`   Assigning to shipper: ${shipperId}`);
      }

      if (!masterOrderId) {
        throw new Error('masterOrderId is required');
      }

      // Get master order with renter populated
      const masterOrder = await MasterOrder.findById(masterOrderId)
        .populate('renter', '_id profile email phone address');

      if (!masterOrder) {
        throw new Error(`Master order ${masterOrderId} not found`);
      }
      
      console.log(`✅ Master order found:`, {
        _id: masterOrder._id,
        masterOrderNumber: masterOrder.masterOrderNumber,
        status: masterOrder.status,
        renter: masterOrder.renter ? `${masterOrder.renter._id}` : 'NOT POPULATED'
      });

      // Get subOrders separately with full population
      const subOrders = await SubOrder.find({ masterOrder: masterOrderId })
        .populate('owner', '_id profile email phone address')
        .populate('products.product', '_id name');

      if (!subOrders || subOrders.length === 0) {
        console.warn(`⚠️ No subOrders found for master order`);
        return { count: 0, pairs: 0 };
      }

      console.log(`✅ Found ${subOrders.length} subOrder(s)`);

      const createdShipments = [];
      let shipmentPairs = 0;
      const errors = [];

      // Create shipments for each sub-order and each product
      for (let soIndex = 0; soIndex < subOrders.length; soIndex++) {
        const subOrder = subOrders[soIndex];
        console.log(`\n  SubOrder ${soIndex + 1}/${subOrders.length}:`);
        console.log(`    _id: ${subOrder._id}`);
        console.log(`    subOrderNumber: ${subOrder.subOrderNumber}`);
        console.log(`    status: ${subOrder.status}`);
        console.log(`    products count: ${subOrder.products?.length || 0}`);
        console.log(`    rentalPeriod: ${subOrder.rentalPeriod?.startDate} to ${subOrder.rentalPeriod?.endDate}`);
        
        if (!subOrder.products || subOrder.products.length === 0) {
          console.warn(`    ❌ No products found, skipping`);
          continue;
        }

        const owner = subOrder.owner;
        if (!owner) {
          console.error(`    ❌ CRITICAL: Owner not found`);
          console.error(`       ownerId: ${subOrder.owner._id}`);
          continue;
        }
        
        console.log(`    ✅ Owner: ${owner._id}`);
        console.log(`       Owner profile:`, JSON.stringify(owner.profile, null, 2));

        const renter = masterOrder.renter;
        if (!renter) {
          console.error(`    ❌ CRITICAL: Renter not found for MasterOrder`);
          continue;
        }
        
        console.log(`    ✅ Renter: ${renter._id}`);
        console.log(`       Renter profile:`, JSON.stringify(renter.profile, null, 2));

        // For each product in subOrder, create 2 shipments: DELIVERY and RETURN
        for (let productIndex = 0; productIndex < subOrder.products.length; productIndex++) {
          const productItem = subOrder.products[productIndex];
          const product = productItem?.product;

          console.log(`      Product ${productIndex + 1}: `);
          if (!product) {
            console.warn(`        ❌ Not populated`);
            console.log(`        Raw data:`, productItem);
            continue;
          }
          
          console.log(`        _id: ${product._id}, name: ${product.name}`);

          // Get owner and renter addresses - từ top-level address field
          const ownerAddress = owner.address || {};
          const renterAddress = renter.address || {};

          console.log(`        Owner address:`, JSON.stringify(ownerAddress));
          console.log(`        Renter address:`, JSON.stringify(renterAddress));

          // OUTBOUND SHIPMENT (DELIVERY)
          try {
            console.log(`        Creating DELIVERY shipment...`);
            const deliveryPayload = {
              subOrder: subOrder._id,
              productId: product._id,
              productIndex: productIndex,
              type: 'DELIVERY',
              fromAddress: {
                streetAddress: renterAddress.streetAddress || '',
                ward: renterAddress.ward || '',
                district: renterAddress.district || '',
                city: renterAddress.city || '',
                province: renterAddress.province || '',
                coordinates: renterAddress.coordinates || {}
              },
              toAddress: {
                streetAddress: ownerAddress.streetAddress || '',
                ward: ownerAddress.ward || '',
                district: ownerAddress.district || '',
                city: ownerAddress.city || '',
                province: ownerAddress.province || '',
                coordinates: ownerAddress.coordinates || {}
              },
              contactInfo: {
                name: owner.profile?.fullName || owner.profile?.firstName || 'Owner',
                phone: owner.phone || '',
                notes: `Nhận hàng thuê từ ${product.name || 'sản phẩm'}`
              },
              customerInfo: {
                userId: renter._id,
                name: renter.profile?.fullName || renter.profile?.firstName || 'Renter',
                phone: renter.phone || '',
                email: renter.email || ''
              },
              fee: subOrder.pricing?.shippingFee || 0,
              scheduledAt: subOrder.rentalPeriod?.startDate,
              status: 'PENDING'
            };
            
            console.log(`        DELIVERY Payload:`, JSON.stringify(deliveryPayload, null, 2));
            
            const outboundShipment = await this.createShipment(deliveryPayload);

            console.log(`        ✅ DELIVERY: ${outboundShipment.shipmentId}`);
            
            // Create ShipmentProof document for this shipment
            const deliveryProof = new ShipmentProof({
              shipment: outboundShipment._id,
              imageBeforeDelivery: '',
              imageAfterDelivery: '',
              notes: `DELIVERY: ${product.name} | From: ${renter.profile?.fullName || 'Renter'} | To: ${owner.profile?.fullName || 'Owner'} | Date: ${subOrder.rentalPeriod?.startDate}`
            });
            await deliveryProof.save();
            console.log(`        ✅ Created ShipmentProof for DELIVERY: ${deliveryProof._id}`);
            
            // Assign shipper if provided
            if (shipperId) {
              outboundShipment.shipper = shipperId;
              await outboundShipment.save();
              console.log(`        ✅ Assigned shipper to DELIVERY: ${shipperId}`);
            }
            
            createdShipments.push(outboundShipment);
          } catch (err) {
            const errMsg = `DELIVERY shipment creation failed for product ${product._id}: ${err.message}`;
            console.error(`        ❌ DELIVERY Error:`, err.message);
            console.error(`        Error type:`, err.constructor.name);
            console.error(`        Full error:`, JSON.stringify(err, null, 2));
            if (err.errors) {
              console.error(`        Validation errors:`, err.errors);
            }
            console.error(`           Stack:`, err.stack);
            errors.push(errMsg);
          }

          // RETURN SHIPMENT
          try {
            console.log(`\n        🔄 Creating RETURN shipment...`);
            const returnPayload = {
              subOrder: subOrder._id,
              productId: product._id,
              productIndex: productIndex,
              type: 'RETURN',
              returnType: 'NORMAL',
              fromAddress: {
                streetAddress: ownerAddress.streetAddress || '',
                ward: ownerAddress.ward || '',
                district: ownerAddress.district || '',
                city: ownerAddress.city || '',
                province: ownerAddress.province || '',
                coordinates: ownerAddress.coordinates || {}
              },
              toAddress: {
                streetAddress: renterAddress.streetAddress || '',
                ward: renterAddress.ward || '',
                district: renterAddress.district || '',
                city: renterAddress.city || '',
                province: renterAddress.province || '',
                coordinates: renterAddress.coordinates || {}
              },
              contactInfo: {
                name: renter.profile?.fullName || renter.profile?.firstName || 'Renter',
                phone: renter.phone || '',
                notes: `Trả hàng thuê: ${product.name || 'sản phẩm'}`
              },
              customerInfo: {
                userId: renter._id,
                name: renter.profile?.fullName || renter.profile?.firstName || 'Renter',
                phone: renter.phone || '',
                email: renter.email || ''
              },
              fee: subOrder.pricing?.shippingFee || 0,
              scheduledAt: subOrder.rentalPeriod?.endDate,
              status: 'PENDING'
            };
            
            console.log(`        RETURN Payload keys:`, Object.keys(returnPayload));
            console.log(`        RETURN Payload:`, JSON.stringify(returnPayload, null, 2));
            
            console.log(`        📤 Calling createShipment with RETURN payload...`);
            const returnShipment = await this.createShipment(returnPayload);
            
            console.log(`        ✅ RETURN shipment created successfully!`);
            console.log(`        RETURN ID: ${returnShipment._id}`);
            console.log(`        RETURN shipmentId: ${returnShipment.shipmentId}`);
            
            // Create ShipmentProof document for this shipment
            const returnProof = new ShipmentProof({
              shipment: returnShipment._id,
              imageBeforeDelivery: '',
              imageAfterDelivery: '',
              notes: `RETURN: ${product.name} | From: ${owner.profile?.fullName || 'Owner'} | To: ${renter.profile?.fullName || 'Renter'} | Date: ${subOrder.rentalPeriod?.endDate}`
            });
            await returnProof.save();
            console.log(`        ✅ Created ShipmentProof for RETURN: ${returnProof._id}`);
            
            // Assign shipper if provided
            if (shipperId) {
              returnShipment.shipper = shipperId;
              await returnShipment.save();
              console.log(`        ✅ Assigned shipper to RETURN: ${shipperId}`);
            }
            
            createdShipments.push(returnShipment);
            shipmentPairs++;
            
            console.log(`        ✅ RETURN: ${returnShipment.shipmentId}`);
          } catch (err) {
            console.error(`\n        ❌ RETURN Error DETAILS:`);
            console.error(`        Error occurred at step: creating RETURN shipment`);
            console.error(`        Message:`, err.message);
            console.error(`        Type:`, err.constructor.name);
            
            // Log Mongoose validation errors
            if (err.errors) {
              console.error(`        Mongoose Validation Errors:`, Object.keys(err.errors).reduce((acc, key) => {
                acc[key] = err.errors[key].message;
                return acc;
              }, {}));
            }
            
            // Log the full error for debugging
            console.error(`        Full error:`, err);
            console.error(`        Stack:`, err.stack);
            console.error(`\n`);
            errors.push(`RETURN shipment creation failed for product ${product._id}: ${err.message}`);
          }
        }
      }

      console.log(`\n✅ SUMMARY: Created ${createdShipments.length} total shipments (${shipmentPairs} pairs)\n`);

      if (errors.length > 0) {
        console.error(`⚠️  Errors occurred during shipment creation:`);
        errors.forEach((e, i) => console.error(`   ${i + 1}. ${e}`));
      }

      return {
        success: errors.length === 0,
        count: createdShipments.length,
        pairs: shipmentPairs,
        shipments: createdShipments,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('❌ Error creating delivery and return shipments:', error.message);
      console.error('Full error:', error);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Tìm shipper cùng khu vực với owner
   * So sánh địa chỉ dựa trên: district, city, province
   */
  async findShipperInSameArea(ownerAddress) {
    try {
      if (!ownerAddress) {
        console.warn('⚠️ findShipperInSameArea: ownerAddress is null/undefined');
        return null;
      }

      console.log('🔍 Finding shipper in same area as owner');
      console.log('   Owner address:', ownerAddress);

      // Tìm shipper có địa chỉ trùng với owner
      // Ưu tiên: district → city → province
      let shipper = null;

      if (ownerAddress.district) {
        // Tìm shipper cùng district
        shipper = await User.findOne({
          role: 'SHIPPER',
          'address.district': ownerAddress.district,
          status: 'ACTIVE'
        }).select('_id email phone profile address');

        if (shipper) {
          console.log(`✅ Found shipper in same district: ${shipper._id}`);
          return shipper;
        }
      }

      if (!shipper && ownerAddress.city) {
        // Tìm shipper cùng city nhưng khác district
        shipper = await User.findOne({
          role: 'SHIPPER',
          'address.city': ownerAddress.city,
          status: 'ACTIVE'
        }).select('_id email phone profile address');

        if (shipper) {
          console.log(`✅ Found shipper in same city: ${shipper._id}`);
          return shipper;
        }
      }

      if (!shipper && ownerAddress.province) {
        // Tìm shipper cùng province
        shipper = await User.findOne({
          role: 'SHIPPER',
          'address.province': ownerAddress.province,
          status: 'ACTIVE'
        }).select('_id email phone profile address');

        if (shipper) {
          console.log(`✅ Found shipper in same province: ${shipper._id}`);
          return shipper;
        }
      }

      // Nếu không tìm thấy, lấy shipper bất kỳ
      if (!shipper) {
        shipper = await User.findOne({
          role: 'SHIPPER',
          status: 'ACTIVE'
        }).select('_id email phone profile address');

        if (shipper) {
          console.log(`✅ No local shipper found, assigned any available shipper: ${shipper._id}`);
          return shipper;
        }
      }

      console.warn('⚠️ No shipper found');
      return null;
    } catch (error) {
      console.error('❌ Error finding shipper in same area:', error);
      throw error;
    }
  }

  /**
   * Cancel shipment pickup - shipper cannot pickup from owner
   * Updates shipment status to CANCELLED
   * Updates suborder status to CANCELLED
   * Penalize owner: creditScore -20
   * Reward renter: loyaltyPoints +25
   * Refund rental + deposit to renter (no shipping fee refund)
   * Send notification to renter
   */
  async cancelShipmentPickup(shipmentId) {
    const shipment = await Shipment.findById(shipmentId)
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner', select: '_id profile creditScore' },
          {
            path: 'masterOrder',
            select: '_id renter',
            populate: { path: 'renter', select: '_id profile loyaltyPoints email' }
          }
        ]
      });

    if (!shipment) throw new Error('Shipment not found');

    console.log(`\n❌ Cancelling shipment pickup: ${shipment.shipmentId}`);
    console.log(`   Type: ${shipment.type}`);
    console.log(`   Status: ${shipment.status} → CANCELLED`);

    // Only allow cancel if shipment is PENDING or SHIPPER_CONFIRMED
    if (!['PENDING', 'SHIPPER_CONFIRMED'].includes(shipment.status)) {
      throw new Error(`Cannot cancel shipment with status ${shipment.status}. Must be PENDING or SHIPPER_CONFIRMED.`);
    }

    // Get owner and renter info
    const subOrder = shipment.subOrder;
    if (!subOrder) throw new Error('SubOrder not found for shipment');

    const owner = subOrder.owner;
    const renter = subOrder.masterOrder?.renter;

    if (!owner) throw new Error('Owner not found');
    if (!renter) throw new Error('Renter not found');

    console.log(`   Owner: ${owner._id}`);
    console.log(`   Renter: ${renter._id}`);

    // 1. Update shipment status to CANCELLED
    shipment.status = 'CANCELLED';
    shipment.tracking = shipment.tracking || {};
    shipment.tracking.failureReason = 'Shipper cannot pickup from owner';
    await shipment.save();
    console.log(`   ✅ Shipment marked as CANCELLED`);

    // 2. Update suborder status to CANCELLED
    subOrder.status = 'CANCELLED';
    await subOrder.save();
    console.log(`   ✅ SubOrder marked as CANCELLED`);

    // 3. Penalize owner: creditScore -20
    if (owner.creditScore === undefined) owner.creditScore = 100;
    owner.creditScore = Math.max(0, owner.creditScore - 20);
    await owner.save();
    console.log(`   ✅ Owner creditScore: ${owner.creditScore + 20} → ${owner.creditScore} (-20 points)`);

    // 4. Reward renter: loyaltyPoints +25
    if (renter.loyaltyPoints === undefined) renter.loyaltyPoints = 0;
    renter.loyaltyPoints += 25;
    await renter.save();
    console.log(`   ✅ Renter loyaltyPoints: ${renter.loyaltyPoints - 25} → ${renter.loyaltyPoints} (+25 points)`);

    // 5. Refund rental + deposit to renter (no shipping fee refund)
    try {
      const rentalAmount = subOrder.pricing?.subtotalRental || 0;
      const depositAmount = subOrder.pricing?.subtotalDeposit || 0;
      const totalRefund = rentalAmount + depositAmount;

      console.log(`   💰 Refund breakdown:`);
      console.log(`      - Rental fee: ${rentalAmount} VND`);
      console.log(`      - Deposit: ${depositAmount} VND`);
      console.log(`      - Total refund: ${totalRefund} VND`);
      console.log(`      - Shipping fee (NOT refunded): ${subOrder.pricing?.shippingFee || 0} VND`);

      if (totalRefund > 0) {
        const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
        const transferResult = await SystemWalletService.transferToUser(
          adminId,
          renter._id,
          totalRefund,
          `Refund (rental + deposit) for cancelled shipment ${shipment.shipmentId}`
        );
        console.log(`   ✅ Refund transferred to renter:`, transferResult);
      } else {
        console.log(`   ⚠️  No refund needed (total = 0)`);
      }
    } catch (err) {
      console.error(`   ⚠️  Refund failed: ${err.message}`);
      throw new Error(`Refund error: ${err.message}`);
    }

    // 6. Send notification to renter
    try {
      const NotificationService = require('./notification.service');
      await NotificationService.createNotification({
        recipient: renter._id,
        title: '❌ Đơn hàng đã bị hủy',
        message: `Đơn hàng của bạn đã bị hủy do shipper không thể nhận hàng từ chủ cho thuê. Bạn sẽ được hoàn lại ${totalRefund.toLocaleString('vi-VN')} VND (tiền thuê + cọc). Phí vận chuyển không được hoàn lại.`,
        type: 'SHIPMENT',
        category: 'WARNING',
        data: {
          shipmentId: shipment.shipmentId,
          subOrderNumber: subOrder.subOrderNumber,
          refundAmount: totalRefund,
          reason: 'Shipper cannot pickup from owner'
        }
      });
      console.log(`   ✅ Notification sent to renter`);
    } catch (err) {
      console.error(`   ⚠️  Notification failed: ${err.message}`);
    }

    console.log(`\n✅ Shipment cancellation completed successfully`);

    return shipment;
  }

  /**
   * Reject delivery - renter doesn't accept delivered goods
   * Updates shipment status to DELIVERY_FAILED
   * Sends notification to owner and renter
   * Reason can be: PRODUCT_DAMAGED or NO_CONTACT
   */
  async rejectDelivery(shipmentId, payload = {}) {
    const shipment = await Shipment.findById(shipmentId)
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner', select: '_id profile email' },
          {
            path: 'masterOrder',
            select: '_id renter',
            populate: { path: 'renter', select: '_id profile email' }
          }
        ]
      });

    if (!shipment) throw new Error('Shipment not found');

    const { reason = 'UNKNOWN', notes = '' } = payload;

    console.log(`\n⚠️ Delivery Rejected: ${shipment.shipmentId}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Notes: ${notes}`);
    console.log(`   Status: ${shipment.status} → DELIVERY_FAILED`);

    // Only allow reject if shipment is DELIVERED
    if (shipment.status !== 'DELIVERED') {
      throw new Error(`Cannot reject delivery. Shipment must be in DELIVERED status (current: ${shipment.status}).`);
    }

    // 1. Update shipment status
    shipment.status = 'DELIVERY_FAILED';
    shipment.tracking = shipment.tracking || {};
    shipment.tracking.failureReason = reason === 'PRODUCT_DAMAGED' ? 'Sản phẩm có lỗi' : 'Không liên lạc được với renter';
    shipment.tracking.notes = notes;
    await shipment.save();
    console.log(`   ✅ Shipment marked as DELIVERY_FAILED`);

    // 2. Send notification to owner
    try {
      const NotificationService = require('./notification.service');
      const subOrder = shipment.subOrder;
      const reasonText = reason === 'PRODUCT_DAMAGED' ? 'Sản phẩm có lỗi' : 'Không liên lạc được với renter';

      await NotificationService.createNotification({
        recipient: subOrder.owner._id,
        title: '⚠️ Renter không nhận hàng',
        message: `Renter không nhận hàng từ shipment ${shipment.shipmentId}. Lý do: ${reasonText}. Ghi chú: ${notes}`,
        type: 'SHIPMENT',
        category: 'WARNING',
        data: {
          shipmentId: shipment.shipmentId,
          subOrderNumber: subOrder.subOrderNumber,
          reason: reason,
          notes: notes
        }
      });
      console.log(`   ✅ Notification sent to owner`);
    } catch (err) {
      console.error(`   ⚠️  Notification to owner failed: ${err.message}`);
    }

    // 3. Send notification to renter
    try {
      const NotificationService = require('./notification.service');
      const subOrder = shipment.subOrder;

      await NotificationService.createNotification({
        recipient: subOrder.masterOrder.renter._id,
        title: '📦 Ghi nhận renter không nhận hàng',
        message: `Đơn hàng ${subOrder.subOrderNumber} đã được ghi nhận là renter không nhận hàng. Vui lòng liên hệ với chúng tôi nếu có bất kỳ thắc mắc nào.`,
        type: 'SHIPMENT',
        category: 'INFO',
        data: {
          shipmentId: shipment.shipmentId,
          subOrderNumber: subOrder.subOrderNumber,
          reason: reason
        }
      });
      console.log(`   ✅ Notification sent to renter`);
    } catch (err) {
      console.error(`   ⚠️  Notification to renter failed: ${err.message}`);
    }

    console.log(`\n✅ Delivery rejection completed successfully`);

    return shipment;
  }
}

module.exports = new ShipmentService();
