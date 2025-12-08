const Product = require('../models/Product');
const User = require('../models/User');
const Category = require('../models/Category');

/**
 * Calculate time-decayed score for category preferences
 * Recent clicks have more weight than older clicks
 * Uses exponential decay: score = sum(e^(-days/halfLife))
 * 
 * @param {Date[]} clicks - Array of click timestamps
 * @param {number} halfLife - Days for preference to decay to 50% (default: 3 days)
 * @returns {number} - Time-decayed score
 */
const calculateDecayedScore = (clicks, halfLife = 3) => {
  if (!clicks || clicks.length === 0) return 0;
  
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  
  return clicks.reduce((score, clickDate) => {
    const daysAgo = (now - new Date(clickDate)) / msPerDay;
    // Exponential decay: e^(-days/halfLife)
    // With 3-day half-life:
    //   Today: weight = 1.0 (100%)
    //   3 days ago: weight = 0.5 (50%)
    //   6 days ago: weight = 0.25 (25%)
    //   10 days ago: weight = 0.10 (10%)
    // This ensures recent clicks matter much more than old ones
    const weight = Math.exp(-daysAgo / halfLife);
    return score + weight;
  }, 0);
};

const recommendationService = {
  /**
   * Track user's category click
   * Stores timestamp for each click to enable time-decay recommendations
   */
  trackCategoryClick: async (userId, categoryId) => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Initialize categoryPreferences if not exists
      if (!user.categoryPreferences) {
        user.categoryPreferences = new Map();
      }

      // Add current timestamp to category clicks
      const clicks = user.categoryPreferences.get(categoryId) || [];
      clicks.push(new Date());
      
      // Keep only last 100 clicks per category to prevent unbounded growth
      if (clicks.length > 100) {
        clicks.shift();
      }
      
      user.categoryPreferences.set(categoryId, clicks);
      await user.save();

      return {
        success: true,
        categoryId,
        clickCount: clicks.length
      };
    } catch (error) {
      console.error('Error tracking category click:', error);
      throw error;
    }
  },

  /**
   * Get products by owner ID
   * Returns all active products owned by specific user
   * Can filter for hot products or recommended products
   */
  getProductsByOwner: async (ownerId, filters = {}) => {
    const {
      page = 1,
      limit = 12,
      search,
      category,
      sort = 'createdAt',
      order = 'desc',
      hotOnly = false,
      recommendedOnly = false,
      userId = null
    } = filters;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query = {
      owner: ownerId,
      status: 'ACTIVE'
    };

    // Hot products filter - with fallback
    let useHotFallback = false;
    if (hotOnly) {
      // First, try to find hot products
      const hotQuery = {
        ...query,
        'metrics.averageRating': { $gte: 4.0 },
        'metrics.reviewCount': { $gte: 5 }
      };
      const hotCount = await Product.countDocuments(hotQuery);
      
      if (hotCount > 0) {
        // Has hot products - use strict criteria
        query['metrics.averageRating'] = { $gte: 4.0 };
        query['metrics.reviewCount'] = { $gte: 5 };
      } else {
        // No hot products - show all products but sorted by rating
        useHotFallback = true;
      }
    }

    // Recommended products filter - with smart fallback
    let useRecommendedFallback = false;
    let fetchProductsSeparately = false;
    let categoryFilters = [];
    
    if (recommendedOnly) {
      if (!userId) {
        // No user logged in - show all products sorted by popularity
        useRecommendedFallback = true;
      } else {
        // Get user's category preferences
        const user = await User.findById(userId).select('categoryPreferences').lean();
        if (!user || !user.categoryPreferences || Object.keys(user.categoryPreferences).length === 0) {
          // No browsing history - show all products sorted by popularity
          useRecommendedFallback = true;
        } else {

          // Get top 3 categories from user preferences using time-decayed scores
          const categoryArray = Object.entries(user.categoryPreferences)
            .map(([categoryId, clicks]) => ({ 
              categoryId, 
              score: calculateDecayedScore(clicks),
              clickCount: clicks.length 
            }))
            .filter(cat => cat.score > 0) // Only include categories with non-zero score
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

          const topCategoryIds = categoryArray.map(cat => cat.categoryId);

          // Optimize: Get all categories and their subcategories in one query
          // This also validates that categories exist
          const categoryDocs = await Category.find({ _id: { $in: topCategoryIds } })
            .select('_id level parentCategory')
            .lean();
          
          // If no valid categories found, use fallback
          if (categoryDocs.length === 0) {
            useRecommendedFallback = true;
          } else {
            // Build separate filters for each preferred category to fetch and interleave
            fetchProductsSeparately = true;
            
            for (const catDoc of categoryDocs) {
              const categoryCondition = [];
              
              if (catDoc.level === 0) {
                // Parent category
                const subCats = await Category.find({
                  parentCategory: catDoc._id
                }).distinct('_id');
                
                categoryCondition.push({ category: catDoc._id });
                if (subCats.length > 0) {
                  categoryCondition.push({ subCategory: { $in: subCats } });
                }
              } else {
                // Subcategory
                categoryCondition.push({ subCategory: catDoc._id });
              }
              
              categoryFilters.push({
                categoryId: catDoc._id.toString(),
                condition: categoryCondition.length > 1 ? { $or: categoryCondition } : categoryCondition[0],
                preference: categoryArray.find(c => c.categoryId === catDoc._id.toString())?.score || 0
              });
            }
            
            // If no valid category filters, use fallback
            if (categoryFilters.length === 0) {
              useRecommendedFallback = true;
              fetchProductsSeparately = false;
            }
          }
        }
      }
    }

    // Search filter
    if (search && search.trim()) {
      const searchCondition = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } }
      ];
      
      if (query.$or) {
        // Combine with existing $or (category conditions)
        query.$and = [
          { $or: query.$or },
          { $or: searchCondition }
        ];
        delete query.$or;
      } else {
        query.$or = searchCondition;
      }
    }

    // Category filter (either main category or subcategory)
    if (category && category.trim() && !recommendedOnly) {
      const categoryDoc = await Category.findById(category);
      if (categoryDoc) {
        if (categoryDoc.level === 0) {
          // Parent category - find products with this category or its subcategories
          const subcategoryIds = await Category.find({
            parentCategory: categoryDoc._id
          }).distinct('_id');
          const categoryCondition = [
            { category: categoryDoc._id },
            { subCategory: { $in: subcategoryIds } }
          ];
          
          if (query.$or) {
            query.$and = [
              { $or: query.$or },
              { $or: categoryCondition }
            ];
            delete query.$or;
          } else {
            query.$or = categoryCondition;
          }
        } else {
          // Subcategory
          query.subCategory = category;
        }
      }
    }

    // Sort options
    let sortOptions = {};
    if (hotOnly || recommendedOnly) {
      // For hot/recommended, prioritize rating and reviews
      // Even in fallback mode, show best products first
      sortOptions = {
        'metrics.averageRating': -1,
        'metrics.reviewCount': -1,
        'metrics.viewCount': -1,
        'createdAt': -1
      };
    } else {
      sortOptions = { [sort]: order === 'desc' ? -1 : 1 };
    }

    // Handle separate fetching for interleaved recommendations
    if (fetchProductsSeparately && categoryFilters.length > 0) {
      // Fetch products from each preferred category separately
      const categoryProductArrays = await Promise.all(
        categoryFilters.map(async ({ condition, preference }) => {
          const categoryQuery = {
            owner: ownerId,
            status: 'ACTIVE',
            ...condition
          };
          
          // Try high-quality first
          let products = await Product.find({
            ...categoryQuery,
            'metrics.averageRating': { $gte: 3.5 }
          })
            .populate('owner', 'profile email')
            .populate('category', 'name')
            .populate('subCategory', 'name')
            .sort(sortOptions)
            .lean();
          
          // If not enough, get all products from this category
          if (products.length === 0) {
            products = await Product.find(categoryQuery)
              .populate('owner', 'profile email')
              .populate('category', 'name')
              .populate('subCategory', 'name')
              .sort(sortOptions)
              .lean();
          }
          
          return { products, preference };
        })
      );
      
      // Interleave products from different categories based on preference weights
      const interleavedProducts = [];
      const maxProducts = Math.max(...categoryProductArrays.map(arr => arr.products.length));
      
      for (let i = 0; i < maxProducts; i++) {
        // Sort by preference for each round
        const sortedByPreference = categoryProductArrays
          .sort((a, b) => b.preference - a.preference);
        
        for (const { products } of sortedByPreference) {
          if (products[i]) {
            // Check if not already added (avoid duplicates)
            const alreadyAdded = interleavedProducts.some(p => p._id.toString() === products[i]._id.toString());
            if (!alreadyAdded) {
              interleavedProducts.push(products[i]);
            }
          }
        }
      }
      
      // If no products found from preferred categories, fall back to all owner products
      if (interleavedProducts.length === 0) {
        const fallbackProducts = await Product.find({
          owner: ownerId,
          status: 'ACTIVE'
        })
          .populate('owner', 'profile email')
          .populate('category', 'name')
          .populate('subCategory', 'name')
          .sort(sortOptions)
          .lean();
        
        const total = fallbackProducts.length;
        const paginatedProducts = fallbackProducts.slice(skip, skip + limitNum);
        
        return {
          products: paginatedProducts,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        };
      }
      
      const total = interleavedProducts.length;
      const paginatedProducts = interleavedProducts.slice(skip, skip + limitNum);
      
      return {
        products: paginatedProducts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      };
    }

    // Execute query - run count and find in parallel for better performance
    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('owner', 'profile email')
        .populate('category', 'name')
        .populate('subCategory', 'name')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query)
    ]);

    return {
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    };
  },

  /**
   * Get hot products (high rating, many reviews)
   * Returns trending products across all categories
   * Prioritizes highest quality, supplements with lower quality if needed
   */
  getHotProducts: async (filters = {}) => {
    const {
      page = 1,
      limit = 12
    } = filters;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // First tier: Premium hot products (4+ stars, 5+ reviews)
    const premiumProducts = await Product.find({
      status: 'ACTIVE',
      'metrics.averageRating': { $gte: 4.0 },
      'metrics.reviewCount': { $gte: 5 }
    })
      .populate('owner', 'profile email')
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .sort({
        'metrics.averageRating': -1,
        'metrics.reviewCount': -1,
        'metrics.viewCount': -1
      })
      .limit(limitNum)
      .lean();

    let allProducts = [...premiumProducts];

    // Second tier: Good products (3.5+ stars) if we don't have enough
    if (allProducts.length < limitNum) {
      const neededCount = limitNum - allProducts.length;
      const existingIds = allProducts.map(p => p._id);
      
      const goodProducts = await Product.find({
        status: 'ACTIVE',
        'metrics.averageRating': { $gte: 3.5 },
        _id: { $nin: existingIds }
      })
        .populate('owner', 'profile email')
        .populate('category', 'name')
        .populate('subCategory', 'name')
        .sort({
          'metrics.averageRating': -1,
          'metrics.reviewCount': -1,
          'metrics.viewCount': -1
        })
        .limit(neededCount)
        .lean();
      
      allProducts = [...allProducts, ...goodProducts];
    }

    // Third tier: Any active products if still not enough
    if (allProducts.length < limitNum) {
      const neededCount = limitNum - allProducts.length;
      const existingIds = allProducts.map(p => p._id);
      
      const anyProducts = await Product.find({
        status: 'ACTIVE',
        _id: { $nin: existingIds }
      })
        .populate('owner', 'profile email')
        .populate('category', 'name')
        .populate('subCategory', 'name')
        .sort({
          'metrics.averageRating': -1,
          'metrics.reviewCount': -1,
          'metrics.viewCount': -1,
          'createdAt': -1
        })
        .limit(neededCount)
        .lean();
      
      allProducts = [...allProducts, ...anyProducts];
    }

    // Apply pagination to the combined results
    const paginatedProducts = allProducts.slice(skip, skip + limitNum);

    return {
      products: paginatedProducts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: allProducts.length,
        pages: Math.ceil(allProducts.length / limitNum)
      }
    };
  },

  /**
   * Get personalized product recommendations
   * Based on user's category click history
   * Mix products from multiple categories (not just one)
   */
  getRecommendedProducts: async (userId, filters = {}) => {
    const {
      page = 1,
      limit = 12
    } = filters;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    try {
      // Get user's category preferences
      const user = await User.findById(userId);
      if (!user || !user.categoryPreferences || user.categoryPreferences.size === 0) {
        // No preferences - return hot products instead
        return recommendationService.getHotProducts(filters);
      }

      // Convert Map to array and calculate time-decayed scores
      const categoryArray = Array.from(user.categoryPreferences.entries())
        .map(([categoryId, clicks]) => ({ 
          categoryId, 
          score: calculateDecayedScore(clicks),
          clickCount: clicks.length 
        }))
        .filter(cat => cat.score > 0) // Only include categories with non-zero score
        .sort((a, b) => b.score - a.score);

      // Get top 3 categories
      const topCategories = categoryArray.slice(0, 3);

      // Validate categories exist in database
      const categoryIds = topCategories.map(cat => cat.categoryId);
      const validCategoryDocs = await Category.find({
        _id: { $in: categoryIds }
      }).lean();

      const validCategoryIds = new Set(validCategoryDocs.map(c => c._id.toString()));
      
      // Filter out invalid categories
      const validTopCategories = topCategories.filter(cat => 
        validCategoryIds.has(cat.categoryId.toString())
      );

      // If no valid categories, fallback to hot products
      if (validTopCategories.length === 0) {
        return recommendationService.getHotProducts(filters);
      }

      // Calculate how many products to fetch from each category
      // Distribute based on time-decayed preference scores
      const totalScore = validTopCategories.reduce((sum, cat) => sum + cat.score, 0);
      const productsPerCategory = validTopCategories.map(cat => ({
        categoryId: cat.categoryId,
        categoryDoc: validCategoryDocs.find(c => c._id.toString() === cat.categoryId.toString()),
        preference: cat.score,
        count: Math.max(1, Math.round((cat.score / totalScore) * limitNum))
      }));

      // Fetch products from each category separately for interleaving
      const productPromises = productsPerCategory.map(async ({ categoryId, categoryDoc }) => {
        let categoryFilter = {};

        if (categoryDoc.level === 0) {
          // Parent category - get products from this category and its subcategories
          const subcategoryIds = await Category.find({
            parentCategory: categoryDoc._id
          }).distinct('_id');
          categoryFilter = {
            $or: [
              { category: categoryDoc._id },
              { subCategory: { $in: subcategoryIds } }
            ]
          };
        } else {
          // Subcategory
          categoryFilter = { subCategory: categoryId };
        }

        // First try: Get high-quality products (rating >= 3.5)
        let products = await Product.find({
          ...categoryFilter,
          status: 'ACTIVE',
          'metrics.averageRating': { $gte: 3.5 }
        })
          .populate('owner', 'profile email')
          .populate('category', 'name')
          .populate('subCategory', 'name')
          .sort({
            'metrics.averageRating': -1,
            'metrics.reviewCount': -1
          })
          .lean();

        // Second try: If no high-quality products, get ANY products from this category
        if (products.length === 0) {
          products = await Product.find({
            ...categoryFilter,
            status: 'ACTIVE'
          })
            .populate('owner', 'profile email')
            .populate('category', 'name')
            .populate('subCategory', 'name')
            .sort({
              'metrics.averageRating': -1,
              'metrics.reviewCount': -1,
              'createdAt': -1
            })
            .lean();
        }

        return products;
      });

      const productArrays = await Promise.all(productPromises);

      // Interleave products from different categories based on preference weights
      const interleavedProducts = [];
      const maxProducts = Math.max(...productArrays.map(arr => arr.length));
      
      for (let i = 0; i < maxProducts; i++) {
        // Sort categories by preference for each round
        const sortedByPreference = productArrays
          .map((products, idx) => ({
            products,
            preference: productsPerCategory[idx].preference
          }))
          .sort((a, b) => b.preference - a.preference);
        
        for (const { products } of sortedByPreference) {
          if (products[i]) {
            // Check if not already added (avoid duplicates)
            const alreadyAdded = interleavedProducts.some(p => p._id.toString() === products[i]._id.toString());
            if (!alreadyAdded) {
              interleavedProducts.push(products[i]);
            }
          }
        }
      }

      // If still no products, fallback to hot products
      if (interleavedProducts.length === 0) {
        return recommendationService.getHotProducts(filters);
      }

      // If we have some products but not enough, supplement with hot products
      if (interleavedProducts.length < limitNum) {
        const hotProductsNeeded = limitNum - interleavedProducts.length;
        const hotProductsResult = await recommendationService.getHotProducts({ 
          limit: hotProductsNeeded 
        });
        
        // Add hot products that aren't already in the list
        const existingIds = new Set(interleavedProducts.map(p => p._id.toString()));
        const newHotProducts = hotProductsResult.products.filter(
          p => !existingIds.has(p._id.toString())
        );
        interleavedProducts.push(...newHotProducts);
      }

      // Apply pagination
      const paginatedProducts = interleavedProducts.slice(skip, skip + limitNum);

      return {
        products: paginatedProducts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: interleavedProducts.length,
          pages: Math.ceil(interleavedProducts.length / limitNum)
        }
      };
    } catch (error) {
      console.error('Error getting recommended products:', error);
      // Fallback to hot products
      return recommendationService.getHotProducts(filters);
    }
  }
};

module.exports = recommendationService;
