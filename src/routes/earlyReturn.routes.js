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
    .if(body('useOriginalAddress').not().equals(true))
    .notEmpty()
    .withMessage('Street address is required when not using original address'),
  body('returnAddress.contactPhone')
    .if(body('useOriginalAddress').not().equals(true))
    .notEmpty()
    .withMessage('Contact phone is required when not using original address'),
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
  query('status')
    .optional()
    .isIn(['PENDING', 'ACKNOWLEDGED', 'RETURNED', 'COMPLETED', 'AUTO_COMPLETED', 'CANCELLED'])
    .withMessage('Invalid status'),
  handleValidationErrors
];

// All routes require authentication
router.use(authMiddleware.verifyToken);

// Renter routes
router.post('/', validateCreateRequest, earlyReturnController.createRequest);
router.get('/renter', validateQueryParams, earlyReturnController.getRenterRequests);
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
