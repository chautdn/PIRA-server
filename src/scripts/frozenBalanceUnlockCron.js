const cron = require('node-cron');
const FrozenBalanceService = require('../services/frozenBalance.service');

let cronJob = null;

/**
 * Start cron job to unlock expired frozen funds
 * Runs every 5 seconds for testing (change to '* * * * *' for production)
 */
function startFrozenBalanceUnlockCron() {
  // Stop existing job if any
  if (cronJob) {
    cronJob.stop();
  }

  // Run every 5 seconds for testing
  const interval = setInterval(async () => {
    try {
      await FrozenBalanceService.unlockExpiredFrozenFunds();
    } catch (error) {
      console.error('❌ Error in frozen balance unlock cron job:', error);
    }
  }, 5000);

  cronJob = { stop: () => clearInterval(interval) };

  console.log('🕐 Frozen balance unlock cron job started (runs every 5 seconds)');
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
