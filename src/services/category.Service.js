const Category = require('../models/Category');

// Get all categories and subcategories
const getCategories = async () => {
  try {
    const categories = await Category.find({ deletedAt: null, level: 0 })
      .populate('parentCategory', 'name slug')
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    // Get subcategories for each category
    const result = await Promise.all(
      categories.map(async (category) => {
        const subcategories = await Category.find({
          parentCategory: category._id,
          deletedAt: null
        }).lean();
        return { ...category, subcategories };
      })
    );

    return result;
  } catch (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }
};

// Get category by ID
const getCategoryById = async (id) => {
  try {
    const category = await Category.findOne({ _id: id, deletedAt: null })
      .populate('parentCategory', 'name slug')
      .lean();

    if (!category) {
      throw new Error('Category not found');
    }

    // Get subcategories if any
    const subcategories = await Category.find({
      parentCategory: id,
      deletedAt: null
    }).lean();

    return { ...category, subcategories };
  } catch (error) {
    throw new Error(`Failed to fetch category: ${error.message}`);
  }
};

const getCategoryBySlug = async (slug) => {
  try {
    const category = await Category.findOne({ slug, deletedAt: null })
      .populate('parentCategory', 'name slug')
      .lean();
    if (!category) {
      throw new Error('Category not found');
    }
    return category;
  } catch (error) {
    throw new Error(`Failed to fetch category: ${error.message}`);
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  getCategoryBySlug
};
