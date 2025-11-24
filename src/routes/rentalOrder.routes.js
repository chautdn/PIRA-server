const express = require('express');
const router = express.Router();
const RentalOrderController = require('../controllers/rentalOrder.controller');
const { authMiddleware } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { body, param, query } = require('express-validator');
const { registerRoute } = require('./register.routes');

// Middleware xác thực cho tất cả routes
router.use(authMiddleware.verifyToken);

// Validation schemas
const createDraftOrderValidation = [
  body('rentalPeriod.startDate').isISO8601().withMessage('Ngày bắt đầu thuê không hợp lệ'),
  body('rentalPeriod.endDate').isISO8601().withMessage('Ngày kết thúc thuê không hợp lệ'),
  body('deliveryMethod')
    .isIn(['PICKUP', 'DELIVERY'])
    .withMessage('Hình thức nhận hàng không hợp lệ'),
  // For DELIVERY method, check address requirements
  body('deliveryAddress')
    .if(body('deliveryMethod').equals('DELIVERY'))
    .custom((value) => {
      if (!value) {
        throw new Error('Địa chỉ giao hàng không được trống khi chọn DELIVERY');
      }

      // Must have either manual address OR coordinates
      const hasManualAddress = value.streetAddress;
      const hasCoordinates = value.latitude && value.longitude;

      if (!hasManualAddress && !hasCoordinates) {
        throw new Error('Vui lòng nhập địa chỉ hoặc chọn vị trí trên bản đồ');
      }

      // Must have contact phone
      if (!value.contactPhone) {
        throw new Error('Số điện thoại liên hệ không được trống');
      }

      return true;
    }),
  validateRequest
];

const ownerConfirmValidation = [
  body('status').isIn(['CONFIRMED', 'REJECTED']).withMessage('Trạng thái xác nhận không hợp lệ'),
  body('rejectionReason')
    .if(body('status').equals('REJECTED'))
    .notEmpty()
    .withMessage('Vui lòng cung cấp lý do từ chối'),
  validateRequest
];

const signContractValidation = [
  body('signature').notEmpty().withMessage('Chữ ký không được trống'),
  body('agreementConfirmed')
    .isBoolean()
    .custom((value) => {
      if (!value) {
        throw new Error('Bạn phải xác nhận đồng ý với điều khoản hợp đồng');
      }
      return true;
    }),
  validateRequest
];

// Routes

/**
 * Bước 1: Tạo đơn thuê tạm từ giỏ hàng
 * POST /api/rental-orders/create-draft
 */
router.post('/create-draft', createDraftOrderValidation, RentalOrderController.createDraftOrder);

/**
 * Calculate deposit for current cart
 * GET /api/rental-orders/calculate-deposit
 */
router.get('/calculate-deposit', RentalOrderController.calculateDeposit);

/**
 * Bước 1b: Tạo đơn thuê với thanh toán (renter pays upfront)
 * POST /api/rental-orders/create-paid
 */
const createPaidOrderValidation = [
  ...createDraftOrderValidation,
  body('paymentMethod')
    .isIn(['WALLET', 'BANK_TRANSFER', 'PAYOS', 'COD'])
    .withMessage('Phương thức thanh toán không hợp lệ'),
  body('totalAmount').isFloat({ min: 0 }).withMessage('Tổng tiền không hợp lệ'),
  // COD specific validation
  body('depositAmount')
    .if(body('paymentMethod').equals('COD'))
    .isFloat({ min: 1 })
    .withMessage('COD orders require a valid deposit amount'),
  body('depositPaymentMethod')
    .if(body('paymentMethod').equals('COD'))
    .isIn(['WALLET', 'PAYOS', 'BANK_TRANSFER'])
    .withMessage('COD orders require a valid deposit payment method')
];
router.post('/create-paid', createPaidOrderValidation, RentalOrderController.createPaidOrder);

/**
 * Bước 2: Xác nhận đơn hàng
 * POST /api/rental-orders/:masterOrderId/confirm
 */
router.post(
  '/:masterOrderId/confirm',
  [param('masterOrderId').isMongoId().withMessage('ID đơn hàng không hợp lệ'), validateRequest],
  RentalOrderController.confirmOrder
);

/**
 * Bước 3: Thanh toán
 * POST /api/rental-orders/:masterOrderId/payment
 */
