const cron = require('node-cron');
const ExtensionService = require('../services/extension.service');

let cronJob = null;

/**
 * Start cron job to auto-reject and refund expired extension requests
 * Runs every 10 minutes
 */
function startExtensionAutoRefundCron() {
  // Stop existing job if any
  if (cronJob) {
    cronJob.stop();
  }

  // Run every 10 minutes
  cronJob = cron.schedule('*/10 * * * *', async () => {
    try {
      const result = await ExtensionService.autoRejectExpiredExtensions();
      if (result.processedCount > 0) {
        console.log(`✅ Auto-refunded ${result.processedCount} expired extension request(s)`);
      }
    } catch (error) {
      console.error('❌ Error in extension auto-refund cron job:', error);
    }
  });

  console.log('🕐 Extension auto-refund cron job started (runs every 10 minutes)');
}

/**
 * Stop cron job
 */
function stopExtensionAutoRefundCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('🛑 Extension auto-refund cron job stopped');
  }
}

/**
 * Run auto-refund process immediately
 */
async function runExtensionAutoRefundImmediately() {
  try {
    console.log('▶️  Running extension auto-refund immediately...');
    const result = await ExtensionService.autoRejectExpiredExtensions();
    console.log('✅ Immediate run completed:', result);
    return result;
  } catch (error) {
    console.error('❌ Error running extension auto-refund immediately:', error);
    throw error;
  }
}

module.exports = {
  startExtensionAutoRefundCron,
  stopExtensionAutoRefundCron,
  runExtensionAutoRefundImmediately
};
