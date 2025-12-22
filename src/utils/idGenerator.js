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

/**
 * Generate unique Shipment ID
 * Format: SHPddmmyyyyhhmmssDE/RE (e.g., SHP22122025123230DE for DELIVERY)
 * @param {String} type - 'DELIVERY' or 'RETURN'
 */
function generateShipmentId(type = 'DELIVERY') {
  const now = new Date();
  
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const suffix = type === 'RETURN' ? 'RE' : 'DE';
  
  return `SHP${day}${month}${year}${hours}${minutes}${seconds}${suffix}`;
}

module.exports = {
  generateDisputeId,
  generateSubOrderNumber,
  generateMasterOrderNumber,
  generateShipmentId
};
