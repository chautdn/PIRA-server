const Shipment = require('../models/Shipment');
const SubOrder = require('../models/SubOrder');
const Product = require('../models/Product');
const User = require('../models/User');
const ShipmentProof = require('../models/Shipment_Proof');
const SystemWalletService = require('./systemWallet.service');
const RentalOrderService = require('./rentalOrder.service');
const { sendShipperNotificationEmail } = require('../utils/mailer');

class ShipmentService {
  /**
   * Helper: Emit shipment created to shipper and schedule email
   * @param {Object} shipment - Shipment document
   * @param {String} shipperId - Shipper user ID
   * @param {Object} shipmentData - Additional shipment data for display
   * @param {String} shipmentType - DELIVERY or RETURN
   */
  async emitShipmentAndScheduleEmail(shipment, shipperId, shipmentData, shipmentType) {
    try {
      // 1. Emit real-time socket event
      if (global.chatGateway && typeof global.chatGateway.emitShipmentCreated === 'function') {
        global.chatGateway.emitShipmentCreated(shipperId.toString(), {
          _id: shipment._id,
          shipmentId: shipment.shipmentId,
          type: shipmentType,
          status: shipment.status,
          scheduledAt: shipment.scheduledAt,
          ...shipmentData
        });
      }

      // 2. Get the scheduled date (from shipment or shipmentData)
      const scheduledDateValue = shipment.scheduledAt || shipmentData?.scheduledAt;

      if (!scheduledDateValue) {
        console.warn(`        ⚠️  No scheduled date found! Using today's date as fallback.`);
      }

      const scheduledDate = new Date(scheduledDateValue || Date.now());
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      scheduledDate.setHours(0, 0, 0, 0);

      const dayDiff = Math.floor((scheduledDate - today) / (1000 * 60 * 60 * 24));

      let emailSendTime = new Date();
      let shouldSendImmediately = false;

      if (dayDiff === 1) {
        // Tomorrow is the scheduled date → Send email immediately (now)
        shouldSendImmediately = true;
      } else if (dayDiff > 1) {
        // More than 1 day away → Send email 1 day before
        emailSendTime = new Date(scheduledDate);
        emailSendTime.setDate(emailSendTime.getDate() - 1);
        emailSendTime.setHours(9, 0, 0, 0); // 9 AM on that day
      } else if (dayDiff === 0) {
        // Today is the scheduled date → Send email immediately (now)
        shouldSendImmediately = true;
      } else {
        // Past date - send immediately
        shouldSendImmediately = true;
      }

      // 3. Schedule or send email immediately
      try {
        const shipper = await User.findById(shipperId).select('_id email profile');
        if (!shipper || !shipper.email) {
          return;
        }

        const shipmentTypeLabel = shipmentType === 'DELIVERY' ? 'Giao hàng' : 'Trả hàng';
        const scheduledDateStr = new Date(scheduledDateValue || Date.now()).toLocaleDateString(
          'vi-VN',
          { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
        );
        const shipperName =
          `${shipper.profile?.firstName || ''} ${shipper.profile?.lastName || ''}`.trim() ||
          shipper.email;

        const emailContent = {
          recipient: shipper.email,
          subject: `📦 Đơn ${shipmentTypeLabel} mới - ${shipment.shipmentId}`,
          html: `
            <h2>Xin chào ${shipperName},</h2>
            <p>Bạn có một đơn ${shipmentTypeLabel} mới được giao cho bạn:</p>
            <ul>
              <li><strong>Mã đơn:</strong> ${shipment.shipmentId}</li>
              <li><strong>Loại:</strong> ${shipmentTypeLabel}</li>
              <li><strong>Ngày dự kiến:</strong> ${scheduledDateStr}</li>
            </ul>
            <p>Vui lòng đăng nhập vào ứng dụng để xem chi tiết và nhận đơn.</p>
            <p>Cảm ơn!</p>
          `
        };

        if (shouldSendImmediately) {
          // Send email immediately
          const emailService = require('./thirdParty.service');
          await emailService.sendEmail(emailContent);
        } else if (emailSendTime.getTime() > Date.now()) {
          // Schedule email for later
          const delay = emailSendTime.getTime() - Date.now();

          setTimeout(async () => {
            try {
              const emailService = require('./thirdParty.service');
              await emailService.sendEmail(emailContent);
            } catch (err) {
              console.error(`        ⚠️  Scheduled email send failed:`, err.message);
            }
          }, delay);
        }
      } catch (emailErr) {
        console.error(`        ⚠️  Email scheduling failed:`, emailErr.message);
      }
    } catch (err) {
      console.error(`        ⚠️  Error in emitShipmentAndScheduleEmail:`, err.message);
    }
  }

  async createShipment(payload) {
    const shipmentId = `SHP${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const shipment = new Shipment({ shipmentId, ...payload });
    await shipment.save();
    return shipment;
  }

  async getShipment(id) {
    return Shipment.findById(id).populate({
      path: 'subOrder',
      populate: [
        {
          path: 'masterOrder',
          select: 'rentalPeriod renter masterOrderNumber',
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
    }).populate('shipper');
  }

  async listByShipper(shipperId) {
    const shipments = await Shipment.find({ shipper: shipperId })
      .populate({
        path: 'subOrder',
        populate: [
          {
            path: 'masterOrder',
            select: 'rentalPeriod renter masterOrderNumber',
            populate: {
              path: 'renter',
              select: 'profile email phone'
            }
          },
          {
            path: 'owner',
            select: 'profile email phone'
          },
          {
            path: 'products.product',
            model: 'Product',
            select: 'title images price description category'
          }
        ]
      })
      .sort({ createdAt: -1 });

    // Debug log
    shipments.forEach((s, idx) => {
      const hasDate = !!(
        s.scheduledAt ||
        s.subOrder?.rentalPeriod?.startDate ||
        s.subOrder?.rentalPeriod?.endDate
      );
      if (s.subOrder?.products && s.subOrder.products.length > 0) {
        console.log(`Shipment ${idx} products:`, s.subOrder.products.map(p => ({
          productId: p.product?._id,
          name: p.product?.name,
          hasImages: !!p.product?.images?.length
        })));
      }
    });

    return shipments;
  }

  async listAvailableShipments(shipperId) {
    const shipments = await Shipment.find({
      status: 'PENDING'
    })
      .populate('subOrder', 'subOrderNumber rentalPeriod products')
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner', select: 'profile phone' },
          {
            path: 'masterOrder',
            select: 'renter',
            populate: { path: 'renter', select: 'profile phone' }
          }
        ]
      })
      .sort({ scheduledAt: 1 });

    // Group by type with clear labels
    const grouped = {
      DELIVERY: shipments.filter((s) => s.type === 'DELIVERY'),
      RETURN: shipments.filter((s) => s.type === 'RETURN')
    };

    // Enrich data with readable info
    const enriched = {
      DELIVERY: grouped.DELIVERY.map((s) => ({
        ...s.toObject(),
        typeLabel: 'Giao hàng',
        typeIcon: '📦',
        direction: `Từ ${s.contactInfo?.name || 'Khách'} → ${s.toAddress?.district || 'đích'}`,
        scheduledLabel: `Dự kiến: ${new Date(s.scheduledAt).toLocaleDateString('vi-VN')}`
      })),
      RETURN: grouped.RETURN.map((s) => ({
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

    // Validate scheduled date - must be on or after scheduled date (at 00:00)
    // COMMENTED FOR TESTING - Uncomment to re-enable date validation
    /*
    let scheduledDate = null;
    if (shipment.scheduledAt) {
      scheduledDate = new Date(shipment.scheduledAt);
    } else if (shipment.subOrder) {
      const rentalPeriod = shipment.subOrder.rentalPeriod;
      if (rentalPeriod) {
        if (shipment.type === 'DELIVERY' && rentalPeriod.startDate) {
          scheduledDate = new Date(rentalPeriod.startDate);
        } else if (shipment.type === 'RETURN' && rentalPeriod.endDate) {
          scheduledDate = new Date(rentalPeriod.endDate);
        }
      }
    }

    if (scheduledDate) {
      // Set to start of day
      scheduledDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (today < scheduledDate) {
        const dateStr = scheduledDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        throw new Error(`Chưa đến ngày giao hàng! Bạn chỉ có thể nhận đơn từ 00:00 ngày ${dateStr}`);
      }
    }
    */

    // Check if this specific shipment already has a different shipper assigned
    if (shipment.shipper && String(shipment.shipper) !== String(shipperId)) {
      throw new Error('This shipment is already assigned to another shipper');
    }

    // Assign and confirm
    shipment.shipper = shipperId;
    shipment.status = 'SHIPPER_CONFIRMED';

    // Update product status to SHIPPER_CONFIRMED
    if (shipment.subOrder && shipment.productIndex !== undefined) {
      shipment.subOrder.products[shipment.productIndex].productStatus = 'SHIPPER_CONFIRMED';
      await shipment.subOrder.save();
    }

    await shipment.save();
    return shipment;
  }

  async updatePickup(shipmentId, data) {
    const shipment = await Shipment.findById(shipmentId).populate('subOrder');
    if (!shipment) throw new Error('Shipment not found');
    shipment.status = 'IN_TRANSIT';
    shipment.tracking.pickedUpAt = new Date();
    shipment.tracking.photos = (shipment.tracking.photos || []).concat(data.photos || []);

    // Update product status based on shipment type
    if (shipment.subOrder && shipment.productIndex !== undefined) {
      if (shipment.type === 'DELIVERY') {
        shipment.subOrder.products[shipment.productIndex].productStatus = 'IN_TRANSIT';
      } else if (shipment.type === 'RETURN') {
        shipment.subOrder.products[shipment.productIndex].productStatus = 'RETURNING';
      }
      await shipment.subOrder.save();
    }

    await shipment.save();
    return shipment;
  }

  async markDelivered(shipmentId, data) {
    const shipment = await Shipment.findById(shipmentId)
      .populate('subOrder')
      .populate({
        path: 'subOrder',
        populate: { path: 'masterOrder' }
      });
    if (!shipment) throw new Error('Shipment not found');

    // Validate status transition - accept IN_TRANSIT or SHIPPER_CONFIRMED (for cases where pickup was skipped)
    if (shipment.status !== 'IN_TRANSIT' && shipment.status !== 'SHIPPER_CONFIRMED') {
      throw new Error(
        `Cannot mark as delivered. Current status: ${shipment.status}. Expected: IN_TRANSIT or SHIPPER_CONFIRMED`
      );
    }

    shipment.status = 'DELIVERED';
    shipment.tracking.deliveredAt = new Date();
    shipment.tracking.photos = (shipment.tracking.photos || []).concat(data.photos || []);

    if (shipment.subOrder) {
      console.log(`   SubOrder ID: ${shipment.subOrder._id}`);
      console.log(`   SubOrder pricing:`, shipment.subOrder.pricing);
    }

    // Update product status and SubOrder based on shipment type
    if (!shipment.subOrder) {
      throw new Error(
        `SubOrder not populated! Shipment: ${shipment._id}, SubOrder ref: ${shipment.subOrder}`
      );
    }

    if (shipment.type === 'DELIVERY') {
        // DELIVERY: product → ACTIVE, subOrder → ACTIVE
        if (shipment.productIndex !== undefined) {
          shipment.subOrder.products[shipment.productIndex].productStatus = 'ACTIVE';
        }
        shipment.subOrder.status = 'ACTIVE';
        await shipment.subOrder.save();

      // Transfer 90% of rental fee to owner (frozen until order completed)
      // Process in background to avoid blocking response
      const PaymentQueue = require('./paymentQueue.service');
      const rentalAmount = shipment.subOrder.pricing?.subtotalRental || 0;
      const ownerCompensation = Math.floor(rentalAmount * 0.9); // 90% of rental fee

      if (ownerCompensation > 0 && shipment.subOrder.owner) {
        const ownerId = shipment.subOrder.owner;
        const subOrderId = shipment.subOrder._id;
        const shipmentIdForLog = shipment.shipmentId;
        const shipmentDbId = shipment._id;

        console.log(`   💰 Queuing payment: ${ownerCompensation.toLocaleString()} VND (90% rental fee)`);
        console.log(`   🔒 Will be frozen until order completed`);

        // Queue transfer to run in background (non-blocking)
        PaymentQueue.add(async () => {
          try {
            const SystemWalletService = require('./systemWallet.service');
            const Transaction = require('../models/Transaction');
            const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';

            const transferResult = await SystemWalletService.transferToUserFrozen(
              adminId,
              ownerId,
              ownerCompensation,
              `Rental fee (90%) for shipment ${shipmentIdForLog} - frozen until order completed`,
              10 * 1000 // 10 seconds for testing
            );

            // Update transaction metadata
            if (transferResult?.transactions?.user?._id) {
              await Transaction.findByIdAndUpdate(
                transferResult.transactions.user._id,
                {
                  $set: {
                    'metadata.subOrderId': subOrderId,
                    'metadata.shipmentId': shipmentDbId,
                    'metadata.shipmentType': 'DELIVERY'
                  }
                }
              );
            }

          } catch (err) {
            console.error(`   ❌ Payment failed for shipment ${shipmentIdForLog}:`, err.message);
          }
        }, {
          type: 'RENTAL_FEE',
          amount: ownerCompensation,
          ownerId,
          shipmentId: shipmentIdForLog
        });
      } else {
        console.log(
          `   ⚠️  Skipped transfer: ownerCompensation=${ownerCompensation}, owner=${shipment.subOrder.owner}`
        );
      }

      // Also update MasterOrder status to ACTIVE (rental starts)
      try {
        const MasterOrder = require('../models/MasterOrder');
        const SubOrder = require('../models/SubOrder');
        const masterOrderId = shipment.subOrder.masterOrder;
        if (masterOrderId) {
          // Check if all suborders have been delivered (only select status field for performance)
          const allSubOrders = await SubOrder.find({ masterOrder: masterOrderId }).select('status').lean();
          const allDelivered = allSubOrders.every(
            (sub) => sub.status === 'ACTIVE' || sub.status === 'COMPLETED'
          );

          if (allDelivered) {
            const masterOrder = await MasterOrder.findById(masterOrderId);
            if (
              masterOrder &&
              masterOrder.status !== 'ACTIVE' &&
              masterOrder.status !== 'COMPLETED'
            ) {
              masterOrder.status = 'ACTIVE';
              await masterOrder.save();
              console.log(
                `   ✅ MasterOrder ${masterOrderId} status set to ACTIVE (all suborders delivered)`
              );
            }
          } else {
            console.log(
              `   ℹ️ Not all suborders delivered yet, MasterOrder status remains at ${allSubOrders.map((s) => `${s._id.slice(-4)}: ${s.status}`).join(', ')}`
            );
          }
        }
      } catch (moErr) {
        console.error('   ⚠️ Failed to update MasterOrder status:', moErr.message || moErr);
      }
    } else if (shipment.type === 'RETURN') {
      // RETURN: product → RETURNED, subOrder & masterOrder → COMPLETED
      if (shipment.productIndex !== undefined) {
        const product = shipment.subOrder.products[shipment.productIndex];
        product.productStatus = 'RETURNED';

        // Get deposit amount to refund
        const depositAmount = product.totalDeposit || 0;

        // Refund deposit to renter (queue in background)
        if (depositAmount > 0) {
          const PaymentQueue = require('./paymentQueue.service');
          const renter = shipment.subOrder.masterOrder?.renter;

          if (renter && renter._id) {
            const renterId = renter._id;
            const shipmentIdForLog = shipment.shipmentId;

            console.log(`   💰 Queuing deposit refund: ${depositAmount.toLocaleString()} VND to renter`);

            PaymentQueue.add(async () => {
              try {
                const SystemWalletService = require('./systemWallet.service');
                const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';

                await SystemWalletService.transferToUserFrozen(
                  adminId,
                  renterId,
                  depositAmount,
                  `Return deposit refund - shipment ${shipmentIdForLog}`,
                  10 * 1000 // 10 seconds for testing
                );

                console.log(`   ✅ Deposit refund completed: ${depositAmount.toLocaleString()} VND to renter ${renterId}`);
              } catch (err) {
                console.error(`   ❌ Deposit refund failed for shipment ${shipmentIdForLog}:`, err.message);
              }
            }, {
              type: 'DEPOSIT_REFUND',
              amount: depositAmount,
              renterId,
              shipmentId: shipmentIdForLog
            });
          } else {
            console.log(
              `   ⚠️  Skipped renter refund: renter=${renter}, renter._id=${renter?._id}`
            );
          }
        } else {
        }
      }

      // Set subOrder status to COMPLETED
      shipment.subOrder.status = 'COMPLETED';
      await shipment.subOrder.save();

        // Award creditScore +5 to owner if creditScore < 100
        try {
          const User = require('../models/User');
          const owner = await User.findById(shipment.subOrder.owner);
          if (owner) {
            if (!owner.creditScore) owner.creditScore = 0;
            if (owner.creditScore < 100) {
              owner.creditScore = Math.min(100, owner.creditScore + 5);
              await owner.save();
              console.log(`   ✅ Owner creditScore +5: ${owner.creditScore} (max 100)`);
            } else {
              console.log(`   ℹ️ Owner creditScore already at max: ${owner.creditScore}`);
            }
          }
        } catch (creditErr) {
          console.error(`   ⚠️  Failed to update creditScore:`, creditErr.message);
        }

        // Award loyaltyPoints +5 to both renter and owner when order completed
        try {
          const User = require('../models/User');
          
          // Add 5 loyaltyPoints to owner
          const owner = await User.findById(shipment.subOrder.owner);
          if (owner) {
            if (!owner.loyaltyPoints) owner.loyaltyPoints = 0;
            owner.loyaltyPoints += 5;
            await owner.save();
            console.log(`   ✅ Owner loyaltyPoints +5: ${owner.loyaltyPoints}`);
          }
          
          // Add 5 loyaltyPoints to renter
          const renter = await User.findById(shipment.subOrder.masterOrder?.renter);
          if (renter) {
            if (!renter.loyaltyPoints) renter.loyaltyPoints = 0;
            renter.loyaltyPoints += 5;
            await renter.save();
            console.log(`   ✅ Renter loyaltyPoints +5: ${renter.loyaltyPoints}`);
          }
        } catch (loyaltyErr) {
          console.error(`   ⚠️  Failed to update loyaltyPoints:`, loyaltyErr.message);
        }

      // Schedule order completion after 24h (not immediately)
      // When order completes, frozen funds will also be unlocked at the same time
      try {
        const OrderScheduler = require('./orderScheduler.service');
        const masterOrderId = shipment.subOrder.masterOrder;

        if (masterOrderId) {
          console.log('\n⏰ Scheduling order completion + funds unlock after 10s from return delivery...');
          await OrderScheduler.scheduleOrderCompletion(
            masterOrderId,
            shipment.subOrder._id,
            10 / 3600 // 10 seconds for testing (converted to hours)
          );
          console.log('   ✅ After 10 seconds:');
          console.log('      - Order will be marked as COMPLETED');
          console.log('      - Frozen funds (rental + extension) will be unlocked simultaneously');
          console.log('      - Owner can withdraw money');
        }
      } catch (scheduleErr) {
        console.error('   ⚠️ Failed to schedule order completion:', scheduleErr.message || scheduleErr);
      }
    }

    await shipment.save();

    // Transfer shipping fee to shipper for DELIVERY shipments only
    try {
      if (shipment.type === 'DELIVERY' && shipment.shipper && shipment.fee > 0) {
        const SystemWalletService = require('./systemWallet.service');
        const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';

        const transferResult = await SystemWalletService.transferToUser(
          adminId,
          shipment.shipper,
          shipment.fee,
          `Shipping fee for delivery shipment ${shipment.shipmentId}`
        );
        console.log(`   💰 Paid ${shipment.fee}đ shipping fee to shipper for DELIVERY`);
      } else if (shipment.type === 'RETURN') {
        console.log(`   ℹ️  RETURN shipment - no shipping fee paid to shipper (fee paid by renter)`);
      }
    } catch (err) {
      console.error(`   ❌ Failed to transfer shipping fee: ${err.message}`);
    }

    return shipment;
  }

  async renterConfirmDelivered(shipmentId, renterId) {
    const shipment = await Shipment.findById(shipmentId).populate('subOrder');
    if (!shipment) throw new Error('Shipment not found');

    // Validate shipment type
    if (shipment.type !== 'DELIVERY' && shipment.type !== 'RETURN') {
      throw new Error(`Invalid shipment type: ${shipment.type}`);
    }

    if (shipment.subOrder) {
      if (shipment.subOrder.products && shipment.subOrder.products.length > 0) {
        console.log('     - product[0] keys:', Object.keys(shipment.subOrder.products[0]));
        console.log('     - product[0].totalRental:', shipment.subOrder.products[0].totalRental);
        console.log('     - product[0].totalDeposit:', shipment.subOrder.products[0].totalDeposit);
      }
    }

    shipment.status = 'DELIVERED';

    let transferResult = null;
    let transferError = null;

    // Only transfer payment for DELIVERY shipment, not for RETURN
    // NOTE: Payment already transferred in markDelivered() when shipper confirms
    if (shipment.type === 'DELIVERY' && shipment.subOrder) {
      try {
        const ownerId = shipment.subOrder.owner;
        const rentalAmount = shipment.subOrder.pricing?.subtotalRental || 0;
        const depositAmount = shipment.subOrder.pricing?.subtotalDeposit || 0;

        // Only update status if SubOrder is not already ACTIVE (was already set by shipper markDelivered)
        if (shipment.subOrder.status !== 'ACTIVE') {
          shipment.subOrder.status = 'ACTIVE';
        } else {
        }

        await shipment.subOrder.save();
      } catch (err) {
        transferError = err.message || String(err);
        console.error(`   ❌ Error:`, err);
      }
    } else if (shipment.type === 'RETURN') {
      // RETURN shipment - deposit refund already transferred in markDelivered()

      if (shipment.subOrder) {
        if (shipment.subOrder.status !== 'RETURNED' && shipment.subOrder.status !== 'COMPLETED') {
          shipment.subOrder.status = 'RETURNED';
          await shipment.subOrder.save();
        } else {
        }
      }
    }

    await shipment.save();

    return { shipment, transferResult, transferError };
  }

  // Auto confirm delivered for shipments delivered > thresholdHours ago
  async autoConfirmDelivered(thresholdHours = 24) {
    const cutoff = new Date(Date.now() - thresholdHours * 3600 * 1000);
    const shipments = await Shipment.find({
      status: 'DELIVERED',
      'tracking.deliveredAt': { $lte: cutoff }
    }).populate('subOrder');

    for (const s of shipments) {
      try {
        if (s.subOrder) {
          // Check if already auto-confirmed
          if (s.subOrder.status === 'DELIVERED') {
            continue;
          }
        }
        // mark shipment as final
        s.status = 'DELIVERED';
        await s.save();
      } catch (err) {
        console.error(`❌ Auto confirm failed for shipment ${s._id}:`, err.message);
      }
    }

    return { processed: shipments.length };
  }

  /**
   * ✅ MODIFIED: Tạo shipments cho SubOrder(s) của MasterOrder
   * @param {string} masterOrderId - MasterOrder ID
   * @param {string} shipperId - Optional shipper ID
   * @param {string} subOrderId - Optional: chỉ tạo cho SubOrder này (thay vì tất cả)
   */
  async createDeliveryAndReturnShipments(masterOrderId, shipperId, subOrderId = null) {
    try {
      const MasterOrder = require('../models/MasterOrder');
      const SubOrder = require('../models/SubOrder');

      if (subOrderId) {
      }
      if (shipperId) {
      }

      if (!masterOrderId) {
        throw new Error('masterOrderId is required');
      }

      // Get master order with renter populated
      const masterOrder = await MasterOrder.findById(masterOrderId).populate(
        'renter',
        '_id profile email phone address'
      );

      if (!masterOrder) {
        throw new Error(`Master order ${masterOrderId} not found`);
      }

      // ✅ MODIFIED: Lọc SubOrder nếu subOrderId được cung cấp
      let subOrderFilter = { masterOrder: masterOrderId };
      if (subOrderId) {
        subOrderFilter._id = subOrderId;
      }

      const subOrders = await SubOrder.find(subOrderFilter)
        .select('_id subOrderNumber status rentalPeriod owner pricing products masterOrder')
        .populate('owner', '_id profile email phone address')
        .populate('products.product', '_id name');

      if (!subOrders || subOrders.length === 0) {
        console.warn(
          `⚠️ No subOrders found for master order${subOrderId ? ` (filtered by ${subOrderId})` : ''}`
        );
        return { count: 0, pairs: 0 };
      }

      subOrders.forEach((so, i) => {});

      const createdShipments = [];
      let shipmentPairs = 0;
      const errors = [];

      // Create shipments for each sub-order and each product
      for (let soIndex = 0; soIndex < subOrders.length; soIndex++) {
        const subOrder = subOrders[soIndex];

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

        const renter = masterOrder.renter;
        if (!renter) {
          console.error(`    ❌ CRITICAL: Renter not found for MasterOrder`);
          continue;
        }

        // For each product in subOrder, create 2 shipments: DELIVERY and RETURN
        for (let productIndex = 0; productIndex < subOrder.products.length; productIndex++) {
          const productItem = subOrder.products[productIndex];
          const product = productItem?.product;

          if (!product) {
            console.warn(`        ❌ Not populated`);
            continue;
          }

          // Get owner and renter addresses
          const ownerAddress = owner.address || {};
          const renterDeliveryAddress = masterOrder.deliveryAddress || {}; // Use delivery address from order, not profile

          // ✅ NEW: Find the delivery batch for this product's delivery date
          const deliveryDate = productItem?.rentalPeriod?.startDate
            ? new Date(productItem.rentalPeriod.startDate).toISOString().split('T')[0]
            : null;

          let deliveryBatch = null;
          if (deliveryDate && subOrder.deliveryBatches && subOrder.deliveryBatches.length > 0) {
            deliveryBatch = subOrder.deliveryBatches.find(
              (batch) =>
                batch.deliveryDate === deliveryDate &&
                batch.products.some((pid) => pid.toString() === productItem._id.toString())
            );
          }

          // Calculate shipping fee for this shipment
          // If batch found, use batch fee divided by number of products in batch
          // Otherwise fallback to old pricing.shippingFee
          let shipmentFee = 0;
          if (deliveryBatch && deliveryBatch.shippingFee) {
            const productsInBatch = deliveryBatch.products.length;
            shipmentFee =
              productsInBatch > 0
                ? Math.round(deliveryBatch.shippingFee.finalFee / productsInBatch)
                : deliveryBatch.shippingFee.finalFee;
          } else {
            // Fallback for old orders without deliveryBatches
            shipmentFee = subOrder.pricing?.shippingFee || 0;
          }

          // OUTBOUND SHIPMENT (DELIVERY)
          try {
            const deliveryPayload = {
              subOrder: subOrder._id,
              productId: product._id,
              productIndex: productIndex,
              type: 'DELIVERY',
              fromAddress: {
                streetAddress: ownerAddress.streetAddress || '',
                ward: ownerAddress.ward || '',
                district: ownerAddress.district || '',
                city: ownerAddress.city || '',
                province: ownerAddress.province || '',
                coordinates: ownerAddress.coordinates || {}
              },
              toAddress: {
                streetAddress: renterDeliveryAddress.streetAddress || '',
                ward: renterDeliveryAddress.ward || '',
                district: renterDeliveryAddress.district || '',
                city: renterDeliveryAddress.city || '',
                province: renterDeliveryAddress.province || '',
                coordinates: renterDeliveryAddress.coordinates || {}
              },
              contactInfo: {
                name:
                  renterDeliveryAddress.contactName ||
                  renter.profile?.fullName ||
                  renter.profile?.firstName ||
                  'Renter',
                phone: renterDeliveryAddress.contactPhone || renter.phone || '',
                notes: `Giao hàng thuê đến renter cho sản phẩm ${product.name || 'sản phẩm'}`
              },
              customerInfo: {
                userId: renter._id,
                name:
                  renterDeliveryAddress.contactName ||
                  renter.profile?.fullName ||
                  renter.profile?.firstName ||
                  'Renter',
                phone: renterDeliveryAddress.contactPhone || renter.phone || '',
                email: renter.email || ''
              },
              fee: shipmentFee,
              scheduledAt: productItem?.rentalPeriod?.startDate,
              status: 'PENDING'
            };

            const outboundShipment = await this.createShipment(deliveryPayload);

            // Create ShipmentProof document for this shipment
            const deliveryProof = new ShipmentProof({
              shipment: outboundShipment._id,
              imageBeforeDelivery: '',
              imageAfterDelivery: '',
              notes: `DELIVERY: ${product.name} | From: ${renter.profile?.fullName || 'Renter'} | To: ${owner.profile?.fullName || 'Owner'} | Date: ${productItem?.rentalPeriod?.startDate}`
            });
            await deliveryProof.save();

            // Assign shipper if provided
            if (shipperId) {
              outboundShipment.shipper = shipperId;
              await outboundShipment.save();

              // Send real-time notification and schedule email
              try {
                const NotificationService = require('./notification.service');
                const shipperUser = await User.findById(shipperId).select('_id profile email');

                // Get product info - need to populate if not already
                let productInfo = product;
                if (typeof product === 'string' || !product?.name) {
                  const Product = require('../models/Product');
                  productInfo = await Product.findById(product._id || product).select('name title');
                }
                
                const productName = productInfo?.title || productInfo?.name || 'sản phẩm';
                const ownerName = owner.profile?.firstName || owner.profile?.fullName || 'chủ hàng';
                const renterName = renter.profile?.firstName || renter.profile?.fullName || 'khách hàng';
                const scheduledDateStr = productItem?.rentalPeriod?.startDate 
                  ? new Date(productItem.rentalPeriod.startDate).toLocaleDateString('vi-VN')
                  : 'chưa xác định';
                
                const deliveryNotif = await NotificationService.createNotification({
                  recipient: shipperId,
                  title: '📦 Đơn giao hàng mới',
                  message: `Bạn có đơn giao hàng mới: ${ownerName} gửi ${productName} cho ${renterName}. Dự kiến: ${scheduledDateStr}`,
                  type: 'SHIPMENT',
                  category: 'INFO',
                  data: {
                    shipmentId: outboundShipment.shipmentId,
                    shipmentObjectId: outboundShipment._id,
                    shipmentType: 'DELIVERY',
                    productName: productName,
                    ownerName: ownerName,
                    renterName: renterName,
                    scheduledAt: productItem?.rentalPeriod?.startDate
                  }
                });

                // Emit socket event for real-time update
                if (
                  global.chatGateway &&
                  typeof global.chatGateway.emitNotification === 'function'
                ) {
                  global.chatGateway.emitNotification(shipperId.toString(), deliveryNotif);
                }

                // Send email notification with complete shipment details
                try {
                  await sendShipperNotificationEmail(
                    shipperUser,
                    outboundShipment,
                    product,
                    {
                      name: renter.profile?.fullName || renter.profile?.firstName || 'Renter',
                      phone: renter.phone || '',
                      email: renter.email || ''
                    },
                    {
                      rentalStartDate: productItem?.rentalPeriod?.startDate
                        ? new Date(productItem?.rentalPeriod?.startDate).toLocaleDateString('vi-VN')
                        : 'N/A',
                      rentalEndDate: productItem?.rentalPeriod?.endDate
                        ? new Date(productItem?.rentalPeriod?.endDate).toLocaleDateString('vi-VN')
                        : 'N/A',
                      notes: outboundShipment.contactInfo?.notes || ''
                    }
                  );
                } catch (emailErr) {
                  console.error(`        ⚠️ Failed to send DELIVERY email:`, emailErr.message);
                }
              } catch (notifErr) {
                console.error(
                  `        ⚠️ Failed to handle DELIVERY notification:`,
                  notifErr.message
                );
              }
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
            // ✅ Find the return batch for this product's return date
            const returnDate = productItem?.rentalPeriod?.endDate
              ? new Date(productItem.rentalPeriod.endDate).toISOString().split('T')[0]
              : null;

            let returnBatch = null;
            if (returnDate && subOrder.deliveryBatches && subOrder.deliveryBatches.length > 0) {
              returnBatch = subOrder.deliveryBatches.find(
                (batch) =>
                  batch.deliveryDate === returnDate &&
                  batch.products.some((pid) => pid.toString() === productItem._id.toString())
              );
            }

            // RETURN shipment fee is always 0đ (renter pays shipping for return)
            let returnShipmentFee = 0;

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
                streetAddress: renterDeliveryAddress.streetAddress || '',
                ward: renterDeliveryAddress.ward || '',
                district: renterDeliveryAddress.district || '',
                city: renterDeliveryAddress.city || '',
                province: renterDeliveryAddress.province || '',
                coordinates: renterDeliveryAddress.coordinates || {}
              },
              contactInfo: {
                name:
                  renterDeliveryAddress.contactName ||
                  renter.profile?.fullName ||
                  renter.profile?.firstName ||
                  'Renter',
                phone: renterDeliveryAddress.contactPhone || renter.phone || '',
                notes: `Trả hàng thuê: ${product.name || 'sản phẩm'}`
              },
              customerInfo: {
                userId: renter._id,
                name:
                  renterDeliveryAddress.contactName ||
                  renter.profile?.fullName ||
                  renter.profile?.firstName ||
                  'Renter',
                phone: renterDeliveryAddress.contactPhone || renter.phone || '',
                email: renter.email || ''
              },
              fee: returnShipmentFee,
              scheduledAt: productItem?.rentalPeriod?.endDate,
              status: 'PENDING'
            };

            const returnShipment = await this.createShipment(returnPayload);

            // Create ShipmentProof document for this shipment
            const returnProof = new ShipmentProof({
              shipment: returnShipment._id,
              imageBeforeDelivery: '',
              imageAfterDelivery: '',
              notes: `RETURN: ${product.name} | From: ${owner.profile?.fullName || 'Owner'} | To: ${renter.profile?.fullName || 'Renter'} | Date: ${productItem?.rentalPeriod?.endDate}`
            });
            await returnProof.save();

            // Assign shipper if provided
            if (shipperId) {
              returnShipment.shipper = shipperId;
              await returnShipment.save();

              // Send real-time notification and schedule email
              try {
                const NotificationService = require('./notification.service');
                const shipperUser = await User.findById(shipperId).select('_id profile email');

                // Get product info - need to populate if not already
                let productInfo = product;
                if (typeof product === 'string' || !product?.name) {
                  const Product = require('../models/Product');
                  productInfo = await Product.findById(product._id || product).select('name title');
                }
                
                const productName = productInfo?.title || productInfo?.name || 'sản phẩm';
                const ownerName = owner.profile?.firstName || owner.profile?.fullName || 'chủ hàng';
                const renterName = renter.profile?.firstName || renter.profile?.fullName || 'khách hàng';
                const scheduledDateStr = productItem?.rentalPeriod?.endDate 
                  ? new Date(productItem.rentalPeriod.endDate).toLocaleDateString('vi-VN')
                  : 'chưa xác định';
                
                const returnNotif = await NotificationService.createNotification({
                  recipient: shipperId,
                  title: '🔄 Đơn trả hàng mới',
                  message: `Bạn có đơn trả hàng mới: ${ownerName} nhận ${productName} từ ${renterName}. Dự kiến: ${scheduledDateStr}`,
                  type: 'SHIPMENT',
                  category: 'INFO',
                  data: {
                    shipmentId: returnShipment.shipmentId,
                    shipmentObjectId: returnShipment._id,
                    shipmentType: 'RETURN',
                    productName: productName,
                    ownerName: ownerName,
                    renterName: renterName,
                    scheduledAt: productItem?.rentalPeriod?.endDate
                  }
                });

                // Emit socket event for real-time update
                if (
                  global.chatGateway &&
                  typeof global.chatGateway.emitNotification === 'function'
                ) {
                  global.chatGateway.emitNotification(shipperId.toString(), returnNotif);
                }

                // Send email notification with complete shipment details
                try {
                  await sendShipperNotificationEmail(
                    shipperUser,
                    returnShipment,
                    product,
                    {
                      name: renter.profile?.fullName || renter.profile?.firstName || 'Renter',
                      phone: renter.phone || '',
                      email: renter.email || ''
                    },
                    {
                      rentalStartDate: productItem?.rentalPeriod?.startDate
                        ? new Date(productItem?.rentalPeriod?.startDate).toLocaleDateString('vi-VN')
                        : 'N/A',
                      rentalEndDate: productItem?.rentalPeriod?.endDate
                        ? new Date(productItem?.rentalPeriod?.endDate).toLocaleDateString('vi-VN')
                        : 'N/A',
                      notes: returnShipment.contactInfo?.notes || ''
                    }
                  );
                } catch (emailErr) {
                  console.error(`        ⚠️ Failed to send RETURN email:`, emailErr.message);
                }
              } catch (notifErr) {
                console.error(`        ⚠️ Failed to handle RETURN notification:`, notifErr.message);
              }
            }

            createdShipments.push(returnShipment);
            shipmentPairs++;
          } catch (err) {
            console.error(`\n        ❌ RETURN Error DETAILS:`);
            console.error(`        Error occurred at step: creating RETURN shipment`);
            console.error(`        Message:`, err.message);
            console.error(`        Type:`, err.constructor.name);

            // Log Mongoose validation errors
            if (err.errors) {
              console.error(
                `        Mongoose Validation Errors:`,
                Object.keys(err.errors).reduce((acc, key) => {
                  acc[key] = err.errors[key].message;
                  return acc;
                }, {})
              );
            }

            // Log the full error for debugging
            console.error(`        Full error:`, err);
            console.error(`        Stack:`, err.stack);
            console.error(`\n`);
            errors.push(
              `RETURN shipment creation failed for product ${product._id}: ${err.message}`
            );
          }
        }
      }

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

  async findShipperInSameArea(ownerAddress) {
    try {
      if (!ownerAddress) {
        console.warn('⚠️ findShipperInSameArea: ownerAddress is null/undefined');
        return null;
      }

      let shipper = null;

      if (ownerAddress.district) {
        // Tìm shipper cùng district
        shipper = await User.findOne({
          role: 'SHIPPER',
          'address.district': ownerAddress.district,
          status: 'ACTIVE'
        }).select('_id email phone profile address');

        if (shipper) {
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

  async cancelShipmentPickup(shipmentId) {
    const shipment = await Shipment.findById(shipmentId).populate({
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

    // Only allow cancel if shipment is PENDING or SHIPPER_CONFIRMED
    if (!['PENDING', 'SHIPPER_CONFIRMED'].includes(shipment.status)) {
      throw new Error(
        `Cannot cancel shipment with status ${shipment.status}. Must be PENDING or SHIPPER_CONFIRMED.`
      );
    }

    // Get owner and renter info
    const subOrder = shipment.subOrder;
    if (!subOrder) throw new Error('SubOrder not found for shipment');

    const owner = subOrder.owner;
    const renter = subOrder.masterOrder?.renter;

    if (!owner) throw new Error('Owner not found');
    if (!renter) throw new Error('Renter not found');

    // 1. Update shipment status to CANCELLED
    shipment.status = 'CANCELLED';
    shipment.tracking = shipment.tracking || {};
    shipment.tracking.failureReason = 'Shipper cannot pickup from owner';
    await shipment.save();

    // 2. Update suborder status to CANCELLED
    subOrder.status = 'CANCELLED';
    await subOrder.save();

    // 3. Penalize owner: creditScore -20
    if (owner.creditScore === undefined) owner.creditScore = 100;
    owner.creditScore = Math.max(0, owner.creditScore - 20);
    await owner.save();

    // 4. Reward renter: loyaltyPoints +25
    if (renter.loyaltyPoints === undefined) renter.loyaltyPoints = 0;
    renter.loyaltyPoints += 25;
    await renter.save();

    // 5. Refund rental + deposit to renter (no shipping fee refund)
    try {
      const rentalAmount = subOrder.pricing?.subtotalRental || 0;
      const depositAmount = subOrder.pricing?.subtotalDeposit || 0;
      const totalRefund = rentalAmount + depositAmount;

      if (totalRefund > 0) {
        const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
        const transferResult = await SystemWalletService.transferToUser(
          adminId,
          renter._id,
          totalRefund,
          `Refund (rental + deposit) for cancelled shipment ${shipment.shipmentId}`
        );
      } else {
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
    } catch (err) {
      console.error(`   ⚠️  Notification failed: ${err.message}`);
    }

    return shipment;
  }

  async rejectDelivery(shipmentId, payload = {}) {
    const shipment = await Shipment.findById(shipmentId).populate({
      path: 'subOrder',
      populate: [
        { path: 'owner', select: '_id profile email' },
        {
          path: 'masterOrder',
          select: '_id renter rentalPeriod',
          populate: { path: 'renter', select: '_id profile email creditScore loyaltyPoints' }
        }
      ]
    });

    if (!shipment) throw new Error('Shipment not found');

    const { reason = 'UNKNOWN', notes = '' } = payload;

    // Only allow reject if shipment is IN_TRANSIT (not yet delivered)
    if (shipment.status !== 'IN_TRANSIT') {
      throw new Error(
        `Cannot reject delivery. Shipment must be in IN_TRANSIT status (current: ${shipment.status}).`
      );
    }

    const subOrder = shipment.subOrder;
    const masterOrder = subOrder.masterOrder;
    const renter = masterOrder?.renter;

    // 1. Handle NO_CONTACT case - shipper cannot contact renter during delivery return
    if (reason === 'NO_CONTACT' && shipment.productIndex !== undefined) {
      try {
        // Update product status to RENTER_NO_SHOW
        subOrder.products[shipment.productIndex].productStatus = 'RENTER_NO_SHOW';

        // Determine subOrder status
        const productStatuses = subOrder.products.map((p) => p.productStatus);
        const hasRenterNoShow = productStatuses.includes('RENTER_NO_SHOW');
        const hasReadyForContract = productStatuses.includes('READY_FOR_CONTRACT');
        const allRenterNoShow =
          hasRenterNoShow && productStatuses.every((status) => status === 'RENTER_NO_SHOW');

        let subOrderStatus = 'CANCELLED_BY_RENTER_NO_SHOW';
        if (hasRenterNoShow && hasReadyForContract) {
          subOrderStatus = 'PARTIALLY_CANCELLED_BY_RENTER';
        } else if (allRenterNoShow) {
          subOrderStatus = 'CANCELLED_BY_RENTER_NO_SHOW';
        }

        subOrder.status = subOrderStatus;

        // Deduct 1 day rental from renter
        const product = subOrder.products[shipment.productIndex];
        const rentalAmount = product?.totalRental || 0;
        const depositAmount = product?.totalDeposit || 0;
        const rentalDays = product?.rentalPeriod?.duration?.value || 1;
        const oneDayRental = Math.ceil(rentalAmount / rentalDays);

        // Determine what to deduct based on payment method
        const deliveryMethod = masterOrder?.deliveryMethod; // PICKUP or DELIVERY
        const paymentMethod = masterOrder?.paymentMethod; // WALLET, BANK_TRANSFER, PAYOS, COD

        let deductAmount = 0;
        let deductSource = '';

        // If COD/PICKUP or direct payment, deduct from deposit
        if (deliveryMethod === 'PICKUP' || paymentMethod === 'COD') {
          deductAmount = Math.min(oneDayRental, depositAmount);
          deductSource = `deposit (${deductAmount} VND)`;
        } else {
          // Online payment, deduct from rental
          deductAmount = oneDayRental;
          deductSource = `rental (${deductAmount} VND)`;
        }

        const totalProductAmount = rentalAmount + depositAmount;
        const refundAmount = Math.max(0, totalProductAmount - deductAmount);

        // Update suborder
        await subOrder.save();

        // Deduct 20 creditScore from renter
        if (renter && renter.creditScore !== undefined) {
          renter.creditScore = Math.max(0, renter.creditScore - 20);
          await renter.save();
        }

        // Refund remainder to renter
        if (refundAmount > 0 && renter && renter._id) {
          const SystemWalletService = require('./systemWallet.service');
          const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
          const transferResult = await SystemWalletService.transferToUser(
            adminId,
            renter._id,
            refundAmount,
            `Refund for renter no-show - shipment ${shipment.shipmentId}`
          );
        }

        // Transfer 80% of 1 day rental to owner (frozen for 24h)
        try {
          const ownerRewardAmount = Math.floor(oneDayRental * 0.9); // 80% of 1 day rental
          if (ownerRewardAmount > 0 && subOrder.owner && subOrder.owner._id) {
            const SystemWalletService = require('./systemWallet.service');
            const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
            const ownerTransferResult = await SystemWalletService.transferToUserFrozen(
              adminId,
              subOrder.owner._id,
              ownerRewardAmount,
              `Compensation for renter no-show during return - shipment ${shipment.shipmentId}`,
              10 * 1000 // 10 seconds for testing
            );
          }
        } catch (ownerErr) {
          console.error(`   ⚠️  Owner reward transfer failed: ${ownerErr.message}`);
        }

        // Update MasterOrder status if needed
        if (allRenterNoShow) {
          try {
            const MasterOrder = require('../models/MasterOrder');
            const SubOrder = require('../models/SubOrder');
            const masterOrderId = masterOrder._id;

            if (masterOrderId) {
              const allSubOrders = await SubOrder.find({ masterOrder: masterOrderId });
              const hasCancelledByRenterNoShow = allSubOrders.some(
                (sub) => sub.status === 'CANCELLED_BY_RENTER_NO_SHOW'
              );
              const hasReadyForContractStatus = allSubOrders.some(
                (sub) => sub.status === 'READY_FOR_CONTRACT'
              );
              const allCancelledByRenter = allSubOrders.every(
                (sub) => sub.status === 'CANCELLED_BY_RENTER_NO_SHOW'
              );

              if (hasCancelledByRenterNoShow && hasReadyForContractStatus) {
                // Mix of cancelled and ready
                masterOrder.status = 'PARTIALLY_CANCELLED_BY_RENTER';
                await masterOrder.save();
              } else if (allCancelledByRenter) {
                // All suborders cancelled
                masterOrder.status = 'CANCELLED_BY_RENTER_NO_SHOW';
                await masterOrder.save();
              }
            }
          } catch (moErr) {
            console.error('   ⚠️ Failed to update MasterOrder status:', moErr.message || moErr);
          }
        }

        // Update shipment status to CANCELLED
        shipment.status = 'CANCELLED';
        shipment.tracking = shipment.tracking || {};
        shipment.tracking.cancelledAt = new Date();
        shipment.tracking.cancelReason =
          'Renter no-show - could not contact during return delivery';
        shipment.tracking.notes = notes;
        await shipment.save();
      } catch (err) {
        console.error(`   ⚠️  NO_CONTACT processing failed: ${err.message}`);
        throw new Error(`NO_CONTACT processing error: ${err.message}`);
      }
    } else {
      // 2. Handle PRODUCT_DAMAGED case
      shipment.status = 'DELIVERY_FAILED';
      shipment.tracking = shipment.tracking || {};
      shipment.tracking.failureReason = 'Sản phẩm có lỗi';
      shipment.tracking.notes = notes;
      await shipment.save();

      // Update product status in SubOrder to DELIVERY_FAILED
      if (shipment.productIndex !== undefined && subOrder.products[shipment.productIndex]) {
        subOrder.products[shipment.productIndex].productStatus = 'DELIVERY_FAILED';
        await subOrder.save();
        console.log(`✅ Updated product status to DELIVERY_FAILED for product at index ${shipment.productIndex}`);
      }
    }

    // 5. Send notification to owner
    try {
      const NotificationService = require('./notification.service');

      let ownerTitle = '';
      let ownerMessage = '';
      
      if (reason === 'NO_CONTACT') {
        ownerTitle = '⚠️ Không liên lạc được với renter';
        ownerMessage = `Shipper không thể liên lạc được với renter khi giao hàng cho shipment ${shipment.shipmentId} (SubOrder: ${subOrder.subOrderNumber}).`;
        if (notes && notes.trim()) {
          ownerMessage += `\n\nChi tiết: ${notes}`;
        }
        ownerMessage += '\n\nRenter đã bị trừ điểm tín nhiệm và một phần tiền thuê. Bạn sẽ được bồi thường.';
      } else if (reason === 'PRODUCT_DAMAGED') {
        ownerTitle = '⚠️ Sản phẩm có lỗi';
        ownerMessage = `Renter không nhận hàng do sản phẩm có lỗi từ shipment ${shipment.shipmentId} (SubOrder: ${subOrder.subOrderNumber}).`;
        if (notes && notes.trim()) {
          ownerMessage += `\n\nLý do từ shipper: ${notes}`;
        }
        ownerMessage += '\n\nVui lòng kiểm tra và liên hệ với renter để giải quyết vấn đề.';
      } else {
        ownerTitle = '⚠️ Renter không nhận hàng';
        ownerMessage = `Renter không nhận hàng từ shipment ${shipment.shipmentId}.`;
        if (notes && notes.trim()) {
          ownerMessage += ` Lý do: ${notes}`;
        }
      }

      await NotificationService.createNotification({
        recipient: subOrder.owner._id,
        title: ownerTitle,
        message: ownerMessage,
        type: 'SHIPMENT',
        category: 'WARNING',
        data: {
          shipmentId: shipment.shipmentId,
          subOrderNumber: subOrder.subOrderNumber,
          reason: reason,
          notes: notes,
          reasonText: reason === 'NO_CONTACT' ? 'Không liên lạc được với renter' : 'Sản phẩm có lỗi'
        }
      });
      
      console.log(`✅ Sent notification to owner: ${ownerTitle}`);
    } catch (err) {
      console.error(`   ⚠️  Notification to owner failed: ${err.message}`);
    }

    // 6. Send notification to renter
    try {
      const NotificationService = require('./notification.service');

      let renterMessage = `Đơn hàng ${subOrder.subOrderNumber} đã được ghi nhận là renter không nhận hàng.`;
      if (reason === 'NO_CONTACT') {
        const product = subOrder.products[shipment.productIndex];
        const depositAmount = product?.totalDeposit || 0;
        const rentalAmount = product?.totalRental || 0;
        const rentalDays = product?.rentalPeriod?.duration?.value || 1;
        const oneDayRental = Math.ceil(rentalAmount / rentalDays);

        const paymentMethod = masterOrder?.paymentMethod;
        const deliveryMethod = masterOrder?.deliveryMethod;

        let deductInfo = '';
        if (deliveryMethod === 'PICKUP' || paymentMethod === 'COD') {
          const deductFromDeposit = Math.min(oneDayRental, depositAmount);
          deductInfo = `Tiền cọc (${deductFromDeposit} VND)`;
        } else {
          deductInfo = `Tiền thuê 1 ngày (${oneDayRental} VND)`;
        }

        renterMessage += ` Shipper không liên lạc được với bạn. ${deductInfo} sẽ bị trừ. CreditScore của bạn bị trừ 20 điểm. Phần còn lại sẽ được hoàn lại vào ví của bạn.`;
      } else {
        renterMessage += ` Vui lòng liên hệ với chúng tôi để giải quyết.`;
      }

      await NotificationService.createNotification({
        recipient: renter._id,
        title: reason === 'NO_CONTACT' ? '⚠️ Renter không nhận hàng' : '⚠️ Sản phẩm có lỗi',
        message: renterMessage,
        type: 'SHIPMENT',
        category: reason === 'NO_CONTACT' ? 'WARNING' : 'WARNING',
        data: {
          shipmentId: shipment.shipmentId,
          subOrderNumber: subOrder.subOrderNumber,
          reason: reason
        }
      });
    } catch (err) {
      console.error(`   ⚠️  Notification to renter failed: ${err.message}`);
    }

    return shipment;
  }

  async ownerNoShow(shipmentId, payload = {}) {
    const shipment = await Shipment.findById(shipmentId).populate({
      path: 'subOrder',
      populate: [
        { path: 'owner', select: '_id profile email creditScore' },
        {
          path: 'masterOrder',
          select: '_id renter rentalPeriod',
          populate: { path: 'renter', select: '_id profile email loyaltyPoints' }
        }
      ]
    });

    if (!shipment) throw new Error('Shipment not found');

    const { notes = '' } = payload;

    // Only allow if shipment is SHIPPER_CONFIRMED (shipper has accepted, waiting to pickup)
    if (shipment.status !== 'SHIPPER_CONFIRMED') {
      throw new Error(
        `Cannot report owner no-show. Shipment must be in SHIPPER_CONFIRMED status (current: ${shipment.status}).`
      );
    }

    const subOrder = shipment.subOrder;
    const owner = subOrder.owner;
    const renter = subOrder.masterOrder?.renter;

    try {
      // 1. Update product status to OWNER_NO_SHOW
      if (shipment.productIndex !== undefined) {
        subOrder.products[shipment.productIndex].productStatus = 'OWNER_NO_SHOW';
      }

      // 2. Analyze product statuses to determine subOrder status
      const productStatuses = subOrder.products.map((p) => p.productStatus);
      const hasOwnerNoShow = productStatuses.includes('OWNER_NO_SHOW');
      const hasConfirmed = productStatuses.includes('CONFIRMED');
      const allOwnerNoShow =
        hasOwnerNoShow && productStatuses.every((status) => status === 'OWNER_NO_SHOW');

      // Determine subOrder status
      let subOrderStatus = 'CANCELLED_BY_OWNER_NO_SHOW'; // Default if all are no-show
      if (hasOwnerNoShow && hasConfirmed) {
        // Mix of CONFIRMED and OWNER_NO_SHOW
        subOrderStatus = 'PARTIALLY_CANCELLED_BY_OWNER';
      } else if (allOwnerNoShow) {
        // All products are OWNER_NO_SHOW
        subOrderStatus = 'CANCELLED_BY_OWNER_NO_SHOW';
      }

      subOrder.status = subOrderStatus;
      await subOrder.save();

      // 3. Update MasterOrder status if all suborders are cancelled
      if (allOwnerNoShow) {
        try {
          const MasterOrder = require('../models/MasterOrder');
          const SubOrder = require('../models/SubOrder');
          const masterOrderId = subOrder.masterOrder;

          if (masterOrderId) {
            const allSubOrders = await SubOrder.find({ masterOrder: masterOrderId });
            const allCancelled = allSubOrders.every(
              (sub) => sub.status === 'CANCELLED_BY_OWNER_NO_SHOW' || sub.status === 'CANCELLED'
            );

            if (allCancelled) {
              const masterOrder = await MasterOrder.findById(masterOrderId);
              if (masterOrder && masterOrder.status !== 'CANCELLED_BY_OWNER_NO_SHOW') {
                masterOrder.status = 'CANCELLED_BY_OWNER_NO_SHOW';
                await masterOrder.save();
              }
            }
          }
        } catch (moErr) {
          console.error('   ⚠️ Failed to update MasterOrder status:', moErr.message || moErr);
        }
      }

      // 4. Deduct 20 creditScore from owner
      if (owner && owner.creditScore !== undefined) {
        owner.creditScore = Math.max(0, owner.creditScore - 20);
        await owner.save();
      }

      // 5. Increase 25 loyaltyPoints for renter
      if (renter && renter.loyaltyPoints !== undefined) {
        renter.loyaltyPoints += 25;
        await renter.save();
      }

      // 6. Refund (rental + deposit) to renter - no shipping fee refund
      const product =
        shipment.productIndex !== undefined ? subOrder.products[shipment.productIndex] : null;
      const rentalAmount = product?.totalRental || 0;
      const depositAmount = product?.totalDeposit || 0;
      const totalRefund = rentalAmount + depositAmount;

      if (totalRefund > 0 && renter && renter._id) {
        const SystemWalletService = require('./systemWallet.service');
        const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
        const transferResult = await SystemWalletService.transferToUser(
          adminId,
          renter._id,
          totalRefund,
          `Refund for owner no-show - shipment ${shipment.shipmentId}`
        );
      }

      // 7. Update shipment status to CANCELLED
      shipment.status = 'CANCELLED';
      shipment.tracking = shipment.tracking || {};
      shipment.tracking.cancelledAt = new Date();
      shipment.tracking.cancelReason = 'Owner no-show - did not appear for delivery';
      shipment.tracking.notes = notes;
      await shipment.save();

      // 8. Send notification to renter
      try {
        const NotificationService = require('./notification.service');
        const notificationTitle = allOwnerNoShow
          ? '⚠️ Đơn hàng bị hủy do chủ không đến giao'
          : '⚠️ Đơn hàng bị hủy một phần do chủ không đến giao';
        const notificationMessage = allOwnerNoShow
          ? `Chủ thuê không có mặt để giao hàng. Đơn hàng của bạn đã bị hủy hoàn toàn. Tiền thuê (${rentalAmount} VND) + tiền cọc (${depositAmount} VND) = ${totalRefund} VND sẽ được hoàn lại vào ví của bạn.`
          : `Chủ thuê không có mặt để giao một phần sản phẩm. Đơn hàng của bạn đã bị hủy một phần. Tiền thuê (${rentalAmount} VND) + tiền cọc (${depositAmount} VND) = ${totalRefund} VND sẽ được hoàn lại vào ví của bạn.`;

        await NotificationService.createNotification({
          recipient: renter._id,
          title: notificationTitle,
          message: notificationMessage,
          type: 'SHIPMENT',
          category: 'WARNING',
          data: {
            shipmentId: shipment.shipmentId,
            subOrderNumber: subOrder.subOrderNumber,
            reason: 'OWNER_NO_SHOW',
            refundAmount: totalRefund,
            loyaltyPointsAdded: 25,
            isPartialCancel: !allOwnerNoShow
          }
        });
      } catch (err) {
        console.error(`   ⚠️  Notification to renter failed: ${err.message}`);
      }

      // 9. Send notification to owner
      try {
        const NotificationService = require('./notification.service');
        const ownerNotificationTitle = allOwnerNoShow
          ? '⚠️ Đơn hàng bị hủy - bạn không đến giao hàng'
          : '⚠️ Đơn hàng bị hủy một phần - bạn không đến giao một số sản phẩm';
        const ownerNotificationMessage = allOwnerNoShow
          ? `Bạn không có mặt để giao hàng cho shipper. Đơn hàng đã bị hủy hoàn toàn. CreditScore của bạn đã bị trừ 20 điểm.`
          : `Bạn không có mặt để giao một phần sản phẩm cho shipper. Đơn hàng bị hủy một phần. CreditScore của bạn đã bị trừ 20 điểm.`;

        await NotificationService.createNotification({
          recipient: owner._id,
          title: ownerNotificationTitle,
          message: ownerNotificationMessage,
          type: 'SHIPMENT',
          category: 'WARNING',
          data: {
            shipmentId: shipment.shipmentId,
            subOrderNumber: subOrder.subOrderNumber,
            reason: 'OWNER_NO_SHOW',
            creditScoreDeducted: 20,
            isPartialCancel: !allOwnerNoShow
          }
        });
      } catch (err) {
        console.error(`   ⚠️  Notification to owner failed: ${err.message}`);
      }

      return shipment;
    } catch (err) {
      console.error(`   ❌ Owner no-show processing failed: ${err.message}`);
      throw new Error(`Owner no-show processing error: ${err.message}`);
    }
  }

  /**
   * Renter no-show - shipper cannot contact renter during delivery
   * Updates:
   *   - Product status → RENTER_NO_SHOW
   *   - SubOrder status → CANCELLED_BY_RENTER_NO_SHOW
   *   - Renter creditScore -= 20
   *   - Deduct 1 day rental (method-dependent) from renter
   *   - Refund remainder to renter
   */
  async renterNoShow(shipmentId, payload = {}) {
    const shipment = await Shipment.findById(shipmentId).populate({
      path: 'subOrder',
      populate: [
        { path: 'owner', select: '_id profile email' },
        {
          path: 'masterOrder',
          select: '_id renter rentalPeriod deliveryMethod paymentMethod',
          populate: { path: 'renter', select: '_id profile email creditScore' }
        }
      ]
    });

    if (!shipment) throw new Error('Shipment not found');

    const { notes = '' } = payload;

    // Only allow if shipment is IN_TRANSIT (shipper is delivering)
    if (shipment.status !== 'IN_TRANSIT') {
      throw new Error(
        `Cannot report renter no-show. Shipment must be in IN_TRANSIT status (current: ${shipment.status}).`
      );
    }

    // Only for DELIVERY shipments
    if (shipment.type !== 'DELIVERY') {
      throw new Error(
        `Cannot report renter no-show for RETURN shipment. Use only for DELIVERY shipments.`
      );
    }

    const subOrder = shipment.subOrder;
    const masterOrder = subOrder.masterOrder;
    const renter = masterOrder?.renter;

    try {
      // 1. Update product status to RENTER_NO_SHOW
      if (shipment.productIndex !== undefined) {
        subOrder.products[shipment.productIndex].productStatus = 'RENTER_NO_SHOW';
      }

      // 2. Determine subOrder status
      const productStatuses = subOrder.products.map((p) => p.productStatus);
      const hasRenterNoShow = productStatuses.includes('RENTER_NO_SHOW');
      const hasConfirmed = productStatuses.includes('CONFIRMED');
      const allRenterNoShow =
        hasRenterNoShow && productStatuses.every((status) => status === 'RENTER_NO_SHOW');

      let subOrderStatus = 'CANCELLED_BY_RENTER_NO_SHOW';
      if (hasRenterNoShow && hasConfirmed) {
        subOrderStatus = 'PARTIALLY_CANCELLED_BY_RENTER';
      } else if (allRenterNoShow) {
        subOrderStatus = 'CANCELLED_BY_RENTER_NO_SHOW';
      }

      subOrder.status = subOrderStatus;
      await subOrder.save();

      // 3. Update MasterOrder status if needed
      if (allRenterNoShow) {
        try {
          const MasterOrder = require('../models/MasterOrder');
          const SubOrder = require('../models/SubOrder');
          const masterOrderId = masterOrder._id;

          if (masterOrderId) {
            const allSubOrders = await SubOrder.find({ masterOrder: masterOrderId });
            const hasCancelledByRenterNoShow = allSubOrders.some(
              (sub) => sub.status === 'CANCELLED_BY_RENTER_NO_SHOW'
            );
            const hasReadyForContract = allSubOrders.some(
              (sub) => sub.status === 'READY_FOR_CONTRACT'
            );
            const allCancelledByRenter = allSubOrders.every(
              (sub) => sub.status === 'CANCELLED_BY_RENTER_NO_SHOW'
            );

            if (hasCancelledByRenterNoShow && hasReadyForContract) {
              // Mix of cancelled and ready
              masterOrder.status = 'PARTIALLY_CANCELLED_BY_RENTER';
              await masterOrder.save();
            } else if (allCancelledByRenter) {
              // All suborders cancelled
              masterOrder.status = 'CANCELLED_BY_RENTER_NO_SHOW';
              await masterOrder.save();
            }
          }
        } catch (moErr) {
          console.error('   ⚠️ Failed to update MasterOrder status:', moErr.message || moErr);
        }
      }

      // 4. Deduct 1 day rental from renter
      const product =
        shipment.productIndex !== undefined ? subOrder.products[shipment.productIndex] : null;
      const rentalAmount = product?.totalRental || 0;
      const depositAmount = product?.totalDeposit || 0;
      const rentalDays = product?.rentalPeriod?.duration?.value || 1;
      const oneDayRental = Math.ceil(rentalAmount / rentalDays);

      // Determine what to deduct based on payment method
      const deliveryMethod = masterOrder?.deliveryMethod; // PICKUP or DELIVERY
      const paymentMethod = masterOrder?.paymentMethod; // WALLET, BANK_TRANSFER, PAYOS, COD

      let deductAmount = 0;
      let deductSource = '';

      // If COD/PICKUP or direct payment, deduct from deposit
      if (deliveryMethod === 'PICKUP' || paymentMethod === 'COD') {
        deductAmount = Math.min(oneDayRental, depositAmount);
        deductSource = `deposit (${deductAmount} VND)`;
      } else {
        // Online payment, deduct from rental
        deductAmount = oneDayRental;
        deductSource = `rental (${deductAmount} VND)`;
      }

      const totalProductAmount = rentalAmount + depositAmount;
      const refundAmount = Math.max(0, totalProductAmount - deductAmount);

      // 5. Deduct 20 creditScore from renter
      if (renter && renter.creditScore !== undefined) {
        renter.creditScore = Math.max(0, renter.creditScore - 20);
        await renter.save();
      }

      // 6. Refund remainder to renter
      if (refundAmount > 0 && renter && renter._id) {
        const SystemWalletService = require('./systemWallet.service');
        const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
        const transferResult = await SystemWalletService.transferToUser(
          adminId,
          renter._id,
          refundAmount,
          `Refund for renter no-show - shipment ${shipment.shipmentId}`
        );
      }

      // 7. Transfer 80% of 1 day rental to owner
      try {
        const ownerRewardAmount = Math.floor(oneDayRental * 0.9); // 80% of 1 day rental
        if (ownerRewardAmount > 0 && subOrder.owner && subOrder.owner._id) {
          const SystemWalletService = require('./systemWallet.service');
          const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
          const ownerTransferResult = await SystemWalletService.transferToUserFrozen(
            adminId,
            subOrder.owner._id,
            ownerRewardAmount,
            `Compensation for renter no-show - shipment ${shipment.shipmentId}`,
            10 * 1000 // 10 seconds for testing
          );
        }
      } catch (ownerErr) {
        console.error(`   ⚠️  Owner reward transfer failed: ${ownerErr.message}`);
      }

      // 8. Update shipment status to CANCELLED
      shipment.status = 'CANCELLED';
      shipment.tracking = shipment.tracking || {};
      shipment.tracking.cancelledAt = new Date();
      shipment.tracking.cancelReason = 'Renter no-show - could not contact during delivery';
      shipment.tracking.notes = notes;
      await shipment.save();

      // 9. Send notification to renter
      try {
        const NotificationService = require('./notification.service');
        const notificationTitle = allRenterNoShow
          ? '⚠️ Đơn hàng bị hủy - không liên lạc được với bạn'
          : '⚠️ Đơn hàng bị hủy một phần - không liên lạc được với bạn';
        const notificationMessage = allRenterNoShow
          ? `Shipper không thể liên lạc được với bạn để giao hàng. Đơn hàng đã bị hủy hoàn toàn. Đã trừ ${deductSource} từ tài khoản của bạn. Phần còn lại ${refundAmount} VND sẽ được hoàn lại vào ví của bạn. CreditScore của bạn đã bị trừ 20 điểm.`
          : `Shipper không thể liên lạc được với bạn để giao một phần sản phẩm. Đơn hàng bị hủy một phần. Đã trừ ${deductSource} từ tài khoản của bạn. Phần còn lại ${refundAmount} VND sẽ được hoàn lại vào ví của bạn. CreditScore của bạn đã bị trừ 20 điểm.`;

        await NotificationService.createNotification({
          recipient: renter._id,
          title: notificationTitle,
          message: notificationMessage,
          type: 'SHIPMENT',
          category: 'WARNING',
          data: {
            shipmentId: shipment.shipmentId,
            subOrderNumber: subOrder.subOrderNumber,
            reason: 'RENTER_NO_SHOW',
            deductAmount: deductAmount,
            refundAmount: refundAmount,
            creditScoreDeducted: 20,
            isPartialCancel: !allRenterNoShow
          }
        });
      } catch (err) {
        console.error(`   ⚠️  Notification to renter failed: ${err.message}`);
      }

      // 9. Send notification to owner
      try {
        const NotificationService = require('./notification.service');
        const ownerNotificationTitle = allRenterNoShow
          ? '⚠️ Đơn hàng bị hủy - không liên lạc được với renter'
          : '⚠️ Đơn hàng bị hủy một phần - không liên lạc được với renter';
        const ownerNotificationMessage = allRenterNoShow
          ? `Shipper không thể liên lạc được với renter để giao hàng. Đơn hàng bị hủy hoàn toàn.`
          : `Shipper không thể liên lạc được với renter để giao một phần sản phẩm. Đơn hàng bị hủy một phần.`;

        await NotificationService.createNotification({
          recipient: subOrder.owner._id,
          title: ownerNotificationTitle,
          message: ownerNotificationMessage,
          type: 'SHIPMENT',
          category: 'INFO',
          data: {
            shipmentId: shipment.shipmentId,
            subOrderNumber: subOrder.subOrderNumber,
            reason: 'RENTER_NO_SHOW',
            isPartialCancel: !allRenterNoShow
          }
        });
      } catch (err) {
        console.error(`   ⚠️  Notification to owner failed: ${err.message}`);
      }

      return shipment;
    } catch (err) {
      console.error(`   ❌ Renter no-show processing failed: ${err.message}`);
      throw new Error(`Renter no-show processing error: ${err.message}`);
    }
  }

  /**
   * Return failed - shipper cannot contact renter during return shipment delivery
   * Updates:
   *   - Product status → RETURN_FAILED
   *   - SubOrder status → RETURN_FAILED
   *   - Owner opens dispute to resolve
   *   - After dispute resolution:
   *     * SubOrder status → RETURNING (back to normal)
   *     * MasterOrder status → stays same (ACTIVE/RETURNING/DELIVERING)
   *     * When all return complete → MasterOrder = COMPLETED
   */
  async returnFailed(shipmentId, payload = {}) {
    const shipment = await Shipment.findById(shipmentId).populate({
      path: 'subOrder',
      populate: [
        { path: 'owner', select: '_id profile email' },
        {
          path: 'masterOrder',
          select: '_id renter rentalPeriod',
          populate: { path: 'renter', select: '_id profile email' }
        }
      ]
    });

    if (!shipment) throw new Error('Shipment not found');

    const { notes = '' } = payload;

    // Only allow if shipment is SHIPPER_CONFIRMED (before pickup) or IN_TRANSIT (during pickup)
    if (!['SHIPPER_CONFIRMED', 'IN_TRANSIT'].includes(shipment.status)) {
      throw new Error(
        `Cannot report return failed. Shipment must be in SHIPPER_CONFIRMED or IN_TRANSIT status (current: ${shipment.status}).`
      );
    }

    // Only for RETURN shipments
    if (shipment.type !== 'RETURN') {
      throw new Error(
        `Cannot report return failed for DELIVERY shipment. Use only for RETURN shipments.`
      );
    }

    const subOrder = shipment.subOrder;
    const masterOrder = subOrder.masterOrder;
    const owner = subOrder.owner;
    const renter = masterOrder?.renter;

    try {
      // 1. Update all product status to RETURN_FAILED
      subOrder.products.forEach((product) => {
        product.productStatus = 'RETURN_FAILED';
      });

      // 2. Update subOrder status to RETURN_FAILED
      subOrder.status = 'RETURN_FAILED';
      await subOrder.save();

      // 3. Update MasterOrder status if needed
      try {
        const MasterOrder = require('../models/MasterOrder');
        const SubOrder = require('../models/SubOrder');
        const masterOrderId = masterOrder._id;

        if (masterOrderId) {
          const allSubOrders = await SubOrder.find({ masterOrder: masterOrderId });
          const hasReturnFailed = allSubOrders.some((sub) => sub.status === 'RETURN_FAILED');
          const allReturnFailed = allSubOrders.every((sub) => sub.status === 'RETURN_FAILED');

          if (hasReturnFailed && !allReturnFailed) {
            // Some suborders have RETURN_FAILED, some don't
            masterOrder.status = 'PARTIALLY_RETURN_FAILED';
            await masterOrder.save();
          } else if (allReturnFailed) {
            // All suborders have RETURN_FAILED
            masterOrder.status = 'RETURN_FAILED';
            await masterOrder.save();
          }
        }
      } catch (moErr) {
        console.error('   ⚠️ Failed to update MasterOrder status:', moErr.message || moErr);
      }

      // 4. Update shipment status to CANCELLED
      shipment.status = 'CANCELLED';
      shipment.tracking = shipment.tracking || {};
      shipment.tracking.cancelledAt = new Date();
      shipment.tracking.cancelReason = 'Return failed - could not contact renter during return';
      shipment.tracking.notes = notes;
      await shipment.save();

      // 5. Send notification to owner (to open dispute)
      try {
        const NotificationService = require('./notification.service');
        await NotificationService.createNotification({
          recipient: owner._id,
          title: '⚠️ Trả hàng thất bại - không liên lạc được với renter',
          message: `Shipper không thể liên lạc được với renter để nhận hàng trả. Vui lòng mở tranh chấp để giải quyết vấn đề này.`,
          type: 'SHIPMENT',
          category: 'WARNING',
          data: {
            shipmentId: shipment.shipmentId,
            subOrderNumber: subOrder.subOrderNumber,
            reason: 'RETURN_FAILED',
            action: 'OPEN_DISPUTE'
          }
        });
      } catch (err) {
        console.error(`   ⚠️  Notification to owner failed: ${err.message}`);
      }

      // 6. Penalize renter with -20 creditScore
      try {
        if (renter && renter._id) {
          const currentScore = renter.creditScore || 100;
          renter.creditScore = Math.max(0, currentScore - 20);
          await renter.save();
          console.log(`   ✅ Renter ${renter._id} creditScore reduced by 20 points (${currentScore} → ${renter.creditScore})`);
        }
      } catch (err) {
        console.error(`   ⚠️  Failed to update renter creditScore: ${err.message}`);
      }

      // 7. Compensate owner with 90% of 1 day rental price
      try {
        const Transaction = require('../models/Transaction');
        const Wallet = require('../models/Wallet');
        const SystemWalletService = require('./systemWallet.service');

        // Calculate 1 day rental amount (90% goes to owner)
        const totalRentalAmount = subOrder.pricing?.subtotalRental || 0;
        const rentalDays = subOrder.pricing?.rentalDays || 1;
        const oneDayRental = totalRentalAmount / rentalDays;
        const compensationAmount = Math.floor(oneDayRental * 0.9);

        if (compensationAmount > 0) {
          // Get owner wallet
          let ownerWallet = await Wallet.findOne({ user: owner._id });
          if (!ownerWallet) {
            ownerWallet = new Wallet({ user: owner._id, balance: 0 });
            await ownerWallet.save();
          }

          // Create transaction for owner compensation
          const compensationTxn = new Transaction({
            user: owner._id,
            type: 'COMPENSATION',
            amount: compensationAmount,
            status: 'success',
            description: `Bồi thường 90% tiền thuê 1 ngày do renter không nhận hàng trả`,
            metadata: {
              subOrderId: subOrder._id,
              subOrderNumber: subOrder.subOrderNumber,
              shipmentId: shipment._id,
              reason: 'RETURN_FAILED_RENTER_NO_CONTACT',
              oneDayRental: oneDayRental,
              compensationRate: 0.9
            },
            processedAt: new Date()
          });
          await compensationTxn.save();

          // Update owner wallet balance
          ownerWallet.balance += compensationAmount;
          await ownerWallet.save();

          // Deduct from system wallet
          await SystemWalletService.recordTransaction({
            amount: -compensationAmount,
            type: 'COMPENSATION_PAYOUT',
            description: `Bồi thường cho owner ${owner._id} do renter không nhận hàng trả`,
            metadata: {
              subOrderId: subOrder._id,
              ownerId: owner._id,
              transactionId: compensationTxn._id
            }
          });

          console.log(`   ✅ Owner ${owner._id} compensated ${compensationAmount}đ (90% of 1 day rental)`);
        }
      } catch (err) {
        console.error(`   ⚠️  Failed to compensate owner: ${err.message}`);
      }

      // 8. Send notification to renter
      try {
        const NotificationService = require('./notification.service');
        await NotificationService.createNotification({
          recipient: renter._id,
          title: '⚠️ Trả hàng thất bại',
          message: `Shipper không thể liên lạc được với bạn để nhận hàng trả. Bạn bị trừ 20 điểm creditScore. Chủ sở hữu đang mở tranh chấp để giải quyết vấn đề này.`,
          type: 'SHIPMENT',
          category: 'WARNING',
          data: {
            shipmentId: shipment.shipmentId,
            subOrderNumber: subOrder.subOrderNumber,
            reason: 'RETURN_FAILED',
            creditScorePenalty: -20
          }
        });
      } catch (err) {
        console.error(`   ⚠️  Notification to renter failed: ${err.message}`);
      }

      return shipment;
    } catch (err) {
      console.error(`   ❌ Return failed processing failed: ${err.message}`);
      throw new Error(`Return failed processing error: ${err.message}`);
    }
  }

  /**
   * Send shipper notification email for new shipment assignment
   */
  async sendShipperNotificationEmail(shipperId, shipmentId) {
    try {
      const { sendShipperNotificationEmail } = require('../utils/mailer');

      // Get shipper with email
      const shipper = await User.findById(shipperId).select('email profile phone');
      if (!shipper || !shipper.email) {
        console.warn(`⚠️ Shipper not found or has no email: ${shipperId}`);
        return null;
      }

      // Get shipment with all populated fields
      const shipment = await Shipment.findById(shipmentId).populate({
        path: 'subOrder',
        populate: [
          {
            path: 'masterOrder',
            populate: {
              path: 'renter',
              select: 'email phone profile'
            }
          },
          {
            path: 'owner',
            select: 'email phone profile'
          },
          {
            path: 'products.product',
            select: 'name'
          }
        ]
      });

      if (!shipment) {
        console.warn(`⚠️ Shipment not found: ${shipmentId}`);
        return null;
      }

      // Extract necessary info
      const renter = shipment.subOrder?.masterOrder?.renter;
      const renterInfo = {
        name:
          renter?.profile?.fullName ||
          `${renter?.profile?.firstName || ''} ${renter?.profile?.lastName || ''}`.trim() ||
          'Không rõ',
        phone: renter?.phone || shipment.contactInfo?.phone || 'Không rõ',
        email: renter?.email || 'Không rõ'
      };

      // Get product info - try multiple ways
      let productName = 'Sản phẩm';

      // Try to get from products array using productIndex
      if (shipment.productId) {
        const productItem = shipment.subOrder?.products?.find(
          (p) => p._id?.toString() === shipment.productId?.toString()
        );
        if (productItem?.product?.name) {
          productName = productItem.product.name;
        }
      }

      // If still not found, try productIndex
      if (productName === 'Sản phẩm' && shipment.productIndex !== undefined) {
        const productItem = shipment.subOrder?.products?.[shipment.productIndex];
        if (productItem?.product?.name) {
          productName = productItem.product.name;
        }
      }

      // Get order details
      const orderDetails = {
        rentalStartDate: shipment.subOrder?.rentalPeriod?.startDate
          ? new Date(shipment.subOrder.rentalPeriod.startDate).toLocaleDateString('vi-VN')
          : 'Không rõ',
        rentalEndDate: shipment.subOrder?.rentalPeriod?.endDate
          ? new Date(shipment.subOrder.rentalPeriod.endDate).toLocaleDateString('vi-VN')
          : 'Không rõ',
        notes: shipment.contactInfo?.notes || '(không có)'
      };

      // Send email
      const result = await sendShipperNotificationEmail(
        shipper,
        shipment,
        { name: productName },
        renterInfo,
        orderDetails
      );

      return result;
    } catch (error) {
      console.error(`❌ Error sending shipper notification email: ${error.message}`);
      // Don't throw - email sending is non-critical
      return null;
    }
  }
}

module.exports = new ShipmentService();
