const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const { generateSearchConditions } = require('../utils/vietnameseSearch');
const promotedProductCache = require('../utils/promotedProductCache');

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
    // ALWAYS exclude OWNER_DELETED and OWNER_HIDDEN from public views
    const filter = {
      status: { $nin: ['OWNER_DELETED', 'OWNER_HIDDEN'] }
    };

    if (Object.prototype.hasOwnProperty.call(filters, 'status')) {
      // frontend explicitly provided status
      const s = String(filters.status || '').trim();
      if (s !== '') {
        // map to uppercase values used in DB (e.g., 'active' -> 'ACTIVE')
        filter.status = s.toUpperCase();
      } // empty string => do not filter by status (show all except OWNER_DELETED and OWNER_HIDDEN)
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

    // Category filter - CORRECTED: Handle both category and subCategory fields in Product
    let categoryConditions = null;
    if (category && category.trim()) {
      if (category.match(/^[0-9a-fA-F]{24}$/)) {
        // Valid ObjectID - check if it's a parent or subcategory
        const categoryDoc = await Category.findById(category);
        if (categoryDoc) {
          if (categoryDoc.level === 0) {
            // Parent category - find products that have this as main category
            // OR have subcategories that belong to this parent
            const subcategoryIds = await Category.find({
              parentCategory: categoryDoc._id
            }).distinct('_id');
            categoryConditions = [
              { category: categoryDoc._id }, // Products directly in parent category
              { subCategory: { $in: subcategoryIds } } // Products in subcategories
            ];
          } else {
            // Subcategory - filter by subCategory field specifically
            filter.subCategory = category;
          }
        }
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
          if (categoryDoc.level === 0) {
            // Parent category - find products that have this as main category
            // OR have subcategories that belong to this parent
            const subcategoryIds = await Category.find({
              parentCategory: categoryDoc._id
            }).distinct('_id');
            categoryConditions = [
              { category: categoryDoc._id }, // Products directly in parent category
              { subCategory: { $in: subcategoryIds } } // Products in subcategories
            ];
          } else {
            // Subcategory - filter by subCategory field specifically
            filter.subCategory = categoryDoc._id;
          }
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
    const rawLocation = location || filters.district || '' || '';
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

      // Handle $or conflicts properly with both category and location conditions
      const existingOrConditions = [];

      // Add category conditions if exist
      if (categoryConditions) {
        existingOrConditions.push({ $or: categoryConditions });
      }

      // Add search conditions if exist
      if (filter.$or) {
        existingOrConditions.push({ $or: filter.$or });
        delete filter.$or;
      }

      // Add location conditions
      existingOrConditions.push({ $or: locationConditions });

      // Combine all conditions with $and
      if (existingOrConditions.length > 1) {
        filter.$and = existingOrConditions;
      } else {
        filter.$or = locationConditions;
      }
    }

    // Apply category conditions if no location filter was applied
    if (categoryConditions && !locationValue) {
      // Handle $or conflicts with search conditions
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: categoryConditions }];
        delete filter.$or;
      } else {
        filter.$or = categoryConditions;
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

    // Build sort options - APPLY USER-SELECTED SORT FOR NON-PROMOTED PRODUCTS
    const sortOptions = {};

    // Sort for non-promoted products (promoted products will be sorted separately via cache)
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
      // Fetch ALL products without pagination first (for proper promoted randomization)
      const [allProducts, total] = await Promise.all([
        Product.find(filter)
          .populate('category', 'name slug')
          .populate('subCategory', 'name slug')
          .populate('owner', 'email profile.firstName profile.lastName trustScore')
          .populate('currentPromotion', 'tier startDate endDate isActive')
          .sort(sortOptions)
          .lean(),
        Product.countDocuments(filter)
      ]);

      // Separate promoted and non-promoted products
      const promotedProducts = allProducts.filter(p => p.isPromoted && p.promotionTier);
      const nonPromotedProducts = allProducts.filter(p => !p.isPromoted || !p.promotionTier);

      // Get or generate randomized order for promoted products (cached for 2 minutes)
      const cachedPromotedOrder = promotedProductCache.getOrGenerateOrder(promotedProducts);
      
      // Apply cached order to promoted products
      const orderedPromotedProducts = promotedProductCache.applyOrder(
        promotedProducts, 
        cachedPromotedOrder
      );

      // Combine: promoted first (in cached random order), then non-promoted (in user-selected sort)
      const sortedProducts = [...orderedPromotedProducts, ...nonPromotedProducts];

      // Apply pagination AFTER sorting
      const paginatedProducts = sortedProducts.slice(skip, skip + limitNum);

      const pagination = {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      };

      return {
        products: paginatedProducts,
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

    // Check if product is hidden or deleted by owner
    if (product.status === 'OWNER_HIDDEN' || product.status === 'OWNER_DELETED') {
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
          status: { $nin: ['OWNER_HIDDEN', 'OWNER_DELETED'] },
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
        { $match: { status: { $nin: ['OWNER_HIDDEN', 'OWNER_DELETED'] } } },
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
        { $match: { status: { $nin: ['OWNER_HIDDEN', 'OWNER_DELETED'] } } },
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
        status: { $nin: ['OWNER_HIDDEN', 'OWNER_DELETED'] },
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
