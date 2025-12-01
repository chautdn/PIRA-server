const multer = require('multer');

// Use memory storage so we can upload buffers directly to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit per file

// Fields used for shipment proof uploads
const shipmentProofFields = upload.fields([
  { name: 'imageBeforeDelivery', maxCount: 1 },
  { name: 'imageAfterDelivery', maxCount: 1 },
  { name: 'imageAfterUsage', maxCount: 1 },
  { name: 'photos', maxCount: 10 }
]);

// Export multer instance as default (so callers can call `upload.fields(...)`)
// and also expose `shipmentProofFields` as a property for convenience.
module.exports = upload;
module.exports.shipmentProofFields = shipmentProofFields;
