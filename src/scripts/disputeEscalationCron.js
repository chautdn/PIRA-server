const cron = require('node-cron');
const { escalateExpiredDisputesJob } = require('../jobs/disputeEscalation.job');

let cronJob = null;

/**
 * Start cron job to escalate expired RENTER_NO_RETURN disputes to police
 * Runs every hour to check:
 * 1. OPEN disputes > 48h (renter không phản hồi)
 * 2. IN_NEGOTIATION disputes past deadline (3 days)
 */
function startDisputeEscalationCron() {
  // Stop existing job if any
  if (cronJob) {
    cronJob.stop();
  }

  // Run every hour at minute 0
  cronJob = cron.schedule('0 * * * *', async () => {
    try {
      console.log('\n🚨 [Cron] Starting dispute escalation check...');
      await escalateExpiredDisputesJob();
    } catch (error) {
      console.error('❌ Error in dispute escalation cron job:', error);
    }
  });

  console.log('🕐 Dispute escalation cron job started (runs every hour)');
}

/**
 * Stop cron job
 */
function stopDisputeEscalationCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('🛑 Dispute escalation cron job stopped');
  }
}

/**
 * Run escalation process immediately (for testing)
 */
async function runDisputeEscalationNow() {
  try {
    console.log('\n🚨 [Manual Run] Starting dispute escalation check...');
    const result = await escalateExpiredDisputesJob();
    console.log('✅ Manual escalation completed:', result);
    return result;
  } catch (error) {
    console.error('❌ Error in manual dispute escalation:', error);
    throw error;
  }
}

module.exports = {
  startDisputeEscalationCron,
  stopDisputeEscalationCron,
  runDisputeEscalationNow
};
