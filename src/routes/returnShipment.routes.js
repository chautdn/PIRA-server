/**
 * Return Shipment Routes
 */

const express = require('express');
const router = express.Router();
const ReturnShipmentController = require('../controllers/returnShipment.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authMiddleware);

/**
 * 📦 Return Shipment Routes
 */

// Admin/Owner: Initiate return when rental ends
router.post('/initiate/:subOrderId', ReturnShipmentController.initiateReturn);

// Shipper: List available returns and their assigned returns
router.get('/', ReturnShipmentController.listReturnShipments);

// Shipper: Get return shipment detail
router.get('/:shipmentId', ReturnShipmentController.getReturnShipmentDetail);

// Shipper: Confirm return task (accept)
router.post('/:shipmentId/confirm', ReturnShipmentController.shipperConfirmReturn);

// Shipper: Pickup from renter with photos
router.post('/:shipmentId/pickup', ReturnShipmentController.shipperPickupReturn);

// Shipper: Complete return delivery to owner with photos
router.post('/:shipmentId/complete', ReturnShipmentController.shipperCompleteReturn);

module.exports = router;
