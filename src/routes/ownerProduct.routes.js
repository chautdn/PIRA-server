const express = require('express');
const router = express.Router();
const ownerProductController = require('../controllers/ownerProduct.controller');
const { authMiddleware } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');
const { registerRoute } = require('./register.routes');

// Validation middleware
const productValidation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters'),
  body('category').isMongoId().withMessage('Valid category ID is required'),
  body('condition')
    .isIn(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'])
    .withMessage('Invalid condition value'),
  body('pricing.dailyRate')
    .isNumeric()
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('Daily rate must be a positive number');
      }
      return true;
    }),
  body('pricing.deposit.amount')
    .isNumeric()
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('Deposit amount must be a positive number');
      }
      return true;
    })
];

const featuredValidation = [
  body('featuredTier')
    .isInt({ min: 1, max: 5 })
    .withMessage('Featured tier must be between 1 and 5'),
  body('duration').isInt({ min: 1, max: 30 }).withMessage('Duration must be between 1 and 30 days')
];

const paramValidation = [param('id').isMongoId().withMessage('Valid product ID is required')];

// Apply authentication and role middleware to all routes
router.use(authMiddleware.verifyToken);
router.use(authMiddleware.checkUserRole(['OWNER', 'ADMIN', 'RENTER']));

// Routes
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status')
      .optional()
      .isIn(['DRAFT', 'PENDING', 'ACTIVE', 'RENTED', 'INACTIVE', 'SUSPENDED']),
    query('featured').optional().isIn(['true', 'false'])
  ],
  ownerProductController.getProducts
);

router.get('/:id', paramValidation, ownerProductController.getProductById);

router.post(
  '/',
  ownerProductController.uploadMiddleware,
  productValidation,
  (req, res, next) => {
    // Middleware validation handler
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }
    next();
  },
  ownerProductController.createProduct
);

router.put(
  '/:id',
  paramValidation,
  ownerProductController.uploadMiddleware,
  productValidation,
  ownerProductController.updateProduct
);

router.delete('/:id', paramValidation, ownerProductController.deleteProduct);

router.put(
  '/:id/featured',
  paramValidation,
  featuredValidation,
  ownerProductController.updateFeaturedStatus
);

router.post(
  '/:id/upload-images',
  paramValidation,
  ownerProductController.uploadMiddleware,
  ownerProductController.uploadImages
);

router.delete(
  '/:id/images/:imageId',
  [
    param('id').isMongoId().withMessage('Valid product ID is required'),
    param('imageId').isMongoId().withMessage('Valid image ID is required')
  ],
  ownerProductController.deleteImage
);

registerRoute('/owner-products', router);
module.exports = router;
