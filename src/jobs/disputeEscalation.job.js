const DisputeService = require('../services/dispute.service');

/**
 * Scheduled job to check and escalate expired RENTER_NO_RETURN disputes to police
 * Should be run once daily
 */
async function escalateExpiredDisputesJob() {
  try {
    console.log(`\n⏰ [Scheduled Job] Checking expired RENTER_NO_RETURN disputes...`);
    const disputeService = new DisputeService();
    const result = await disputeService.checkAndEscalateExpiredDisputes();
    
    if (result.escalated > 0) {
      console.log(`\n✅ [Job Result] Successfully escalated ${result.escalated} dispute(s) to police`);
      console.log(`   Total expired disputes found: ${result.total}`);
    } else {
      console.log(`   No expired disputes to escalate at this time`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ [Scheduled Job] Error in escalateExpiredDisputesJob:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  escalateExpiredDisputesJob
};
