const categoryService = require('../services/category.Service');

// Get all categories and subcategories
const getCategories = async (req, res) => {
  try {
    const categories = await categoryService.getCategories();
    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get only parent categories (level 0)
const getParentCategories = async (req, res) => {
  try {
    const categories = await categoryService.getParentCategories();
    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get subcategories by parent ID
const getSubcategories = async (req, res) => {
  try {
    const subcategories = await categoryService.getSubcategories(req.params.parentId);
    res.status(200).json({
      success: true,
      data: subcategories
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get category by ID
const getCategoryById = async (req, res) => {
  try {
    const category = await categoryService.getCategoryById(req.params.id);
    res.status(200).json({
      success: true,
      data: category
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
};
const getCategoryBySlug = async (req, res) => {
  try {
    const category = await categoryService.getCategoryBySlug(req.params.slug);
    res.status(200).json({
      success: true,
      data: category
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getCategories,
  getParentCategories,
  getSubcategories,
  getCategoryById,
  getCategoryBySlug
};
