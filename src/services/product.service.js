const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const { generateSearchConditions } = require('../utils/vietnameseSearch');

const productService = {
  /**
   * Get products with advanced filtering, search, and pagination
   */
  getProducts: async (filters) => {
    // First, test basic database connection
    try {
      const totalProductsInDB = await Product.countDocuments({});
      const activeProducts = await Product.countDocuments({ status: 'ACTIVE' });

      // Get a sample product to check structure - INCLUDING PRICING
      const sampleProduct = await Product.findOne({})
        .select('title category status pricing')
        .lean();
    } catch (dbError) {
      // Database connection test failed
    }

    const {
      page = 1,
      limit = 12,
      search,
      category,
      priceMin,
      priceMax,
      location,
      available,
      sort = 'createdAt',
      order = 'desc'
    } = filters;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build query filter - START WITH BASIC
    const filter = { status: 'ACTIVE' };

    // Text search - COMPREHENSIVE VIETNAMESE SEARCH
    if (search && search.trim()) {
      const searchTerm = search.trim();

      // Use comprehensive Vietnamese search utility
      const searchConditions = generateSearchConditions(searchTerm, [
        'title',
        'description',
        'brand.name',
        'brand.model'
      ]);

      filter.$or = searchConditions;
    }

    // Category filter - FIXED: Handle mapping from frontend IDs
    if (category && category.trim()) {
      // First, debug what categories exist in database
      const allCategories = await Category.find({}).select('_id name');

      if (category.match(/^[0-9a-fA-F]{24}$/)) {
        // Valid ObjectID
        filter.category = category;
      } else {
        // Map frontend fake IDs to real category names
        const categoryMapping = {
          cameras: 'Máy ảnh & Quay phim',
          camping: 'Thiết bị cắm trại',
          luggage: 'Vali & Túi xách',
          sports: 'Thiết bị thể thao',
          accessories: 'Phụ kiện du lịch'
        };

        const categoryName = categoryMapping[category] || category;

        // Find category by name to get real ObjectId
        const categoryDoc = await Category.findOne({
          name: { $regex: categoryName, $options: 'i' }
        });

        if (categoryDoc) {
          filter.category = categoryDoc._id;
        } else {
          // Don't add filter if category not found - show all products
        }
      }
    }

    // Price range filter - RE-ENABLED
    if (priceMin || priceMax) {
      filter['pricing.dailyRate'] = {};
      if (priceMin) filter['pricing.dailyRate'].$gte = parseInt(priceMin);
      if (priceMax) filter['pricing.dailyRate'].$lte = parseInt(priceMax);
    }

    // Location filter - RE-ENABLED but handle $or conflicts
    if (location) {
      const locationConditions = [
        { 'location.address.city': { $regex: location, $options: 'i' } },
        { 'location.address.province': { $regex: location, $options: 'i' } },
        { 'location.address.district': { $regex: location, $options: 'i' } }
      ];

      // Handle $or conflicts properly
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: locationConditions }];
        delete filter.$or;
      } else {
        filter.$or = locationConditions;
      }
    }

    // Availability filter
    if (available === 'true') {
      filter['availability.isAvailable'] = true;
      filter['availability.quantity'] = { $gt: 0 };
    }

    // Build sort options
    const sortOptions = {};
    switch (sort) {
      case 'price':
        sortOptions['pricing.dailyRate'] = order === 'asc' ? 1 : -1;
        break;
      case 'rating':
        sortOptions['metrics.averageRating'] = order === 'asc' ? 1 : -1;
        break;
      case 'popular':
        sortOptions['metrics.viewCount'] = order === 'asc' ? 1 : -1;
        break;
      case 'createdAt':
      default:
        sortOptions.createdAt = order === 'asc' ? 1 : -1;
        break;
    }

    try {
      const [products, total] = await Promise.all([
        Product.find(filter)
          .populate('category', 'name slug')
          .populate('owner', 'email profile.firstName profile.lastName trustScore')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Product.countDocuments(filter)
      ]);

      const pagination = {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      };

      return {
        products,
        pagination,
        filters: {
          search,
          category,
          priceMin,
          priceMax,
          location,
          available,
          sort,
          order
        }
      };
    } catch (error) {
      // Database query error
      throw error;
    }
  },

  /**
   * Get product by ID with detailed information
   */
  getProductById: async (productId) => {
    const product = await Product.findById(productId)
      .populate('category', 'name slug')
      .populate('owner', 'email profile trustScore')
      .lean();

    if (!product) {
      throw new Error('Sản phẩm không tồn tại');
    }

    // Increment view count
    await Product.findByIdAndUpdate(productId, {
      $inc: { 'metrics.viewCount': 1 }
    });

    return product;
  },

  /**
   * Get all categories for filtering
   */
  getCategories: async () => {
    const categories = await Category.find({ status: 'ACTIVE' })
      .select('name slug')
      .sort({ name: 1 })
      .lean();

    // If no categories in database, create some default ones
    if (categories.length === 0) {
      const defaultCategories = [
        { name: 'Máy ảnh & Quay phim', slug: 'may-anh-quay-phim', status: 'ACTIVE' },
        { name: 'Thiết bị cắm trại', slug: 'thiet-bi-cam-trai', status: 'ACTIVE' },
        { name: 'Vali & Túi xách', slug: 'vali-tui-xach', status: 'ACTIVE' },
        { name: 'Thiết bị thể thao', slug: 'thiet-bi-the-thao', status: 'ACTIVE' },
        { name: 'Phụ kiện du lịch', slug: 'phu-kien-du-lich', status: 'ACTIVE' }
      ];

      try {
        const createdCategories = await Category.insertMany(defaultCategories);
        return createdCategories;
      } catch (error) {
        // Failed to create categories
        return [];
      }
    }

    return categories;
  },

  /**
   * Get search suggestions based on product titles and categories
   */
  getSearchSuggestions: async (query) => {
    if (!query || query.length < 2) {
      return [];
    }

    // Get product title suggestions
    const productSuggestions = await Product.aggregate([
      {
        $match: {
          status: 'ACTIVE',
          title: { $regex: query, $options: 'i' }
        }
      },
      {
        $project: {
          title: 1,
          type: { $literal: 'product' }
        }
      },
      { $limit: 5 }
    ]);

    // Get category suggestions
    const categorySuggestions = await Category.aggregate([
      {
        $match: {
          status: 'ACTIVE',
          name: { $regex: query, $options: 'i' }
        }
      },
      {
        $project: {
          title: '$name',
          type: { $literal: 'category' }
        }
      },
      { $limit: 3 }
    ]);

    return [...productSuggestions, ...categorySuggestions];
  },

  /**
   * Get filter options for advanced filtering
   */
  getFilterOptions: async () => {
    const [priceRange, locations, categories] = await Promise.all([
      // Get price range
      Product.aggregate([
        { $match: { status: 'ACTIVE' } },
        {
          $group: {
            _id: null,
            minPrice: { $min: '$pricing.dailyRate' },
            maxPrice: { $max: '$pricing.dailyRate' }
          }
        }
      ]),

      // Get unique locations
      Product.aggregate([
        { $match: { status: 'ACTIVE' } },
        {
          $group: {
            _id: '$location.address.city',
            count: { $sum: 1 }
          }
        },
        { $match: { _id: { $ne: null } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),

      // Get categories with counts
      Category.aggregate([
        { $match: { status: 'ACTIVE' } },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: 'category',
            as: 'products'
          }
        },
        {
          $project: {
            name: 1,
            slug: 1,
            productCount: { $size: '$products' }
          }
        },
        { $match: { productCount: { $gt: 0 } } },
        { $sort: { name: 1 } }
      ])
    ]);

    return {
      priceRange: priceRange[0] || { minPrice: 0, maxPrice: 1000000 },
      locations: locations.map((loc) => ({
        name: loc._id,
        count: loc.count
      })),
      categories: categories
    };
  },

  /**
   * Get featured products for homepage
   * Returns products with active featured status, sorted by tier and last upgrade date
   */
  getFeaturedProducts: async (limit = 6) => {
    try {
      const now = new Date();

      const featuredProducts = await Product.find({
        status: 'ACTIVE',
        featuredTier: { $exists: true, $ne: null },
        featuredPaymentStatus: 'PAID',
        $or: [{ featuredExpiresAt: { $gt: now } }, { featuredExpiresAt: { $exists: false } }]
      })
        .populate('category', 'name')
        .populate('owner', 'profile.firstName profile.lastName profile.avatar')
        .sort({
          featuredTier: 1, // Tier 1 (highest) first
          featuredUpgradedAt: -1 // Most recently upgraded first within same tier
        })
        .limit(limit)
        .lean();

      // Filter out products with expired featured status
      const validFeaturedProducts = featuredProducts.filter((product) => {
        if (!product.featuredTier) {
          return false;
        }

        const endDate = product.featuredExpiresAt;

        // Check if featured is still active
        if (endDate && now > new Date(endDate)) {
          return false;
        }

        return true;
      });

      return validFeaturedProducts;
    } catch (error) {
      throw new Error(`Failed to get featured products: ${error.message}`);
    }
  }
};

module.exports = productService;
