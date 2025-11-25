const express = require('express');
const router = express.Router();
const ShipmentController = require('../controllers/shipment.controller');
const { authMiddleware } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { body, param, query } = require('express-validator');
const { registerRoute } = require('./register.routes');

// Middleware xác thực cho tất cả routes
router.use(authMiddleware.verifyToken);

// Validation schemas
const updateShipmentStatusValidation = [
  param('shipmentId').isMongoId().withMessage('Shipment ID không hợp lệ'),
  body('status')
    .isIn(['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'])
    .withMessage('Trạng thái không hợp lệ'),
  body('notes').optional().isString().withMessage('Ghi chú phải là văn bản'),
  body('photos').optional().isArray().withMessage('Photos phải là mảng'),
  body('signature').optional().isString().withMessage('Chữ ký phải là văn bản'),
  body('condition')
    .optional()
    .isIn(['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED'])
    .withMessage('Tình trạng không hợp lệ'),
  validateRequest
];

const createShipmentValidation = [
  body('subOrderId').isMongoId().withMessage('SubOrder ID không hợp lệ'),
  body('type')
    .isIn(['PICKUP', 'DELIVERY', 'RETURN'])
    .withMessage('Loại vận chuyển không hợp lệ'),
  body('fee').optional().isFloat({ min: 0 }).withMessage('Phí vận chuyển không hợp lệ'),
  validateRequest
];

const assignShipperValidation = [
  param('shipmentId').isMongoId().withMessage('Shipment ID không hợp lệ'),
  body('shipperId').isMongoId().withMessage('Shipper ID không hợp lệ'),
  validateRequest
];

// Routes

/**
 * Tạo shipment
 * POST /api/shipments
 */
router.post(
  '/',
  createShipmentValidation,
  ShipmentController.createShipment
);

/**
 * Danh sách shipment
 * GET /api/shipments
 */
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Trang không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Giới hạn không hợp lệ'),
    query('status').optional().isString().withMessage('Trạng thái không hợp lệ'),
    query('subOrderId').optional().isMongoId().withMessage('SubOrder ID không hợp lệ'),
    validateRequest
  ],
  ShipmentController.getShipments
);

/**
 * Lấy chi tiết shipment
 * GET /api/shipments/:shipmentId
 */
router.get(
  '/:shipmentId',
  [param('shipmentId').isMongoId().withMessage('Shipment ID không hợp lệ'), validateRequest],
  ShipmentController.getShipmentDetail
);

/**
 * Cập nhật trạng thái shipment (KHI STATUS = DELIVERED, TỰ ĐỘNG CHUYỂN TIỀN THUÊ)
 * PUT /api/shipments/:shipmentId/status
 */
router.put(
  '/:shipmentId/status',
  updateShipmentStatusValidation,
  ShipmentController.updateShipmentStatus
);

/**
 * Gán shipper cho shipment
 * PUT /api/shipments/:shipmentId/assign-shipper
 */
router.put(
  '/:shipmentId/assign-shipper',
  assignShipperValidation,
  ShipmentController.assignShipper
);

// Register routes
registerRoute('/shipments', router);

module.exports = router;
