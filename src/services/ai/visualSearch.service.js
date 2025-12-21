const Product = require('../../models/Product');
const Category = require('../../models/Category');
const TranslationService = require('./translation.service');

/**
 * Visual Search Service
 * Tìm kiếm sản phẩm dựa trên concepts từ phân tích hình ảnh
 */
class VisualSearchService {
  /**
   * Map concepts to categories
   * @param {Array} concepts - Concepts từ Clarifai
   * @param {Array} allCategories - Tất cả categories trong DB
   * @returns {Array} Matched categories với score
   */
  static async mapConceptsToCategories(concepts, allCategories) {
    const categoryScores = new Map();

    // Danh sách keywords cho mỗi category (TIẾNG VIỆT)
    const categoryKeywords = {
      // Đồ điện tử & Công nghệ
      '68d636a969069a18960ce40e': [
        'điện thoại',
        'di động',
        'iphone',
        'smartphone',
        'điện tử',
        'thiết bị',
        'công nghệ',
        'màn hình',
        'hiển thị',
        'máy tính',
        'laptop'
      ],
      '68d636a969069a18960ce410': ['điện thoại', 'di động', 'iphone', 'smartphone', 'phone'],

      // Thời trang & Phụ kiện
      '68d636a969069a18960ce408': [
        'túi',
        'balo',
        'hành lý',
        'vali',
        'thời trang',
        'phụ kiện',
        'du lịch',
        'mang',
        'quần áo'
      ],
      '68d636a969069a18960ce40a': ['balo', 'túi', 'du lịch', 'leo núi', 'ngoài trời'],

      // Thiết bị & Dụng cụ
      '68d636a969069a18960ce426': [
        'máy ảnh',
        'nhiếp ảnh',
        'ống kính',
        'thiết bị',
        'công cụ',
        'ảnh',
        'hình ảnh',
        'chân dung',
        'camera'
      ],
      '68d636a969069a18960ce428': [
        'máy ảnh',
        'nhiếp ảnh',
        'ống kính',
        'ảnh',
        'hình ảnh',
        'chân dung',
        'nhiếp ảnh gia',
        'camera'
      ],

      // Thể thao & Giải trí
      '691a7aea9d6e97161cff9dc3': [
        'thể thao',
        'thể dục',
        'tập luyện',
        'trò chơi',
        'chơi',
        'giải trí',
        'leo núi',
        'bóng'
      ],
      '691a7aea9d6e97161cff9dc9': ['máy ảnh', 'thể thao', 'camera', 'nhiếp ảnh', 'hành trình'],

      // Khác
      '6929409ca1831a4b552980d4': ['khác', 'đồ vật', 'vật phẩm', 'đồ', 'sản phẩm', 'thiết bị'],
      '6929409ca1831a4b552980d8': ['khác', 'đồ vật', 'vật phẩm']
    };

    // Duyệt qua tất cả categories
    for (const category of allCategories) {
      const categoryId = category._id.toString();
      const keywords = categoryKeywords[categoryId] || [];
      let score = 0;

      // So sánh concepts với keywords của category
      for (const concept of concepts) {
        const conceptName = concept.name.toLowerCase();
        const conceptValue = concept.value || 0.5;

        // Check exact match
        if (
          keywords.some((keyword) => conceptName.includes(keyword) || keyword.includes(conceptName))
        ) {
          score += conceptValue * 2; // Exact match có điểm cao hơn
        }
        // Check partial match với tên category
        else if (
          category.name.toLowerCase().includes(conceptName) ||
          conceptName.includes(category.name.toLowerCase())
        ) {
          score += conceptValue;
        }
      }

      if (score > 0) {
        categoryScores.set(categoryId, {
          category: category,
          score: score,
          matchedConcepts: concepts.filter((c) =>
            keywords.some(
              (k) => c.name.toLowerCase().includes(k) || k.includes(c.name.toLowerCase())
            )
          )
        });
      }
    }

    // Sắp xếp theo score
    const sortedCategories = Array.from(categoryScores.values()).sort((a, b) => b.score - a.score);

    return sortedCategories;
  }

