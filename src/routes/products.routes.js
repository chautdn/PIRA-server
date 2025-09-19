const express = require('express');
const router = express.Router();
const { registerRoute } = require('./register.routes');
const productController = require('../controllers/product.controller');
const globalAsyncHandler = require('../middleware/handler');

// Apply global async handler to router
globalAsyncHandler(router);

// GET /api/products - Get products with filtering, search, pagination
router.get('/', productController.getProducts);

// GET /api/products/categories - Get all categories for filtering
router.get('/categories', productController.getCategories);

// GET /api/products/search-suggestions - Get search suggestions
router.get('/search-suggestions', productController.getSearchSuggestions);

// GET /api/products/filter-options - Get filter options (price range, locations, etc.)
router.get('/filter-options', productController.getFilterOptions);

// GET /api/products/:id - Get product by ID
router.get('/:id', productController.getProductById);

registerRoute('/products', router);

module.exports = router;