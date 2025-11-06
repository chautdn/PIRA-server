const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const { registerRoute } = require('./register.routes');

router.get('/', categoryController.getCategories);
router.get('/parents', categoryController.getParentCategories);
router.get('/subcategories/:parentId', categoryController.getSubcategories);
router.get('/:id', categoryController.getCategoryById);
router.get('/slug/:slug', categoryController.getCategoryBySlug);
registerRoute('/categories', router);

module.exports = router;
