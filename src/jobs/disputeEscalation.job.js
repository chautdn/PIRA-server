const disputeService = require('../services/dispute.service');

/**
 * Scheduled job to check and escalate expired RENTER_NO_RETURN disputes to police
 * Should be run every hour or once daily
 * 
 * 2 cases for escalation:
 * 1. OPEN > 48h - Renter không phản hồi đề xuất ngày trả
 * 2. IN_NEGOTIATION past deadline (3 days) - 2 bên không thỏa thuận được ngày
 */
async function escalateExpiredDisputesJob() {
  try {
    console.log(`\n⏰ [Scheduled Job] Checking expired RENTER_NO_RETURN disputes...`);
    console.log(`   Time: ${new Date().toISOString()}`);
    
    const result = await disputeService.checkAndEscalateExpiredDisputes();
    
    if (result.escalated > 0) {
      console.log(`\n✅ [Job Result] Successfully escalated ${result.escalated} dispute(s) to police`);
      console.log(`   - OPEN > 48h (no response): ${result.details?.openExpired || 0}`);
      console.log(`   - Negotiation expired: ${result.details?.negotiationExpired || 0}`);
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
