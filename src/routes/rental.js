const express = require('express');
const router = express.Router();
const rentalController = require('../controllers/rentalProduct.controller');
const { authMiddleware } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const {
  validateSignature,
  checkSigningPermission,
  contractSigningLimiter,
  validateIPAddress
} = require('../middleware/signatureValidation');
const { body, param, query } = require('express-validator');

// Validation schemas
const createRentalOrderValidation = [
  body('product')
    .notEmpty()
    .withMessage('Product ID là bắt buộc')
    .isMongoId()
    .withMessage('Product ID không hợp lệ'),
  body('rental.startDate')
    .notEmpty()
    .withMessage('Ngày bắt đầu thuê là bắt buộc')
    .isISO8601()
    .withMessage('Ngày bắt đầu thuê không hợp lệ'),
  body('rental.endDate')
    .notEmpty()
    .withMessage('Ngày kết thúc thuê là bắt buộc')
    .isISO8601()
    .withMessage('Ngày kết thúc thuê không hợp lệ'),
  body('paymentMethod')
    .notEmpty()
    .withMessage('Phương thức thanh toán là bắt buộc')
    .isIn(['WALLET', 'BANK_TRANSFER', 'CASH_ON_DELIVERY'])
    .withMessage('Phương thức thanh toán không hợp lệ'),
  body('delivery.method')
    .notEmpty()
    .withMessage('Phương thức giao hàng là bắt buộc')
    .isIn(['PICKUP', 'DELIVERY'])
    .withMessage('Phương thức giao hàng không hợp lệ'),
  body('delivery.address.streetAddress')
    .if(body('delivery.method').equals('DELIVERY'))
    .notEmpty()
    .withMessage('Địa chỉ giao hàng là bắt buộc khi chọn giao hàng'),
  body('delivery.address.ward')
    .if(body('delivery.method').equals('DELIVERY'))
    .notEmpty()
    .withMessage('Phường/xã là bắt buộc'),
  body('delivery.address.district')
    .if(body('delivery.method').equals('DELIVERY'))
    .notEmpty()
    .withMessage('Quận/huyện là bắt buộc'),
  body('delivery.address.city')
    .if(body('delivery.method').equals('DELIVERY'))
    .notEmpty()
    .withMessage('Tỉnh/thành phố là bắt buộc'),
  body('delivery.contactPhone')
    .optional()
    .isMobilePhone('vi-VN')
    .withMessage('Số điện thoại không hợp lệ'),
  body('notes').optional().isString().withMessage('Ghi chú phải là chuỗi')
];

const signContractValidation = [
  param('contractId').isMongoId().withMessage('Contract ID không hợp lệ'),
  body('signature')
    .notEmpty()
    .withMessage('Chữ ký là bắt buộc')
    .isString()
    .withMessage('Chữ ký phải là chuỗi')
];

