/**
 * Utility functions for generating unique IDs
 */

/**
 * Generate unique Dispute ID
 * Format: DSP{timestamp}{random}
 */
function generateDisputeId() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DSP${timestamp}${random}`;
}

/**
 * Generate unique SubOrder Number
 * Format: SO{timestamp}{random}
 */
function generateSubOrderNumber() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SO${timestamp}${random}`;
}

/**
 * Generate unique MasterOrder Number
 * Format: MO{timestamp}{random}
 */
function generateMasterOrderNumber() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `MO${timestamp}${random}`;
}

module.exports = {
  generateDisputeId,
  generateSubOrderNumber,
  generateMasterOrderNumber
};
