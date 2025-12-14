const express = require('express');
const router = express.Router();
const ShipmentController = require('../controllers/shipment.controller');
const { authMiddleware } = require('../middleware/auth');
const { param } = require('express-validator');
const { validateRequest } = require('../middleware/validation');
const upload = require('../middleware/upload');

// All routes require auth
router.use(authMiddleware.verifyToken);

// List available shippers by ward/district
router.get('/shippers', ShipmentController.listShippers);

// Get all shipments for a specific shipper (ADMIN only)
router.get('/shipper/:shipperId', [
  param('shipperId').isMongoId().withMessage('Invalid shipper ID'),
  validateRequest,
  authMiddleware.checkUserRole(['ADMIN'])
], ShipmentController.getShipperShipments);

// Shipper own shipments
router.get('/my', ShipmentController.listMyShipments);

// Shipper available shipments (grouped by DELIVERY vs RETURN)
router.get('/available', ShipmentController.listAvailableShipments);

router.post('/', ShipmentController.createShipment);

router.get('/:id', [param('id').isMongoId().withMessage('Invalid ID'), validateRequest], ShipmentController.getShipment);

// Shipper accepts
router.post('/:id/accept', [param('id').isMongoId().withMessage('Invalid ID'), validateRequest], ShipmentController.shipperAccept);

// Pickup / mark in transit - ONLY SHIPPER can pickup shipments
router.post('/:id/pickup', [
  param('id').isMongoId().withMessage('Invalid ID'), 
  validateRequest,
  authMiddleware.checkUserRole(['SHIPPER']) // Only shippers can pickup shipments
], ShipmentController.pickup);

// Deliver - ONLY SHIPPER can mark shipment as delivered
router.post('/:id/deliver', [
  param('id').isMongoId().withMessage('Invalid ID'), 
  validateRequest,
  authMiddleware.checkUserRole(['SHIPPER']) // Only shippers can deliver shipments
], ShipmentController.deliver);

// Renter confirm delivery
router.post('/:id/confirm', [param('id').isMongoId().withMessage('Invalid ID'), validateRequest], ShipmentController.renterConfirm);

// Cancel shipment pickup - ONLY SHIPPER
router.post('/:id/cancel-pickup', [
  param('id').isMongoId().withMessage('Invalid ID'), 
  validateRequest,
  authMiddleware.checkUserRole(['SHIPPER'])
], ShipmentController.cancelShipmentPickup);

// Reject delivery - renter doesn't accept goods - ONLY SHIPPER
router.post('/:id/reject-delivery', [
  param('id').isMongoId().withMessage('Invalid ID'), 
  validateRequest,
  authMiddleware.checkUserRole(['SHIPPER'])
], ShipmentController.rejectDelivery);

// Owner no-show - shipper confirms owner is not available - ONLY SHIPPER
router.post('/:id/owner-no-show', [
  param('id').isMongoId().withMessage('Invalid ID'), 
  validateRequest,
  authMiddleware.checkUserRole(['SHIPPER'])
], ShipmentController.ownerNoShow);

// Renter no-show - shipper cannot contact renter during delivery - ONLY SHIPPER
router.post('/:id/renter-no-show', [
  param('id').isMongoId().withMessage('Invalid ID'), 
  validateRequest,
  authMiddleware.checkUserRole(['SHIPPER'])
], ShipmentController.renterNoShow);

// Return failed - shipper cannot contact renter during return - ONLY SHIPPER
router.post('/:id/return-failed', [
  param('id').isMongoId().withMessage('Invalid ID'), 
  validateRequest,
  authMiddleware.checkUserRole(['SHIPPER'])
], ShipmentController.returnFailed);

// Upload delivery proof (pickup & delivered images) - min 3, max 10 images
router.post('/:shipmentId/proof', [param('shipmentId').isMongoId().withMessage('Invalid Shipment ID'), validateRequest], upload.array('images', 10), ShipmentController.uploadProof);

// Get delivery proof
router.get('/:shipmentId/proof', [param('shipmentId').isMongoId().withMessage('Invalid Shipment ID'), validateRequest], ShipmentController.getProof);

// Get shipments for a master order
router.get('/order/:masterOrderId', [param('masterOrderId').isMongoId().withMessage('Invalid Order ID'), validateRequest], ShipmentController.getShipmentsByMasterOrder);

// Admin: Create delivery and return shipments for an order
router.post('/order/:masterOrderId/create-shipments', [param('masterOrderId').isMongoId().withMessage('Invalid Order ID'), validateRequest], ShipmentController.createDeliveryAndReturnShipments);

module.exports = router;
