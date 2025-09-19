const productService = require('../services/product.service');
const responseUtils = require('../utils/response');

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
      console.error('Get products error:', error);
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
      
      responseUtils.success(
        res,
        { product },
        'Lấy chi tiết sản phẩm thành công'
      );
    } catch (error) {
      console.error('Get product by ID error:', error);
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
      
      responseUtils.success(
        res,
        { categories },
        'Lấy danh sách danh mục thành công'
      );
    } catch (error) {
      console.error('Get categories error:', error);
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
      
      responseUtils.success(
        res,
        { suggestions },
        'Lấy gợi ý tìm kiếm thành công'
      );
    } catch (error) {
      console.error('Get search suggestions error:', error);
      responseUtils.error(res, error.message, 500);
    }
  },

  /**
   * Get filter options for advanced filtering
   */
  getFilterOptions: async (req, res) => {
    try {
      const filterOptions = await productService.getFilterOptions();
      
      responseUtils.success(
        res,
        { filterOptions },
        'Lấy tùy chọn lọc thành công'
      );
    } catch (error) {
      console.error('Get filter options error:', error);
      responseUtils.error(res, error.message, 500);
    }
  }
};

module.exports = productController;