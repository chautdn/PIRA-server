const cron = require('node-cron');
const productPromotionService = require('../services/productPromotion.service');

/**
 * Cron job to manage product promotions
 * - Deactivate expired promotions
 * - Activate scheduled promotions
 * Runs every hour at minute 0
 * Schedule: '0 * * * *' = At minute 0 of every hour
 */
const startPromotionCronJob = () => {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    try {
      // Deactivate expired promotions
      const deactivated = await productPromotionService.deactivateExpired();

      if (deactivated > 0) {
        console.log(
          `[Promotion Cron] Deactivated ${deactivated} expired promotions at ${new Date().toISOString()}`
        );
      }

      // Activate scheduled promotions
      const activated = await productPromotionService.activateScheduled();

      if (activated > 0) {
        console.log(
          `[Promotion Cron] Activated ${activated} scheduled promotions at ${new Date().toISOString()}`
        );
      }
    } catch (error) {
      console.error('[Promotion Cron] Error managing promotions:', error);
    }
  });

  console.log('[Promotion Cron] Scheduled to run every hour');
};

// Optional: Run immediately on startup to clean up and activate promotions
const runImmediately = async () => {
  try {
    console.log('[Promotion Cron] Running initial cleanup and activation...');
    
    const deactivated = await productPromotionService.deactivateExpired();
    if (deactivated > 0) {
      console.log(
        `[Promotion Cron] Initial cleanup: Deactivated ${deactivated} expired promotions`
      );
    }

    const activated = await productPromotionService.activateScheduled();
    if (activated > 0) {
      console.log(
        `[Promotion Cron] Initial activation: Activated ${activated} scheduled promotions`
      );
    }

    if (deactivated === 0 && activated === 0) {
      console.log('[Promotion Cron] Initial run: No promotions to manage');
    }
  } catch (error) {
    console.error('[Promotion Cron] Error in initial run:', error);
  }
};

module.exports = {
  startPromotionCronJob,
  runImmediately
};
