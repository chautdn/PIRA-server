const Shipment = require('../models/Shipment');
const SubOrder = require('../models/SubOrder');
const MasterOrder = require('../models/MasterOrder');

/**
 * Scheduled job to auto-complete shipments after 24 hours
 * If shipment is DELIVERED/RETURNED and no dispute is opened,
 * auto-complete after 24 hours and update order status to COMPLETED
 */
async function autoCompleteShipmentsJob() {
  try {
    console.log(`\n⏰ [Scheduled Job] Running auto-complete shipment check...`);
    
    // Find all shipments that were completed 24h ago but not yet marked as completed
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const shipmentsToComplete = await Shipment.find({
      status: { $in: ['DELIVERED', 'RETURNED'] },
      'tracking.deliveredAt': { $exists: true, $lte: twentyFourHoursAgo },
      completionScheduledFor: { $exists: false }
    }).populate({
      path: 'subOrder',
      populate: [
        { path: 'masterOrder' }
      ]
    });

    console.log(`   Found ${shipmentsToComplete.length} shipment(s) to auto-complete`);

    const results = [];

    for (const shipment of shipmentsToComplete) {
      try {
        const subOrder = shipment.subOrder;
        const masterOrder = subOrder?.masterOrder;

        // Check if there's an active dispute
        const Dispute = require('../models/Dispute');
        const activeDispute = await Dispute.findOne({
          subOrder: subOrder._id,
          status: { $in: ['OPEN', 'IN_PROGRESS'] }
        });

        if (activeDispute) {
          console.log(`   ⏭️  Shipment ${shipment.shipmentId}: Has active dispute, skipping auto-complete`);
          continue;
        }

        // Mark shipment as completed
        shipment.status = 'COMPLETED';
        shipment.tracking = shipment.tracking || {};
        shipment.tracking.completedAt = new Date();
        await shipment.save();

        // Update suborder status to COMPLETED if all related shipments are completed
        const allShipments = await Shipment.find({ 
          subOrder: subOrder._id 
        });
        const allCompleted = allShipments.every(s => s.status === 'COMPLETED');

        if (allCompleted) {
          subOrder.status = 'COMPLETED';
          await subOrder.save();
          
          console.log(`   ✅ SubOrder ${subOrder.subOrderNumber}: Marked as COMPLETED`);

          // Update masterorder status to COMPLETED if all suborders are completed
          const allSubOrders = await SubOrder.find({ 
            masterOrder: masterOrder._id 
          });
          const allSubOrdersCompleted = allSubOrders.every(so => so.status === 'COMPLETED');

          if (allSubOrdersCompleted) {
            masterOrder.status = 'COMPLETED';
            await masterOrder.save();
            
            console.log(`   ✅ MasterOrder ${masterOrder.masterOrderNumber}: Marked as COMPLETED`);

            // Award owner 5 creditScore if creditScore < 100
            const User = require('../models/User');
            const owner = await User.findById(subOrder.owner);
            if (owner) {
              if (owner.creditScore === undefined) {
                owner.creditScore = 0;
              }
              
              if (owner.creditScore < 100) {
                const oldScore = owner.creditScore;
                owner.creditScore = Math.min(100, owner.creditScore + 5);
                await owner.save();
                console.log(`   ✅ Owner creditScore: ${oldScore} → ${owner.creditScore} (+5 points for completion)`);
              }
            }
          }
        }

        results.push({
          shipmentId: shipment.shipmentId,
          subOrderNumber: subOrder.subOrderNumber,
          status: 'completed'
        });

      } catch (err) {
        console.error(`   ❌ Error auto-completing shipment ${shipment.shipmentId}:`, err.message);
        results.push({
          shipmentId: shipment.shipmentId,
          status: 'failed',
          error: err.message
        });
      }
    }

    console.log(`\n✅ [Job Result] Auto-complete check completed`);
    return {
      success: true,
      completedCount: results.filter(r => r.status === 'completed').length,
      results: results
    };

  } catch (error) {
    console.error('❌ [Scheduled Job] Error in autoCompleteShipmentsJob:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  autoCompleteShipmentsJob
};
