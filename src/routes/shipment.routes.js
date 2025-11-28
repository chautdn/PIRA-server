const express = require('express');
const router = express.Router();
const ShipmentController = require('../controllers/shipment.controller');
const { authMiddleware } = require('../middleware/auth');
const { param } = require('express-validator');
const { validateRequest } = require('../middleware/validation');

// All routes require auth
router.use(authMiddleware.verifyToken);

// List available shippers by ward/district
router.get('/shippers', ShipmentController.listShippers);

// Shipper own shipments
router.get('/my', ShipmentController.listMyShipments);

// Shipper available shipments (grouped by DELIVERY vs RETURN)
router.get('/available', ShipmentController.listAvailableShipments);

router.post('/', ShipmentController.createShipment);

router.get('/:id', [param('id').isMongoId().withMessage('Invalid ID'), validateRequest], ShipmentController.getShipment);

// Shipper accepts
router.post('/:id/accept', [param('id').isMongoId().withMessage('Invalid ID'), validateRequest], ShipmentController.shipperAccept);

// Pickup / mark in transit
router.post('/:id/pickup', [param('id').isMongoId().withMessage('Invalid ID'), validateRequest], ShipmentController.pickup);

// Deliver
router.post('/:id/deliver', [param('id').isMongoId().withMessage('Invalid ID'), validateRequest], ShipmentController.deliver);

// Renter confirm delivery
router.post('/:id/confirm', [param('id').isMongoId().withMessage('Invalid ID'), validateRequest], ShipmentController.renterConfirm);

// Get shipments for a master order
router.get('/order/:masterOrderId', [param('masterOrderId').isMongoId().withMessage('Invalid Order ID'), validateRequest], ShipmentController.getShipmentsByMasterOrder);

// Admin: Create delivery and return shipments for an order
router.post('/order/:masterOrderId/create-shipments', [param('masterOrderId').isMongoId().withMessage('Invalid Order ID'), validateRequest], ShipmentController.createDeliveryAndReturnShipments);

module.exports = router;
