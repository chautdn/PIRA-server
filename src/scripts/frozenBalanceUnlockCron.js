const cron = require('node-cron');
const FrozenBalanceService = require('../services/frozenBalance.service');

let cronJob = null;

/**
 * Start cron job to unlock expired frozen funds
 * Runs every minute
 */
function startFrozenBalanceUnlockCron() {
  // Stop existing job if any
  if (cronJob) {
    cronJob.stop();
  }

  // Run every minute
  cronJob = cron.schedule('* * * * *', async () => {
    try {
      await FrozenBalanceService.unlockExpiredFrozenFunds();
    } catch (error) {
      console.error('❌ Error in frozen balance unlock cron job:', error);
    }
  });

  console.log('🕐 Frozen balance unlock cron job started (runs every minute)');
}

/**
 * Stop cron job
 */
function stopFrozenBalanceUnlockCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('🛑 Frozen balance unlock cron job stopped');
  }
}

/**
 * Run unlock process immediately
 */
async function runFrozenBalanceUnlockImmediately() {
  try {
    console.log('▶️  Running frozen balance unlock immediately...');
    const result = await FrozenBalanceService.unlockExpiredFrozenFunds();
    console.log('✅ Immediate run completed:', result);
    return result;
  } catch (error) {
    console.error('❌ Error running frozen balance unlock immediately:', error);
    throw error;
  }
}

module.exports = {
  startFrozenBalanceUnlockCron,
  stopFrozenBalanceUnlockCron,
  runFrozenBalanceUnlockImmediately
};