router.post(
  '/:masterOrderId/payment',
  [
    param('masterOrderId').isMongoId().withMessage('ID đơn hàng không hợp lệ'),
    body('method')
      .isIn(['WALLET', 'BANK_TRANSFER', 'PAYOS'])
      .withMessage('Phương thức thanh toán không hợp lệ'),
    validateRequest
  ],
  RentalOrderController.processPayment
);

/**
 * Bước 4: Chủ xác nhận đơn hàng
 * POST /api/rental-orders/sub-orders/:subOrderId/owner-confirm
 */
router.post(
  '/sub-orders/:subOrderId/owner-confirm',
  [
    param('subOrderId').isMongoId().withMessage('ID đơn con không hợp lệ'),
    ...ownerConfirmValidation
  ],
  RentalOrderController.ownerConfirmOrder
);

/**
 * Bước 5: Tạo hợp đồng
 * POST /api/rental-orders/:masterOrderId/generate-contracts
 */
router.post(
  '/:masterOrderId/generate-contracts',
  [param('masterOrderId').isMongoId().withMessage('ID đơn hàng không hợp lệ'), validateRequest],
  RentalOrderController.generateContracts
);

/**
 * Bước 6: Ký hợp đồng
 * POST /api/rental-orders/contracts/:contractId/sign
 */
router.post(
  '/contracts/:contractId/sign',
  [
    param('contractId').isMongoId().withMessage('ID hợp đồng không hợp lệ'),
    ...signContractValidation
  ],
  RentalOrderController.signContract
);

/**
 * Lấy danh sách đơn hàng của người thuê
 * GET /api/rental-orders/my-orders
 */
router.get(
  '/my-orders',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Trang không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Giới hạn không hợp lệ'),
    query('status').optional().isString(),
    validateRequest
  ],
  RentalOrderController.getMyOrders
);

/**
 * Lấy danh sách đơn hàng của chủ cho thuê
 * GET /api/rental-orders/owner-orders
 */
router.get(
  '/owner-orders',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Trang không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Giới hạn không hợp lệ'),
    query('status').optional().isString(),
    validateRequest
  ],
  RentalOrderController.getOwnerOrders
);

// === OWNER SUBORDER MANAGEMENT ===

// GET /api/rental-orders/owner-suborders - Lấy danh sách SubOrder cho owner
router.get(
  '/owner-suborders',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Trang không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Giới hạn không hợp lệ'),
    query('status').optional().isString(),
    validateRequest
  ],
  RentalOrderController.getOwnerSubOrders
);

// GET /api/rental-orders/owner-active-rentals - Lấy danh sách sản phẩm đang được thuê
router.get(
  '/owner-active-rentals',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Trang không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Giới hạn không hợp lệ'),
    validateRequest
  ],
  RentalOrderController.getOwnerActiveRentals
);

/**
 * Lấy chi tiết đơn hàng
 * GET /api/rental-orders/:masterOrderId
 */
router.get(
  '/:masterOrderId',
  [param('masterOrderId').isMongoId().withMessage('ID đơn hàng không hợp lệ'), validateRequest],
  RentalOrderController.getOrderDetail
);

/**
 * Hủy đơn hàng
 * PUT /api/rental-orders/:masterOrderId/cancel
 */
router.put(
  '/:masterOrderId/cancel',
  [
    param('masterOrderId').isMongoId().withMessage('ID đơn hàng không hợp lệ'),
    body('reason').optional().isString().withMessage('Lý do hủy không hợp lệ'),
    validateRequest
  ],
  RentalOrderController.cancelOrder
);

/**
 * Lấy danh sách hợp đồng
 * GET /api/rental-orders/contracts
 */
router.get(
  '/contracts',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Trang không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Giới hạn không hợp lệ'),
    query('status').optional().isString(),
    validateRequest
  ],
  RentalOrderController.getContracts
);

/**
 * Tính phí ship preview
 * POST /api/rental-orders/calculate-shipping
 */
router.post(
  '/calculate-shipping',
  [
    body('ownerAddress.latitude').optional().isFloat().withMessage('Vĩ độ chủ không hợp lệ'),
    body('ownerAddress.longitude').optional().isFloat().withMessage('Kinh độ chủ không hợp lệ'),
    body('ownerAddress.streetAddress').notEmpty().withMessage('Địa chỉ chủ không được trống'),
    body('deliveryAddress.latitude')
      .optional()
      .isFloat()
      .withMessage('Vĩ độ giao hàng không hợp lệ'),
    body('deliveryAddress.longitude')
      .optional()
      .isFloat()
      .withMessage('Kinh độ giao hàng không hợp lệ'),
    body('deliveryAddress.streetAddress')
      .notEmpty()
      .withMessage('Địa chỉ giao hàng không được trống'),
    validateRequest
  ],
  RentalOrderController.calculateShipping
);

