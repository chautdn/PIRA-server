const express = require('express');
const router = express.Router();
const ExtensionController = require('../controllers/extension.controller');
const { authMiddleware } = require('../middleware/auth');

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Middleware authentication
router.use(authMiddleware.verifyToken);

// Renter routes
router.post('/request', asyncHandler(ExtensionController.requestExtension.bind(ExtensionController)));
router.get('/renter-requests', asyncHandler(ExtensionController.getRenterExtensionRequests.bind(ExtensionController)));
router.put('/:requestId/cancel', asyncHandler(ExtensionController.cancelExtension.bind(ExtensionController)));

// Owner routes
router.get('/owner-requests', asyncHandler(ExtensionController.getOwnerExtensionRequests.bind(ExtensionController)));
router.get('/:requestId', asyncHandler(ExtensionController.getExtensionRequestDetail.bind(ExtensionController)));
router.put('/:requestId/approve', asyncHandler(ExtensionController.approveExtension.bind(ExtensionController)));
router.put('/:requestId/reject', asyncHandler(ExtensionController.rejectExtension.bind(ExtensionController)));

module.exports = router;