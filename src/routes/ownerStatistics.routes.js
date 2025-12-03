const express = require('express');
const router = express.Router();
const ownerStatisticsController = require('../controllers/ownerStatistics.controller');
const { authMiddleware } = require('../middleware/auth');
const { query } = require('express-validator');

// Apply authentication and role middleware to all routes
router.use(authMiddleware.verifyToken);
router.use(authMiddleware.checkUserRole(['OWNER']));

/**
 * @route   GET /api/owner/statistics/overview
 * @desc    Lấy thống kê tổng quan của owner (sản phẩm, đơn hàng, doanh thu)
 * @access  Private (Owner only)
 */
router.get('/overview', ownerStatisticsController.getOverviewStatistics);

/**
 * @route   GET /api/owner/statistics/products
 * @desc    Lấy thống kê chi tiết về sản phẩm
 * @access  Private (Owner only)
 * @query   status - Lọc theo trạng thái sản phẩm (AVAILABLE, RENTED, UNAVAILABLE)
 * @query   category - Lọc theo category ID
 * @query   startDate - Ngày bắt đầu (ISO format)
 * @query   endDate - Ngày kết thúc (ISO format)
 * @query   page - Số trang (default: 1)
 * @query   limit - Số items per page (default: 10)
 * @query   sort - Trường để sort (default: createdAt)
 * @query   order - Thứ tự sort: asc/desc (default: desc)
 */
router.get(
  '/products',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['AVAILABLE', 'RENTED', 'UNAVAILABLE']).withMessage('Invalid status'),
    query('category').optional().isMongoId().withMessage('Invalid category ID'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('sort').optional().isString().withMessage('Sort must be a string'),
    query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc')
  ],
  ownerStatisticsController.getProductStatistics
);

/**
 * @route   GET /api/owner/statistics/orders
 * @desc    Lấy thống kê chi tiết về đơn hàng
 * @access  Private (Owner only)
 * @query   status - Lọc theo trạng thái đơn hàng
 * @query   startDate - Ngày bắt đầu (ISO format)
 * @query   endDate - Ngày kết thúc (ISO format)
 * @query   page - Số trang (default: 1)
 * @query   limit - Số items per page (default: 10)
 * @query   sort - Trường để sort (default: createdAt)
 * @query   order - Thứ tự sort: asc/desc (default: desc)
 */
router.get(
  '/orders',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isString().withMessage('Status must be a string'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('sort').optional().isString().withMessage('Sort must be a string'),
    query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc')
  ],
  ownerStatisticsController.getOrderStatistics
);

/**
 * @route   GET /api/owner/statistics/revenue
 * @desc    Lấy thống kê doanh thu theo thời gian
 * @access  Private (Owner only)
 * @query   startDate - Ngày bắt đầu (ISO format)
 * @query   endDate - Ngày kết thúc (ISO format)
 * @query   groupBy - Nhóm theo: day, week, month, year (default: month)
 */
router.get(
  '/revenue',
  [
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
    query('groupBy').optional().isIn(['day', 'week', 'month', 'year']).withMessage('Invalid groupBy value')
  ],
  ownerStatisticsController.getRevenueStatistics
);

/**
 * @route   GET /api/owner/statistics/top-products
 * @desc    Lấy top sản phẩm có doanh thu cao nhất
 * @access  Private (Owner only)
 * @query   limit - Số lượng sản phẩm top (default: 10)
 */
router.get(
  '/top-products',
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ],
  ownerStatisticsController.getTopRevenueProducts
);

/**
 * @route   GET /api/owner/statistics/currently-rented
 * @desc    Lấy danh sách sản phẩm đang cho thuê
 * @access  Private (Owner only)
 */
router.get('/currently-rented', ownerStatisticsController.getCurrentlyRentedProducts);

module.exports = router;