  /**
   * Score product dựa trên concepts
   * @param {Object} product - Product document
   * @param {Array} concepts - Concepts từ hình ảnh
   * @param {Array} matchedCategories - Categories đã match
   * @returns {Number} Product score
   */
  static scoreProduct(product, concepts, matchedCategories) {
    let score = 0;

    // 1. Category match score (40% weight)
    const productCategoryId = product.category?._id?.toString() || product.category?.toString();
    const productSubCategoryId =
      product.subCategory?._id?.toString() || product.subCategory?.toString();

    const categoryMatch = matchedCategories.find(
      (mc) => mc.category._id.toString() === productCategoryId
    );
    if (categoryMatch) {
      score += categoryMatch.score * 0.4;
    }

    const subCategoryMatch = matchedCategories.find(
      (mc) => mc.category._id.toString() === productSubCategoryId
    );
    if (subCategoryMatch) {
      score += subCategoryMatch.score * 0.3;
    }

    // 2. Title/Description match với concepts (30% weight)
    const productText = `${product.title} ${product.description}`.toLowerCase();
    for (const concept of concepts) {
      const conceptName = concept.name.toLowerCase();
      if (productText.includes(conceptName)) {
        score += (concept.value || 0.5) * 0.3;
      }
    }

    // 3. Product quality metrics (30% weight)
    score += (product.metrics?.averageRating || 0) * 0.05; // Rating 0-5 -> 0-0.25
    score += Math.min(product.metrics?.rentalCount || 0, 20) * 0.01; // Rental count
    score += product.availability?.isAvailable ? 0.05 : 0; // Available bonus

    return score;
  }

  /**
   * Search products by image concepts
   * @param {Array} concepts - Concepts từ phân tích hình ảnh (tiếng Anh)
   * @param {Object} options - Search options (limit, minScore, etc.)
   * @returns {Array} Matched products với scores
   */
  static async searchByImageConcepts(concepts, options = {}) {
    try {
      const { limit = 20, minScore = 0.1, includeInactive = false } = options;


      // 1. Translate concepts sang tiếng Việt
      const translatedConcepts = TranslationService.translateConcepts(concepts);


      if (translatedConcepts.length === 0) {
        return {
          products: [],
          matchedCategories: [],
          totalFound: 0,
          searchConcepts: []
        };
      }

      // 2. Lấy tất cả categories
      const allCategories = await Category.find({
        status: 'ACTIVE',
        deletedAt: { $exists: false }
      });
      // 3. Map concepts (đã dịch) to categories
      const matchedCategories = await this.mapConceptsToCategories(
        translatedConcepts,
        allCategories
      );



 

      // 3. Tìm products trong các categories đã match (hoặc tất cả nếu không match)
      const categoryIds =
        matchedCategories.length > 0
          ? matchedCategories.slice(0, 10).map((mc) => mc.category._id) // Top 10 categories
          : allCategories.map((c) => c._id); // All categories

      const productQuery = {
        $or: [{ category: { $in: categoryIds } }, { subCategory: { $in: categoryIds } }],
        deletedAt: { $exists: false }
      };

      if (!includeInactive) {
        productQuery.status = 'ACTIVE';
      }

      const products = await Product.find(productQuery)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('owner', 'username fullName email avatar')
        .limit(limit * 3) // Lấy nhiều hơn để score
        .lean();


      // 4. Score và sort products (dùng translated concepts)
      const scoredProducts = products
        .map((product) => ({
          ...product,
          visualSearchScore: this.scoreProduct(product, translatedConcepts, matchedCategories)
        }))
        .filter((p) => p.visualSearchScore >= minScore)
        .sort((a, b) => b.visualSearchScore - a.visualSearchScore)
        .slice(0, limit);


      return {
        products: scoredProducts,
        matchedCategories: matchedCategories.slice(0, 5),
        totalFound: scoredProducts.length,
        searchConcepts: translatedConcepts.map((c) => c.nameVietnamese || c.name),
        originalConcepts: concepts.map((c) => c.name) // Keep original English concepts
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get category keywords (for reference)
   * @returns {Object} Category keywords mapping
   */
  static getCategoryKeywords() {
    return {
      electronics: [
        'phone',
        'mobile',
        'iphone',
        'smartphone',
        'electronic',
        'device',
        'technology'
      ],
      fashion: ['bag', 'backpack', 'fashion', 'accessory', 'clothing', 'wear'],
      camera: ['camera', 'photography', 'lens', 'photo', 'picture'],
      sports: ['sport', 'fitness', 'exercise', 'game', 'outdoor'],
      other: ['other', 'misc', 'various', 'general']
    };
  }
}

module.exports = VisualSearchService;
