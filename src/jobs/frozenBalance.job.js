const FrozenBalanceService = require('../services/frozenBalance.service');

/**
 * Scheduled job to unlock expired frozen funds
 * Should be run every minute (or configurable interval)
 */
async function unlockFrozenFundsJob() {
  try {
    console.log(`\n⏰ [Scheduled Job] Running frozen funds unlock check...`);
    const result = await FrozenBalanceService.unlockExpiredFrozenFunds();
    
    if (result.unlockedCount > 0) {
      console.log(`\n✅ [Job Result] Successfully unlocked ${result.unlockedCount} frozen fund(s)`);
      console.log(`   Details:`, result.results);
    } else {
      console.log(`   No funds to unlock at this time`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ [Scheduled Job] Error in unlockFrozenFundsJob:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  unlockFrozenFundsJob
};
