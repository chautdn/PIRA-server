const express = require('express');
const router = express.Router();
const ExtensionController = require('../controllers/extension.controller');
const { authMiddleware } = require('../middleware/auth');

// Middleware authentication
router.use(authMiddleware.verifyToken);

// Renter routes
router.post('/request', ExtensionController.requestExtension);
router.get('/renter-requests', ExtensionController.getRenterExtensionRequests);
router.put('/:requestId/cancel', ExtensionController.cancelExtension);

// Owner routes
router.get('/owner-requests', ExtensionController.getOwnerExtensionRequests);
router.get('/:requestId', ExtensionController.getExtensionRequestDetail);
router.put('/:requestId/approve', ExtensionController.approveExtension);
router.put('/:requestId/reject', ExtensionController.rejectExtension);

module.exports = router;
