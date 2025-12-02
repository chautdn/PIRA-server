const express = require('express');
const router = express.Router();
const earlyReturnController = require('../controllers/earlyReturn.controller');
const { authMiddleware } = require('../middleware/auth');
const { body, param, query } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');

// Validation rules
const validateCreateRequest = [
  body('subOrderId')
    .notEmpty()
    .withMessage('SubOrder ID is required')
    .isMongoId()
    .withMessage('Invalid SubOrder ID'),
  body('requestedReturnDate')
    .notEmpty()
    .withMessage('Requested return date is required')
    .isISO8601()
    .withMessage('Invalid date format'),
  body('useOriginalAddress').optional().isBoolean(),
  body('returnAddress').optional().isObject(),
  body('returnAddress.streetAddress')
    .if((value, { req }) => !req.body.useOriginalAddress)
    .notEmpty()
    .withMessage('Street address is required when not using original address'),
  body('returnAddress.contactPhone')
    .if((value, { req }) => !req.body.useOriginalAddress)
    .optional()
    .isString()
    .withMessage('Contact phone must be a string if provided'),
  body('notes').optional().isString().trim(),
  handleValidationErrors
];

const validateConfirmReturn = [
  param('id').isMongoId().withMessage('Invalid request ID'),
  body('notes').optional().isString().trim(),
  body('qualityCheck').optional().isObject(),
  body('qualityCheck.condition')
    .optional()
    .isIn(['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED'])
    .withMessage('Invalid quality condition'),
  body('qualityCheck.notes').optional().isString().trim(),
  body('qualityCheck.photos').optional().isArray(),
  handleValidationErrors
];

const validateCancelRequest = [
  param('id').isMongoId().withMessage('Invalid request ID'),
  body('reason').notEmpty().withMessage('Cancellation reason is required').isString().trim(),
  handleValidationErrors
];

const validateUpdateRequest = [
  param('id').isMongoId().withMessage('Invalid request ID'),
  body('requestedReturnDate').optional().isISO8601().withMessage('Invalid date format'),
  body('returnAddress').optional().isObject(),
  body('returnAddress.streetAddress')
    .optional()
    .notEmpty()
    .withMessage('Street address cannot be empty'),
  body('returnAddress.coordinates').optional().isObject(),
  body('returnAddress.coordinates.latitude')
    .optional()
    .isFloat()
    .withMessage('Valid latitude is required'),
  body('returnAddress.coordinates.longitude')
    .optional()
    .isFloat()
    .withMessage('Valid longitude is required'),
  body('notes').optional().isString().trim(),
  handleValidationErrors
];

const validateDeleteRequest = [
  param('id').isMongoId().withMessage('Invalid request ID'),
  handleValidationErrors
];

const validateCreateReview = [
  param('id').isMongoId().withMessage('Invalid request ID'),
  body('rating')
    .notEmpty()
    .withMessage('Rating is required')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment').notEmpty().withMessage('Comment is required').isString().trim(),
  body('title').optional().isString().trim(),
  body('detailedRating').optional().isObject(),
  body('photos').optional().isArray(),
  handleValidationErrors
];

const validateUpdateAddress = [
  param('id').isMongoId().withMessage('Invalid request ID'),
  body('returnAddress').notEmpty().withMessage('Return address is required').isObject(),
  body('returnAddress.streetAddress').notEmpty().withMessage('Street address is required'),
  body('returnAddress.coordinates').notEmpty().withMessage('Coordinates are required').isObject(),
  body('returnAddress.coordinates.latitude').isFloat().withMessage('Valid latitude is required'),
  body('returnAddress.coordinates.longitude').isFloat().withMessage('Valid longitude is required'),
  body('returnAddress.contactPhone').notEmpty().withMessage('Contact phone is required'),
  handleValidationErrors
];

const validatePayAdditionalShipping = [
  param('id').isMongoId().withMessage('Invalid request ID'),
  body('paymentMethod')
    .notEmpty()
    .withMessage('Payment method is required')
    .isIn(['wallet', 'payos'])
    .withMessage('Payment method must be wallet or payos'),
  handleValidationErrors
];

const validateOrderCode = [
  param('orderCode').notEmpty().withMessage('Order code is required'),
  handleValidationErrors
];

const validateRequestId = [
  param('id').isMongoId().withMessage('Invalid request ID'),
  handleValidationErrors
];

const validateQueryParams = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['ACTIVE', 'CANCELLED']).withMessage('Invalid status'),
  handleValidationErrors
];

// All routes require authentication
router.use(authMiddleware.verifyToken);

// Fee calculation and upfront payment (before creating request)
router.post(
  '/calculate-fee',
  authMiddleware.verifyToken,
  earlyReturnController.calculateAdditionalFee
);
router.post(
  '/pay-upfront-shipping',
  authMiddleware.verifyToken,
  earlyReturnController.payUpfrontShippingFee
);

// Renter routes
router.post('/', validateCreateRequest, earlyReturnController.createRequest);
router.get('/renter', validateQueryParams, earlyReturnController.getRenterRequests);
router.delete('/:id', validateDeleteRequest, earlyReturnController.deleteRequest);
router.post(
  '/:id/pay-additional-shipping',
  validatePayAdditionalShipping,
  earlyReturnController.payAdditionalShipping
);
router.get(
  '/verify-additional-shipping/:orderCode',
  validateOrderCode,
  earlyReturnController.verifyAdditionalShippingPayment
);
router.post('/:id/cancel', validateCancelRequest, earlyReturnController.cancelRequest);

// Owner routes
router.get('/owner', validateQueryParams, earlyReturnController.getOwnerRequests);
router.post(
  '/:id/confirm-return',
  validateConfirmReturn,
  earlyReturnController.confirmReturnReceived
);
router.post('/:id/review', validateCreateReview, earlyReturnController.createOwnerReview);

// Shared routes
router.get('/:id', validateRequestId, earlyReturnController.getRequestDetails);

// Admin/System routes
router.post('/auto-complete', earlyReturnController.autoCompleteExpired);

module.exports = router;
