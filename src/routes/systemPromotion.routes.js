const express = require('express');
const router = express.Router();
const systemPromotionController = require('../controllers/systemPromotion.controller');
const { authMiddleware } = require('../middleware/auth');
const { requireRole, handleValidationErrors } = require('../middleware/validation');
const { body, param, query } = require('express-validator');

// Validation rules
const validateCreate = [
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 100 })
    .withMessage('Title must not exceed 100 characters'),
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  // Code is optional for system promotions (auto-apply)
  body('code')
    .optional()
    .isLength({ min: 3, max: 20 })
    .withMessage('Code must be between 3 and 20 characters')
    .matches(/^[A-Z0-9_-]+$/i)
    .withMessage('Code can only contain letters, numbers, hyphens and underscores'),
  body('startDate')
    .notEmpty()
    .withMessage('Start date is required')
    .isISO8601()
    .withMessage('Invalid start date format'),
  body('endDate')
    .notEmpty()
    .withMessage('End date is required')
    .isISO8601()
    .withMessage('Invalid end date format'),
  body('systemPromotion.shippingDiscountValue')
    .notEmpty()
    .withMessage('Shipping discount value is required')
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a positive number'),
  body('systemPromotion.discountType')
    .optional()
    .isIn(['PERCENTAGE', 'FIXED_AMOUNT'])
    .withMessage('Invalid discount type'),
  body('systemPromotion.applyTo')
    .optional()
    .isIn(['ALL_ORDERS', 'FIRST_ORDER', 'MIN_ORDER_VALUE'])
    .withMessage('Invalid apply to value'),
  body('systemPromotion.minOrderValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum order value must be a positive number'),
  body('banner.displayOnHome')
    .optional()
    .isBoolean()
    .withMessage('Display on home must be a boolean'),
  body('banner.bannerTitle')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Banner title must not exceed 100 characters'),
  body('banner.backgroundColor')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Background color must be a valid hex color'),
  body('banner.textColor')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Text color must be a valid hex color'),
  handleValidationErrors
];

const validateUpdate = [
  param('id').isMongoId().withMessage('Invalid promotion ID'),
  body('title')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Title must not exceed 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('status')
    .optional()
    .isIn(['DRAFT', 'ACTIVE', 'EXPIRED', 'DEACTIVATED'])
    .withMessage('Invalid status'),
  handleValidationErrors
];

const validateCalculateDiscount = [
  body('shippingFee')
    .notEmpty()
    .withMessage('Shipping fee is required')
    .isFloat({ min: 0 })
    .withMessage('Shipping fee must be a positive number'),
  body('orderTotal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Order total must be a positive number'),
  handleValidationErrors
];

// Public routes
router.get('/active', systemPromotionController.getActive);

// Protected routes - require authentication
router.use(authMiddleware.verifyToken);

// Calculate discount preview (authenticated users)
router.post(
  '/calculate-discount',
  validateCalculateDiscount,
  systemPromotionController.calculateDiscount
);

// Admin-only routes
router.post('/', requireRole('ADMIN'), validateCreate, systemPromotionController.create);

router.get('/', requireRole('ADMIN'), systemPromotionController.getAll);

router.get(
  '/:id',
  requireRole('ADMIN'),
  param('id').isMongoId().withMessage('Invalid promotion ID'),
  handleValidationErrors,
  systemPromotionController.getById
);

router.put('/:id', requireRole('ADMIN'), validateUpdate, systemPromotionController.update);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  param('id').isMongoId().withMessage('Invalid promotion ID'),
  handleValidationErrors,
  systemPromotionController.deactivate
);

module.exports = router;
