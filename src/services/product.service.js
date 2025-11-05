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

    // Build query filter
    // Respect the `status` query param from frontend. If frontend explicitly
    // sends status='' (empty) we DO NOT filter by status (return all statuses).
    // If frontend omits the status param entirely we keep the historical
    // behavior of showing only ACTIVE products.
    const filter = {};
    if (Object.prototype.hasOwnProperty.call(filters, 'status')) {
      // frontend explicitly provided status
      const s = String(filters.status || '').trim();
      if (s !== '') {
        // map to uppercase values used in DB (e.g., 'active' -> 'ACTIVE')
        filter.status = s.toUpperCase();
      } // empty string => do not filter by status (show all)
    } else {
      // no status param provided -> keep default behavior
      filter.status = 'ACTIVE';
    }

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
    // Accept `district` from frontend as well (some clients send filters.district)
    // The frontend uses slug-like values (e.g. 'hai-chau'), while DB stores
    // the Vietnamese display names (e.g. 'Hải Châu'). Map common slugs to
    // display names so regex matches correctly.
    const rawLocation = (location || filters.district || '') || '';
    let locationValue = String(rawLocation).trim();
    if (locationValue) {
      const districtMapping = {
        'hai-chau': 'Hải Châu',
        'thanh-khe': 'Thanh Khê',
        'son-tra': 'Sơn Trà',
        'ngu-hanh-son': 'Ngũ Hành Sơn',
        'lien-chieu': 'Liên Chiểu',
        'cam-le': 'Cẩm Lệ'
      };

      const normalized = locationValue.toLowerCase();
      if (districtMapping[normalized]) {
        locationValue = districtMapping[normalized];
      }

      const locationConditions = [
        { 'location.address.city': { $regex: locationValue, $options: 'i' } },
        { 'location.address.province': { $regex: locationValue, $options: 'i' } },
        { 'location.address.district': { $regex: locationValue, $options: 'i' } }
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
    // Condition filter (product physical condition)
    if (filters.condition) {
      // Map frontend values like 'like-new' -> 'LIKE_NEW'
      const cond = String(filters.condition).trim().toUpperCase().replace(/-/g, '_');
      if (cond) filter.condition = cond;
    }

    // Build sort options - PRIORITIZE PROMOTED PRODUCTS
    const sortOptions = {};

    // Always sort promoted products first (isPromoted: true)
    // Then by promotionTier (1 = highest, 5 = lowest)
    sortOptions.isPromoted = -1; // Promoted products first
    sortOptions.promotionTier = 1; // Lower tier number = higher priority

    // Then apply user-selected sort
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
          .populate('currentPromotion', 'tier startDate endDate isActive')
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
   * Get promoted products for homepage
   * Returns products with active promotion status, sorted by tier and creation date
   */
  getPromotedProducts: async (limit = 6) => {
    try {
      const promotedProducts = await Product.find({
        status: 'ACTIVE',
        isPromoted: true,
        promotionTier: { $exists: true, $ne: null }
      })
        .populate('category', 'name')
        .populate('owner', 'profile.firstName profile.lastName profile.avatar')
        .populate('currentPromotion', 'tier endDate isActive')
        .sort({
          promotionTier: 1, // Tier 1 (highest) first
          createdAt: -1 // Most recent first within same tier
        })
        .limit(limit)
        .lean();

      return promotedProducts;
    } catch (error) {
      throw new Error(`Failed to get promoted products: ${error.message}`);
    }
  },

  /**
   * Legacy method - kept for backward compatibility
   * @deprecated Use getPromotedProducts instead
   */
  getFeaturedProducts: async (limit = 6) => {
    return productService.getPromotedProducts(limit);
  }
};

module.exports = productService;
