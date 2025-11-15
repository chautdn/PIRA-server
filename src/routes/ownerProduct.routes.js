const express = require('express');
const router = express.Router();
const ownerProductController = require('../controllers/ownerProduct.controller');
const { authMiddleware } = require('../middleware/auth');
const kycCheck = require('../middleware/kycCheck');
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
    query('promoted').optional().isIn(['true', 'false'])
  ],
  ownerProductController.getProducts
);

// Rental Request Management Routes - MUST be before /:id route
router.get('/rental-requests', ownerProductController.getRentalRequests);

router.get('/:id', paramValidation, ownerProductController.getProductById);

router.post(
  '/',
  kycCheck.requireOwnerKYC, // Check KYC and Bank Account before allowing product creation
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
  kycCheck.requireOwnerKYC, // Check KYC and Bank Account before allowing product update
  ownerProductController.uploadMiddleware,
  productValidation,
  ownerProductController.updateProduct
);

router.delete('/:id', paramValidation, ownerProductController.deleteProduct);

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

router.post(
  '/rental-requests/:subOrderId/items/:itemIndex/confirm',
  [
    param('subOrderId').isMongoId().withMessage('Valid subOrder ID is required'),
    param('itemIndex').isInt({ min: 0 }).withMessage('Valid item index is required')
  ],
  ownerProductController.confirmProductItem
);

router.post(
  '/rental-requests/:subOrderId/items/:itemIndex/reject',
  [
    param('subOrderId').isMongoId().withMessage('Valid subOrder ID is required'),
    param('itemIndex').isInt({ min: 0 }).withMessage('Valid item index is required'),
    body('reason')
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage('Reason must be between 5 and 500 characters')
  ],
  ownerProductController.rejectProductItem
);

// New product management routes
router.get('/:id/rental-status', paramValidation, ownerProductController.checkRentalStatus);

router.put('/:id/hide', paramValidation, ownerProductController.hideProduct);

router.put('/:id/unhide', paramValidation, ownerProductController.unhideProduct);

router.delete('/:id/soft-delete', paramValidation, ownerProductController.softDeleteProduct);

router.put(
  '/:id/safe-update',
  paramValidation,
  ownerProductController.uploadMiddleware,
  [
    body('title')
      .optional()
      .trim()
      .isLength({ min: 3, max: 100 })
      .withMessage('Title must be between 3 and 100 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ min: 10, max: 2000 })
      .withMessage('Description must be between 10 and 2000 characters')
  ],
  ownerProductController.updateProductSafeFields
);

registerRoute('/owner-products', router);
module.exports = router;
