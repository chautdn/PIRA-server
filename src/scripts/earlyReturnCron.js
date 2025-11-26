const cron = require('node-cron');
const earlyReturnService = require('../services/earlyReturn.service');

/**
 * Cron job to auto-complete expired early return requests
 * Runs every hour to check for returns that should be auto-completed
 * (24h after original end date without owner confirmation)
 *
 * Schedule: '0 * * * *' = At minute 0 of every hour
 */
const startEarlyReturnCronJob = () => {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await earlyReturnService.autoCompleteExpiredReturns();

      if (result.totalProcessed > 0) {
        const successCount = result.results.filter((r) => r.success).length;
        const failCount = result.results.filter((r) => !r.success).length;

        console.log(
          `[Early Return Cron] Auto-completed ${successCount} returns (${failCount} failed) at ${new Date().toISOString()}`
        );

        if (failCount > 0) {
          console.error(
            '[Early Return Cron] Failed requests:',
            result.results.filter((r) => !r.success)
          );
        }
      }
    } catch (error) {
      console.error('[Early Return Cron] Error auto-completing expired returns:', error);
    }
  });

  console.log('[Early Return Cron] Scheduled to run every hour');
};

// Optional: Run immediately on startup to clean up any expired returns
const runImmediately = async () => {
  try {
    console.log('[Early Return Cron] Running initial cleanup...');
    const result = await earlyReturnService.autoCompleteExpiredReturns();

    if (result.totalProcessed > 0) {
      const successCount = result.results.filter((r) => r.success).length;
      const failCount = result.results.filter((r) => !r.success).length;

      console.log(
        `[Early Return Cron] Initial cleanup: Auto-completed ${successCount} returns (${failCount} failed)`
      );
    } else {
      console.log('[Early Return Cron] Initial cleanup: No expired returns found');
    }
  } catch (error) {
    console.error('[Early Return Cron] Error in initial cleanup:', error);
  }
};

module.exports = {
  startEarlyReturnCronJob,
  runImmediately
};