// POST /api/rental-orders/suborders/:id/confirm - Xác nhận SubOrder
router.post(
  '/suborders/:id/confirm',
  [param('id').isMongoId().withMessage('ID SubOrder không hợp lệ'), validateRequest],
  RentalOrderController.confirmSubOrder
);

// POST /api/rental-orders/suborders/:id/reject - Từ chối SubOrder
router.post(
  '/suborders/:id/reject',
  [
    param('id').isMongoId().withMessage('ID SubOrder không hợp lệ'),
    body('reason').notEmpty().withMessage('Lý do từ chối không được trống'),
    validateRequest
  ],
  RentalOrderController.rejectSubOrder
);

// PUT /api/rental-orders/:masterOrderId/payment-method - Cập nhật phương thức thanh toán
router.put(
  '/:masterOrderId/payment-method',
  [
    param('masterOrderId').isMongoId().withMessage('ID MasterOrder không hợp lệ'),
    body('paymentMethod')
      .isIn(['WALLET', 'BANK_TRANSFER', 'PAYOS'])
      .withMessage('Phương thức thanh toán không hợp lệ'),
    validateRequest
  ],
  RentalOrderController.updatePaymentMethod
);

/**
 * Tính phí ship chi tiết cho từng product
 * POST /api/rental-orders/calculate-product-shipping
 */
router.post(
  '/calculate-product-shipping',
  [
    body('ownerLocation.latitude').isFloat().withMessage('Vĩ độ chủ không hợp lệ'),
    body('ownerLocation.longitude').isFloat().withMessage('Kinh độ chủ không hợp lệ'),
    body('userLocation.latitude').isFloat().withMessage('Vĩ độ người thuê không hợp lệ'),
    body('userLocation.longitude').isFloat().withMessage('Kinh độ người thuê không hợp lệ'),
    body('products').isArray({ min: 1 }).withMessage('Danh sách sản phẩm không được trống'),
    body('products.*.quantity').isInt({ min: 1 }).withMessage('Số lượng sản phẩm không hợp lệ'),
    validateRequest
  ],
  RentalOrderController.calculateProductShipping
);

/**
 * Cập nhật phí ship cho SubOrder
 * PUT /api/rental-orders/suborders/:subOrderId/shipping
 */
router.put(
  '/suborders/:subOrderId/shipping',
  [
    param('subOrderId').isMongoId().withMessage('ID SubOrder không hợp lệ'),
    body('ownerLocation.latitude').isFloat().withMessage('Vĩ độ chủ không hợp lệ'),
    body('ownerLocation.longitude').isFloat().withMessage('Kinh độ chủ không hợp lệ'),
    body('userLocation.latitude').isFloat().withMessage('Vĩ độ người thuê không hợp lệ'),
    body('userLocation.longitude').isFloat().withMessage('Kinh độ người thuê không hợp lệ'),
    validateRequest
  ],
  RentalOrderController.updateSubOrderShipping
);

/**
 * Lấy availability calendar cho product từ SubOrder data
 * GET /api/rental-orders/products/:productId/availability-calendar
 */
router.get(
  '/products/:productId/availability-calendar',
  [
    param('productId').isMongoId().withMessage('ID sản phẩm không hợp lệ'),
    query('startDate').isISO8601().withMessage('Ngày bắt đầu không hợp lệ'),
    query('endDate').isISO8601().withMessage('Ngày kết thúc không hợp lệ'),
    validateRequest
  ],
  RentalOrderController.getProductAvailabilityCalendar
);

/**
 * Handle PayOS payment callbacks
 * GET /api/rental-orders/payment-success
 * GET /api/rental-orders/payment-cancel
 */
router.get('/payment-success', RentalOrderController.handlePaymentSuccess);
router.get('/payment-cancel', RentalOrderController.handlePaymentCancel);

/**
 * Verify PayOS payment for rental order
 * POST /api/rental-orders/:masterOrderId/verify-payment
 */
router.post(
  '/:masterOrderId/verify-payment',
  [
    param('masterOrderId').isMongoId().withMessage('Invalid master order ID'),
    body('orderCode').notEmpty().withMessage('Order code is required'),
    validateRequest
  ],
  RentalOrderController.verifyPayOSPayment
);

// Register routes
registerRoute('/rental-orders', router);

module.exports = router;
