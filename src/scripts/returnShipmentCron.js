/**
 * Return Shipment Cron Job
 * Tự động tạo return shipments khi rental kết thúc
 */

const cron = require('node-cron');
const SubOrder = require('../models/SubOrder');
const ReturnShipmentService = require('../services/returnShipment.service');

/**
 * Kiểm tra các đơn hàng có endDate bằng hôm nay
 * và tự động tạo return shipments
 */
async function checkAndCreateReturnShipments() {
  try {
    console.log('\n🔄 [Cron] Checking for rental orders to return...');
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1); // End of today

    // Find all suborders where rental period ends today and not yet returned
    const subOrders = await SubOrder.find({
      'products.rentalPeriod.endDate': {
        $gte: now,
        $lt: tomorrow
      },
      'return.status': 'NOT_INITIATED',
      status: { $in: ['ACTIVE', 'DELIVERED'] }
    }).populate('masterOrder owner');

    console.log(`   Found ${subOrders.length} orders ready for return`);

    let createdCount = 0;
    let failedCount = 0;

    for (const subOrder of subOrders) {
      try {
        console.log(`\n   📦 Processing return for SubOrder: ${subOrder.subOrderNumber}`);
        console.log(`      Owner: ${subOrder.owner?.profile?.firstName} ${subOrder.owner?.profile?.lastName}`);
        console.log(`      Rental End Date: ${subOrder.products[0]?.rentalPeriod?.endDate}`);

        // Create return shipment
        const result = await ReturnShipmentService.createReturnShipment(
          subOrder._id,
          'NORMAL',
          'Auto-initiated return at rental end date'
        );

        createdCount++;
        console.log(`   ✅ Return shipments created: ${result.returnShipments?.length || 0}`);
      } catch (err) {
        failedCount++;
        console.error(`   ❌ Failed to create return for ${subOrder.subOrderNumber}:`, err.message);
      }
    }

    console.log(`\n✅ Return shipment cron completed:`);
    console.log(`   Created: ${createdCount}`);
    console.log(`   Failed: ${failedCount}`);
  } catch (error) {
    console.error('❌ Return shipment cron error:', error.message);
  }
}

/**
 * Start the return shipment cron job
 * Runs daily at 1:00 AM
 */
function startReturnShipmentCronJob() {
  try {
    // Run at 1:00 AM every day
    const job = cron.schedule('0 1 * * *', () => {
      console.log('\n⏰ [Cron] Scheduled return shipment check triggered');
      checkAndCreateReturnShipments();
    });

    console.log('✅ Return shipment cron job started (1:00 AM daily)');
    return job;
  } catch (error) {
    console.error('❌ Failed to start return shipment cron:', error.message);
  }
}

/**
 * Run immediately for testing/debugging
 */
async function runImmediately() {
  try {
    await checkAndCreateReturnShipments();
  } catch (error) {
    console.error('❌ Error running return shipment check:', error.message);
  }
}

module.exports = {
  startReturnShipmentCronJob,
  checkAndCreateReturnShipments,
  runImmediately
};
