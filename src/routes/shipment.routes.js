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

module.exports = router;
