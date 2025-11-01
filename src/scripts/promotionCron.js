const cron = require('node-cron');
const productPromotionService = require('../services/productPromotion.service');

/**
 * Cron job to deactivate expired product promotions
 * Runs every hour at minute 0
 * Schedule: '0 * * * *' = At minute 0 of every hour
 */
const startPromotionCronJob = () => {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const deactivated = await productPromotionService.deactivateExpired();

      if (deactivated > 0) {
        console.log(
          `[Promotion Cron] Deactivated ${deactivated} expired promotions at ${new Date().toISOString()}`
        );
      }
    } catch (error) {
      console.error('[Promotion Cron] Error deactivating expired promotions:', error);
    }
  });

  console.log('[Promotion Cron] Scheduled to run every hour');
};

// Optional: Run immediately on startup to clean up any expired promotions
const runImmediately = async () => {
  try {
    console.log('[Promotion Cron] Running initial cleanup...');
    const deactivated = await productPromotionService.deactivateExpired();

    if (deactivated > 0) {
      console.log(
        `[Promotion Cron] Initial cleanup: Deactivated ${deactivated} expired promotions`
      );
    } else {
      console.log('[Promotion Cron] Initial cleanup: No expired promotions found');
    }
  } catch (error) {
    console.error('[Promotion Cron] Error in initial cleanup:', error);
  }
};

module.exports = {
  startPromotionCronJob,
  runImmediately
};
