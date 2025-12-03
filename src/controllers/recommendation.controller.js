const recommendationService = require('../services/recommendation.service');
const { SUCCESS } = require('../core/success');

const recommendationController = {
  /**
   * Track category click when user views a product
   * POST /api/recommendations/track-click
   */
  trackCategoryClick: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { categoryId } = req.body;

      if (!categoryId) {
        return res.status(400).json({
          success: false,
          message: 'Category ID is required'
        });
      }

      const result = await recommendationService.trackCategoryClick(userId, categoryId);

      new SUCCESS({
        message: 'Category click tracked successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get all active products by owner
   * GET /api/recommendations/owner/:ownerId/products
   * Supports hotOnly and recommendedOnly filters
   */
  getProductsByOwner: async (req, res, next) => {
    try {
      const { ownerId } = req.params;
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 12, 50),
        search: req.query.search,
        category: req.query.category,
        sort: req.query.sort || 'createdAt',
        order: req.query.order || 'desc',
        hotOnly: req.query.hotOnly === 'true',
        recommendedOnly: req.query.recommendedOnly === 'true',
        userId: req.user?._id // Pass user ID for personalized recommendations
      };

      const result = await recommendationService.getProductsByOwner(ownerId, filters);

      new SUCCESS({
        message: result.message || 'Owner products retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get hot/trending products
   * GET /api/recommendations/hot
   */
  getHotProducts: async (req, res, next) => {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 12, 50)
      };

      const result = await recommendationService.getHotProducts(filters);

      new SUCCESS({
        message: 'Hot products retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get personalized recommended products for user
   * GET /api/recommendations/for-you
   * If user is not logged in, falls back to hot products
   */
  getRecommendedProducts: async (req, res, next) => {
    try {
      const userId = req.user?._id || null;
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 12, 50)
      };

      const result = await recommendationService.getRecommendedProducts(userId, filters);

      new SUCCESS({
        message: 'Recommended products retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }
};

module.exports = recommendationController;
