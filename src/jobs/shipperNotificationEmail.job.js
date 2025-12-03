const Shipment = require('../models/Shipment');
const User = require('../models/User');
const ShipmentService = require('../services/shipment.service');

/**
 * Scheduled job to send notification email to shipper
 * - Sends email 1 day before scheduled shipment date
 * - Sends immediately if shipment date has already passed
 * - Sends immediately if notification was never sent (for shipments created today)
 */
async function shipperNotificationEmailJob() {
  try {
    console.log(`\n⏰ [Scheduled Job] Running shipper notification email check...`);

    // Get all PENDING shipments that have a shipper assigned
    const shipmentsWithShipper = await Shipment.find({
      shipper: { $exists: true, $ne: null },
      status: 'PENDING',
      'tracking.notificationSentAt': { $exists: false } // Haven't sent email yet
    }).populate({
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
    }).populate('shipper', 'email phone profile');

    console.log(`   Found ${shipmentsWithShipper.length} shipment(s) with shipper to check for notification`);

    const results = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const shipment of shipmentsWithShipper) {
      try {
        if (!shipment.shipper) {
          console.log(`   ⏭️  Shipment ${shipment.shipmentId}: No shipper assigned, skipping`);
          continue;
        }

        // Get scheduled date (dịp giao hàng/trả hàng)
        const scheduledDate = new Date(shipment.scheduledAt);
        const scheduledDateOnly = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate());

        // Calculate one day before scheduled date
        const oneDayBefore = new Date(scheduledDateOnly);
        oneDayBefore.setDate(oneDayBefore.getDate() - 1);

        // Check if we should send email:
        // For DELIVERY: Send 1 day before scheduled date
        // For RETURN: Send ON the scheduled date (day of return)
        const createdDate = new Date(shipment.createdAt);
        const createdDateOnly = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());

        let shouldSendEmail = false;
        let reason = '';

        if (shipment.type === 'DELIVERY') {
          // For delivery: send 1 day before
          if (today.getTime() === oneDayBefore.getTime()) {
            shouldSendEmail = true;
            reason = 'DELIVERY: scheduled for 1 day before';
          }
          // For testing/immediate notification
          else if (createdDateOnly.getTime() === today.getTime()) {
            shouldSendEmail = true;
            reason = 'DELIVERY: created today (immediate notification for testing)';
          }
        } else if (shipment.type === 'RETURN') {
          // For return: send ON the scheduled date only
          if (today.getTime() === scheduledDateOnly.getTime()) {
            shouldSendEmail = true;
            reason = 'RETURN: scheduled for today';
          }
        }

        if (!shouldSendEmail) {
          console.log(
            `   ⏭️  Shipment ${shipment.shipmentId}: Not yet due for notification (scheduled: ${scheduledDate.toLocaleDateString('vi-VN')}, today: ${today.toLocaleDateString('vi-VN')}, created: ${createdDateOnly.toLocaleDateString('vi-VN')})`
          );
          continue;
        }

        console.log(
          `   📧 Sending notification for ${shipment.shipmentId}: ${reason} (scheduled: ${scheduledDate.toLocaleDateString('vi-VN')}, today: ${today.toLocaleDateString('vi-VN')})`
        );

        // Send email via ShipmentService
        try {
          await ShipmentService.sendShipperNotificationEmail(shipment.shipper._id, shipment._id);

          // Mark as sent
          if (!shipment.tracking) {
            shipment.tracking = {};
          }
          shipment.tracking.notificationSentAt = new Date();
          await shipment.save();

          console.log(`   ✅ Email sent successfully for shipment ${shipment.shipmentId}`);

          results.push({
            shipmentId: shipment.shipmentId,
            shipperId: shipment.shipper._id,
            status: 'sent',
            reason: reason
          });
        } catch (emailErr) {
          console.error(`   ❌ Failed to send email for shipment ${shipment.shipmentId}:`, emailErr.message);
          // Don't mark as sent if email fails - retry next time
          results.push({
            shipmentId: shipment.shipmentId,
            shipperId: shipment.shipper._id,
            status: 'failed',
            error: emailErr.message,
            reason: reason
          });
        }
      } catch (err) {
        console.error(`   ❌ Error processing shipment ${shipment.shipmentId}:`, err.message);
        results.push({
          shipmentId: shipment.shipmentId,
          status: 'error',
          error: err.message
        });
      }
    }

    const sentCount = results.filter(r => r.status === 'sent').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    console.log(`\n✅ [Job Result] Shipper notification email check completed`);
    console.log(`   Sent: ${sentCount}, Failed: ${failedCount}`);

    return {
      success: true,
      sentCount: sentCount,
      failedCount: failedCount,
      results: results
    };
  } catch (error) {
    console.error('❌ [Scheduled Job] Error in shipperNotificationEmailJob:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  shipperNotificationEmailJob
};