const processPaymentValidation = [
  param('orderId').isMongoId().withMessage('Order ID không hợp lệ'),
  body('paymentMethod')
    .notEmpty()
    .withMessage('Phương thức thanh toán là bắt buộc')
    .isIn(['WALLET', 'BANK_TRANSFER', 'VNPAY', 'MOMO'])
    .withMessage('Phương thức thanh toán không hợp lệ'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Số tiền phải là số dương'),
  body('bankTransfer')
    .if(body('paymentMethod').equals('BANK_TRANSFER'))
    .isObject()
    .withMessage('Thông tin chuyển khoản là bắt buộc')
];

const mongoIdValidation = [param('orderId').isMongoId().withMessage('Order ID không hợp lệ')];

const contractIdValidation = [
  param('contractId').isMongoId().withMessage('Contract ID không hợp lệ')
];

// Routes

// 1. Tạo đơn thuê mới
router.post(
  '/orders',
  authMiddleware.verifyToken,
  createRentalOrderValidation,
  validateRequest,
  rentalController.createRentalOrder
);

// 2. Lấy danh sách đơn thuê
router.get(
  '/orders',
  authMiddleware.verifyToken,
  [
    query('status')
      .optional()
      .isIn([
        'PENDING',
        'CONFIRMED',
        'CONTRACT_PENDING',
        'CONTRACT_SIGNED',
        'PAID',
        'SHIPPED',
        'DELIVERED',
        'ACTIVE',
        'RETURNED',
        'COMPLETED',
        'CANCELLED'
      ])
      .withMessage('Trạng thái không hợp lệ'),
    query('role').optional().isIn(['renter', 'owner']).withMessage('Role không hợp lệ'),
    query('page').optional().isInt({ min: 1 }).withMessage('Trang phải là số nguyên dương'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit phải từ 1 đến 100')
  ],
  validateRequest,
  rentalController.getRentalOrders
);
// 14. Lấy tất cả đơn thuê của người cho thuê
router.get(
  '/orders/owner',
  authMiddleware.verifyToken,
  validateRequest,
  rentalController.getRentalOrdersByOwner
);

// 3. Lấy chi tiết đơn thuê
router.get(
  '/orders/:orderId',
  authMiddleware.verifyToken,
  mongoIdValidation,
  validateRequest,
  rentalController.getRentalOrderDetail
);

// 4. Xác nhận đơn thuê (chủ sở hữu)
router.patch(
  '/orders/:orderId/confirm',
  authMiddleware.verifyToken,
  mongoIdValidation,
  validateRequest,
  rentalController.confirmRentalOrder
);

// 5. Hủy đơn thuê
router.patch(
  '/orders/:orderId/cancel',
  authMiddleware.verifyToken,
  [
    ...mongoIdValidation,
    body('reason').optional().isString().withMessage('Lý do hủy phải là chuỗi')
  ],
  validateRequest,
  rentalController.cancelRentalOrder
);

// 6. Bắt đầu thời gian thuê
router.patch(
  '/orders/:orderId/start',
  authMiddleware.verifyToken,
  mongoIdValidation,
  validateRequest,
  rentalController.startRental
);

// 7. Trả sản phẩm
router.patch(
  '/orders/:orderId/return',
  authMiddleware.verifyToken,
  [
    ...mongoIdValidation,
    body('condition')
      .notEmpty()
      .withMessage('Tình trạng sản phẩm là bắt buộc')
      .isIn(['GOOD', 'DAMAGED', 'LOST'])
      .withMessage('Tình trạng sản phẩm không hợp lệ'),
    body('note').optional().isString().withMessage('Ghi chú phải là chuỗi'),
    body('images').optional().isArray().withMessage('Hình ảnh phải là mảng')
  ],
  validateRequest,
  rentalController.returnProduct
);

// 8. Lấy lịch sử thuê
router.get(
  '/history',
  authMiddleware.verifyToken,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Trang phải là số nguyên dương'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit phải từ 1 đến 100')
  ],
  validateRequest,
  rentalController.getRentalHistory
);

// === CONTRACT ROUTES ===

// 9. Lấy hợp đồng để ký
router.get(
  '/contracts/:contractId',
  authMiddleware.verifyToken,
  contractIdValidation,
  validateRequest,
  rentalController.getContractForSigning
);

// 10. Ký hợp đồng điện tử
router.patch(
  '/contracts/:contractId/sign',
  authMiddleware.verifyToken,
  contractSigningLimiter,
  validateIPAddress,
  signContractValidation,
  validateRequest,
  validateSignature,
  checkSigningPermission,
  rentalController.signContract
);

// 11. Tải hợp đồng đã ký (PDF)
router.get(
  '/contracts/:contractId/download',
  authMiddleware.verifyToken,
  contractIdValidation,
  validateRequest,
  rentalController.downloadContract
);

// === SIGNATURE ROUTES ===

// 12. Lấy chữ ký đã lưu của người dùng
router.get('/signatures/me', authMiddleware.verifyToken, rentalController.getUserSignature);

// === PAYMENT ROUTES ===

// 13. Thanh toán đơn thuê
router.post(
  '/orders/:orderId/payment',
  authMiddleware.verifyToken,
  processPaymentValidation,
  validateRequest,
  rentalController.processPayment
);

module.exports = router;
