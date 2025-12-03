const express = require('express');
const router = express.Router();
const productPromotionController = require('../controllers/productPromotion.controller');
const { authMiddleware } = require('../middleware/auth');
const { body, query, param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');
const rateLimit = require('express-rate-limit');
const { registerRoute } = require('./register.routes');

// Rate limiting for promotion creation (prevent abuse)
const promotionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: 'Too many promotion requests, please try again later'
});

// Validation rules
const validateCreate = [
  body('productId')
    .notEmpty()
    .withMessage('Product ID is required')
    .isMongoId()
    .withMessage('Invalid product ID'),
  body('tier')
    .notEmpty()
    .withMessage('Tier is required')
    .isInt({ min: 1, max: 5 })
    .withMessage('Tier must be between 1 and 5'),
  body('duration')
    .notEmpty()
    .withMessage('Duration is required')
    .isInt({ min: 1 })
    .withMessage('Duration must be at least 1 day'),
  body('paymentMethod')
    .notEmpty()
    .withMessage('Payment method is required')
    .isIn(['wallet', 'payos'])
    .withMessage('Payment method must be either wallet or payos'),
  body('scheduleMode')
    .optional()
    .isIn(['override', 'after'])
    .withMessage('Schedule mode must be either override or after'),
  handleValidationErrors
];

const validatePricing = [
  query('tier')
    .notEmpty()
    .withMessage('Tier is required')
    .isInt({ min: 1, max: 5 })
    .withMessage('Tier must be between 1 and 5'),
  query('duration')
    .notEmpty()
    .withMessage('Duration is required')
    .isInt({ min: 1 })
    .withMessage('Duration must be at least 1 day'),
  handleValidationErrors
];

const validateGetPromotions = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('status')
    .optional()
    .isIn(['active', 'expired', 'all'])
    .withMessage('Status must be active, expired, or all'),
  handleValidationErrors
];

const validatePromotionId = [
  param('id').isMongoId().withMessage('Invalid promotion ID'),
  handleValidationErrors
];

const validateOrderCode = [
  param('orderCode').notEmpty().withMessage('Order code is required'),
  handleValidationErrors
];

// All routes require authentication
router.use(authMiddleware.verifyToken);

// Routes
router.post('/', promotionLimiter, validateCreate, productPromotionController.create);
router.get('/pricing', validatePricing, productPromotionController.getPricing);
router.get('/tiers', productPromotionController.getTierInfo);
router.get('/my-promotions', validateGetPromotions, productPromotionController.getUserPromotions);
router.get('/verify/:orderCode', validateOrderCode, productPromotionController.verifyPromotion);
router.get('/:id', validatePromotionId, productPromotionController.getPromotionById);

// Register route
registerRoute('/product-promotions', router);

module.exports = router;
