const productService = require('../services/product.service');
const responseUtils = require('../utils/response');
const promotedProductCache = require('../utils/promotedProductCache');

const productController = {
  /**
   * Get products with advanced filtering, search, and pagination
   */
  getProducts: async (req, res) => {
    try {
      const result = await productService.getProducts(req.query);

      responseUtils.success(
        res,
        {
          products: result.products,
          pagination: result.pagination,
          filters: result.filters
        },
        'Lấy danh sách sản phẩm thành công'
      );
    } catch (error) {
      // Get products error
      responseUtils.error(res, error.message, 500);
    }
  },

  /**
   * Get product by ID with detailed information
   */
  getProductById: async (req, res) => {
    try {
      const { id } = req.params;
      const product = await productService.getProductById(id);

      responseUtils.success(res, { product }, 'Lấy chi tiết sản phẩm thành công');
    } catch (error) {
      // Get product by ID error
      const statusCode = error.message === 'Sản phẩm không tồn tại' ? 404 : 500;
      responseUtils.error(res, error.message, statusCode);
    }
  },

  /**
   * Get all categories for filtering
   */
  getCategories: async (req, res) => {
    try {
      const categories = await productService.getCategories();

      responseUtils.success(res, { categories }, 'Lấy danh sách danh mục thành công');
    } catch (error) {
      // Get categories error
      responseUtils.error(res, error.message, 500);
    }
  },

  /**
   * Get search suggestions based on product titles and categories
   */
  getSearchSuggestions: async (req, res) => {
    try {
      const { q } = req.query;
      const suggestions = await productService.getSearchSuggestions(q);

      responseUtils.success(res, { suggestions }, 'Lấy gợi ý tìm kiếm thành công');
    } catch (error) {
      // Get search suggestions error
      responseUtils.error(res, error.message, 500);
    }
  },

  /**
   * Get filter options for advanced filtering
   */
  getFilterOptions: async (req, res) => {
    try {
      const filterOptions = await productService.getFilterOptions();

      responseUtils.success(res, { filterOptions }, 'Lấy tùy chọn lọc thành công');
    } catch (error) {
      // Get filter options error
      responseUtils.error(res, error.message, 500);
    }
  },

  // Get featured products for homepage
  getFeaturedProducts: async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 6;
      const featuredProducts = await productService.getFeaturedProducts(limit);

      responseUtils.success(res, featuredProducts, 'Featured products retrieved successfully');
    } catch (error) {
      // Get featured products error
      responseUtils.error(res, error.message, 500);
    }
  },

  // Get promoted product cache status (for debugging)
  getCacheStatus: async (req, res) => {
    try {
      const status = promotedProductCache.getStatus();
      responseUtils.success(res, status, 'Cache status retrieved successfully');
    } catch (error) {
      responseUtils.error(res, error.message, 500);
    }
  },

  // Clear promoted product cache (admin only - for manual refresh)
  clearCache: async (req, res) => {
    try {
      promotedProductCache.clear();
      responseUtils.success(res, { cleared: true }, 'Cache cleared successfully');
    } catch (error) {
      responseUtils.error(res, error.message, 500);
    }
  }
};

module.exports = productController;
