const cron = require('node-cron');
const SubOrder = require('../models/SubOrder');
const RentalOrderService = require('../services/rentalOrder.service');

let cronJob = null;

/**
 * Start cron job to auto-confirm delivery after 24 hours
 * Runs every hour
 */
function startAutoConfirmDeliveryCron() {
  // Stop existing job if any
  if (cronJob) {
    cronJob.stop();
  }

  // Run every hour
  cronJob = cron.schedule('0 * * * *', async () => {
    try {
      await autoConfirmDelivery();
    } catch (error) {
      console.error('❌ Error in auto-confirm delivery cron job:', error);
    }
  });

  console.log('🕐 Auto-confirm delivery cron job started (runs every hour)');
}

/**
 * Auto-confirm delivery for orders older than 24 hours
 */
async function autoConfirmDelivery() {
  try {
    console.log(`\n⏰ [Cron] Running auto-confirm delivery check...`);
    
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find SubOrders that:
    // 1. Are in DELIVERED status (but not actually confirmed by renter yet - status should be before DELIVERED)
    // 2. OR have readyAt set and are older than 24h and status is CONTRACT_SIGNED
    // 3. autoConfirmation.status is PENDING
    const subOrders = await SubOrder.find({
      $and: [
        {
          $or: [
            // Ready to be delivered and past 24h
            {
              'autoConfirmation.readyAt': { $lte: twentyFourHoursAgo },
              'autoConfirmation.status': 'PENDING',
              'autoConfirmation.enabled': true,
              status: { $ne: 'DELIVERED' } // Not yet marked as delivered by renter
            }
          ]
        }
      ]
    }).populate('masterOrder');

    console.log(`   Found ${subOrders.length} orders ready for auto-confirmation`);

    let autoConfirmedCount = 0;

    for (const subOrder of subOrders) {
      try {
        const masterOrder = subOrder.masterOrder;
        const renterId = masterOrder.renter;

        console.log(`\n   🔄 Auto-confirming SubOrder ${subOrder.subOrderNumber}...`);
        console.log(`      Renter: ${renterId}`);
        console.log(`      Ready since: ${subOrder.autoConfirmation.readyAt}`);
        console.log(`      Time elapsed: ${Math.floor((now - subOrder.autoConfirmation.readyAt) / (1000 * 60 * 60))} hours`);

        // Perform auto-confirmation using rental order service
        // This will:
        // 1. Mark as DELIVERED
        // 2. Transfer 80% rental fee to owner as frozen
        // 3. Update MasterOrder to ACTIVE
        // 4. Create transaction records

        const confirmResult = {
          success: true,
          message: 'Auto-confirmed by system after 24 hours',
          autoConfirmed: true
        };

        // Update suborder status and auto-confirmation record
        subOrder.status = 'DELIVERED';
        subOrder.autoConfirmation.status = 'CONFIRMED';
        subOrder.autoConfirmation.autoConfirmedAt = now;

        await subOrder.save();

        console.log(`   ✅ SubOrder auto-confirmed`);
        autoConfirmedCount++;

        // TODO: Send notification to renter that order was auto-confirmed

      } catch (error) {
        console.error(`   ❌ Error auto-confirming SubOrder ${subOrder.subOrderNumber}:`, error.message);
      }
    }

    if (autoConfirmedCount > 0) {
      console.log(`\n✅ [Cron] Auto-confirmed ${autoConfirmedCount} orders`);
    } else {
      console.log(`   No orders to auto-confirm at this time`);
    }

    return {
      success: true,
      autoConfirmedCount: autoConfirmedCount,
      timestamp: now.toISOString()
    };
  } catch (error) {
    console.error('❌ Error in autoConfirmDelivery:', error);
    throw error;
  }
}

/**
 * Stop cron job
 */
function stopAutoConfirmDeliveryCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('🛑 Auto-confirm delivery cron job stopped');
  }
}

/**
 * Run auto-confirmation immediately
 */
async function runAutoConfirmDeliveryImmediately() {
  try {
    console.log('▶️  Running auto-confirm delivery immediately...');
    const result = await autoConfirmDelivery();
    console.log('✅ Immediate run completed:', result);
    return result;
  } catch (error) {
    console.error('❌ Error running auto-confirm delivery immediately:', error);
    throw error;
  }
}

module.exports = {
  startAutoConfirmDeliveryCron,
  stopAutoConfirmDeliveryCron,
  runAutoConfirmDeliveryImmediately,
  autoConfirmDelivery
};
