const ownerStatisticsService = require('../services/ownerStatistics.service');

const ownerStatisticsController = {
  /**
   * GET /api/owner/statistics/overview
   * Lấy thống kê tổng quan của owner
   */
  getOverviewStatistics: async (req, res) => {
    try {
      const ownerId = req.user._id;

      const statistics = await ownerStatisticsService.getOwnerOverviewStatistics(ownerId);

      return res.status(200).json({
        success: true,
        message: 'Owner overview statistics fetched successfully',
        data: statistics
      });
    } catch (error) {
      console.error('Error getting owner overview statistics:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get owner overview statistics'
      });
    }
  },

  /**
   * GET /api/owner/statistics/products
   * Lấy thống kê sản phẩm chi tiết
   */
  getProductStatistics: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const { status, category, startDate, endDate, page, limit, sort, order } = req.query;

      const filters = {
        status,
        category,
        startDate,
        endDate,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10,
        sort: sort || 'createdAt',
        order: order || 'desc'
      };

      const statistics = await ownerStatisticsService.getProductStatistics(ownerId, filters);

      return res.status(200).json({
        success: true,
        message: 'Product statistics fetched successfully',
        data: statistics
      });
    } catch (error) {
      console.error('Error getting product statistics:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get product statistics'
      });
    }
  },

  /**
   * GET /api/owner/statistics/orders
   * Lấy thống kê đơn hàng chi tiết
   */
  getOrderStatistics: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const { status, startDate, endDate, page, limit, sort, order } = req.query;

      const filters = {
        status,
        startDate,
        endDate,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10,
        sort: sort || 'createdAt',
        order: order || 'desc'
      };

      const statistics = await ownerStatisticsService.getOrderStatistics(ownerId, filters);

      return res.status(200).json({
        success: true,
        message: 'Order statistics fetched successfully',
        data: statistics
      });
    } catch (error) {
      console.error('Error getting order statistics:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get order statistics'
      });
    }
  },

  /**
   * GET /api/owner/statistics/revenue
   * Lấy thống kê doanh thu theo thời gian
   */
  getRevenueStatistics: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const { startDate, endDate, groupBy } = req.query;

      const filters = {
        startDate,
        endDate,
        groupBy: groupBy || 'month' // day, week, month, year
      };

      const statistics = await ownerStatisticsService.getRevenueStatistics(ownerId, filters);

      return res.status(200).json({
        success: true,
        message: 'Revenue statistics fetched successfully',
        data: statistics
      });
    } catch (error) {
      console.error('Error getting revenue statistics:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get revenue statistics'
      });
    }
  },

  /**
   * GET /api/owner/statistics/top-products
   * Lấy top sản phẩm có doanh thu cao nhất
   */
  getTopRevenueProducts: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const { limit } = req.query;

      const topProducts = await ownerStatisticsService.getTopRevenueProducts(
        ownerId,
        limit ? parseInt(limit) : 10
      );

      return res.status(200).json({
        success: true,
        message: 'Top revenue products fetched successfully',
        data: topProducts
      });
    } catch (error) {
      console.error('Error getting top revenue products:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get top revenue products'
      });
    }
  },

  /**
   * GET /api/owner/statistics/currently-rented
   * Lấy danh sách sản phẩm đang cho thuê
   */
  getCurrentlyRentedProducts: async (req, res) => {
    try {
      const ownerId = req.user._id;

      const rentedProducts = await ownerStatisticsService.getCurrentlyRentedProducts(ownerId);

      return res.status(200).json({
        success: true,
        message: 'Currently rented products fetched successfully',
        data: rentedProducts
      });
    } catch (error) {
      console.error('Error getting currently rented products:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get currently rented products'
      });
    }
  }
};

module.exports = ownerStatisticsController;
