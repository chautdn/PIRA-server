const Product = require('../../models/Product');
const Category = require('../../models/Category');
const geminiService = require('./gemini.service');

/**
 * Chatbot Service
 * AI-powered chatbot với Google Gemini
 */
class ChatbotService {
  /**
   * Process user message and generate response
   * @param {string} userMessage - User's message
   * @param {Array} conversationHistory - Previous messages
   * @returns {Object} Response with reply and suggestions
   */
  static async processMessage(userMessage, conversationHistory = []) {
    try {
      const message = userMessage.toLowerCase().trim();

      // Detect intent FIRST
      const intent = this.detectIntent(message);

      // ALWAYS search for relevant products based on message
      const searchResult = await this.smartProductSearch(message, intent);

      // Get general context
      const context = {
        ...searchResult.context,
        intent: intent.type
      };

      // Use AI to generate smart response if available
      if (geminiService.isAvailable()) {
        try {
          const aiReply = await geminiService.generateResponse(
            userMessage,
            conversationHistory,
            context
          );

          return {
            reply: aiReply,
            suggestedProducts: searchResult.suggestedProducts,
            suggestedActions: searchResult.suggestedActions
          };
        } catch (aiError) {
          // Fall through to smart response without AI
        }
      }

      // Smart response without AI - enhance searchResult with context-aware reply
      return this.enhanceResponseWithContext(searchResult, message, intent);
    } catch (error) {
      console.error('Chatbot error:', error);
      return {
        reply: 'Xin lỗi, tôi gặp sự cố khi xử lý câu hỏi. Bạn có thể diễn đạt lại không?',
        suggestedActions: [
          { label: '🔍 Tìm sản phẩm', query: 'Tìm sản phẩm cho thuê' },
          { label: '💰 Hỏi về giá', query: 'Giá thuê như thế nào?' }
        ]
      };
    }
  }

  /**
   * Enhance response with context-aware reply (when AI is not available)
   */
  static enhanceResponseWithContext(searchResult, message, intent) {
    const products = searchResult.suggestedProducts || [];
    let enhancedReply = '';

    // Customize reply based on intent and products found
    if (intent.type === 'GREETING') {
      enhancedReply = `👋 Xin chào! Tôi là trợ lý ảo của Pira.\n\n`;

      if (products.length > 0) {
        enhancedReply += `Tôi thấy bạn quan tâm đến một số sản phẩm. Đây là ${products.length} sản phẩm phổ biến:\n\n`;
        products.forEach((p, i) => {
          enhancedReply += `${i + 1}. ${p.title} - ${new Intl.NumberFormat('vi-VN').format(p.pricing.dailyRate)}đ/ngày\n`;
        });
        enhancedReply += `\n💡 Click vào sản phẩm để xem chi tiết!`;
      } else {
        enhancedReply += `Tôi có thể giúp bạn:\n• 🔍 Tìm sản phẩm cho thuê\n• 💰 Tư vấn giá thuê\n• 📖 Hướng dẫn thuê/trả sản phẩm\n\nBạn cần gì?`;
      }
    } else if (
      intent.type === 'PRODUCT_SEARCH' ||
      message.includes('tìm') ||
      message.includes('thuê')
    ) {
      if (products.length > 0) {
        enhancedReply = `🎯 Tôi tìm thấy ${products.length} sản phẩm phù hợp:\n\n`;
        products.forEach((p, i) => {
          enhancedReply += `${i + 1}. ${p.title}\n`;
          enhancedReply += `   💰 ${new Intl.NumberFormat('vi-VN').format(p.pricing.dailyRate)}đ/ngày\n`;
          if (p.metrics.averageRating > 0) {
            enhancedReply += `   ⭐ ${p.metrics.averageRating.toFixed(1)}/5\n`;
          }
          enhancedReply += '\n';
        });
        enhancedReply += `💡 Click vào sản phẩm để xem chi tiết!`;
      } else {
        enhancedReply = searchResult.reply; // Use default from smartProductSearch
      }
    } else if (intent.type === 'PRICING') {
      enhancedReply = `💰 **Về giá thuê trên Pira:**\n\n`;
      enhancedReply += `• Giá thuê tính theo **ngày**\n`;
      enhancedReply += `• Mỗi sản phẩm có giá khác nhau\n`;
      enhancedReply += `• Cần đặt cọc khi thuê\n\n`;

      if (products.length > 0) {
        enhancedReply += `**Ví dụ giá một số sản phẩm:**\n\n`;
        products.forEach((p, i) => {
          enhancedReply += `${i + 1}. ${p.title}: ${new Intl.NumberFormat('vi-VN').format(p.pricing.dailyRate)}đ/ngày\n`;
        });
        enhancedReply += `\n💡 Click để xem chi tiết!`;
      }
    } else {
      // Default: use searchResult reply
      enhancedReply = searchResult.reply || 'Tôi có thể giúp bạn tìm sản phẩm! Bạn đang tìm gì?';
    }

    return {
      reply: enhancedReply,
      suggestedProducts: products,
      suggestedActions: searchResult.suggestedActions
    };
  }

  /**
   * Smart product search - searches for ALL queries, filters intelligently
   */
  static async smartProductSearch(message, intent) {
    try {
      // Extract keywords from message
      const keywords = message
        .split(' ')
        .filter((word) => word.length > 2)
        .filter(
          (word) =>
            ![
              'tìm',
              'muốn',
              'cần',
              'thuê',
              'cho',
              'mượn',
              'của',
              'một',
              'cái',
              'sản',
              'phẩm',
              'giới',
              'thiệu',
              'cho',
              'tôi',
              'một',
              'số',
              'chuyến',
              'cắm',
              'trải',
              'các',
              'thiết',
              'bị'
            ].includes(word)
        );

      // Extract price from message (e.g., "giá 100", "50k", "100.000đ")
      let priceFilter = null;
      const priceMatches = message.match(/(\d+)(k|đ|000)?/g);

      if (
        priceMatches &&
        (message.includes('giá') || message.includes('chi phí') || /\d+k|\d+đ/.test(message))
      ) {
        // Convert price to number
        const priceStr = priceMatches[priceMatches.length - 1]; // Get last number
        let price = parseInt(priceStr.replace(/[^\d]/g, ''));

        // Handle 'k' suffix (50k = 50000)
        if (priceStr.includes('k')) {
          price = price * 1000;
        }

        // If number < 1000 and no 'k', assume it's in thousands
        if (price < 1000 && !priceStr.includes('k')) {
          price = price * 1000;
        }

        priceFilter = price;
      }

      // Build base query
      const searchQuery = {
        status: 'ACTIVE',
        deletedAt: { $exists: false },
        'availability.isAvailable': true
      };

      // Add price filter if detected
      if (priceFilter) {
        // Allow 20% variance for price matching
        const minPrice = priceFilter * 0.8;
        const maxPrice = priceFilter * 1.2;
        searchQuery['pricing.dailyRate'] = { $gte: minPrice, $lte: maxPrice };
      }

      // Build text search conditions
      const textSearchConditions = [];

      if (keywords.length > 0) {
        keywords.forEach((term) => {
          textSearchConditions.push(
            { title: new RegExp(term, 'i') },
            { description: new RegExp(term, 'i') },
            { 'brand.name': new RegExp(term, 'i') }
          );
        });

        if (priceFilter) {
          // If has price filter, combine with OR
          searchQuery.$and = [{ $or: textSearchConditions }];
        } else {
          searchQuery.$or = textSearchConditions;
        }
      }

      // Search products
      const products = await Product.find(searchQuery)
        .populate('category', 'name')
        .populate('owner', 'username fullName')
        .sort({
          // If price filter, sort by closest to target price
          ...(priceFilter ? {} : { 'metrics.averageRating': -1 }),
          'metrics.rentalCount': -1
        })
        .limit(5)
        .lean();

      // If price filter, sort by price proximity
      if (priceFilter && products.length > 0) {
        products.sort((a, b) => {
          const diffA = Math.abs(a.pricing.dailyRate - priceFilter);
          const diffB = Math.abs(b.pricing.dailyRate - priceFilter);
          return diffA - diffB;
        });
      }

      // Build response based on results
      if (products.length > 0) {
        const reply = `🎯 Tôi tìm thấy ${products.length} sản phẩm phù hợp:\n\n${products
          .map(
            (p, i) =>
              `${i + 1}. ${p.title}\n   💰 ${new Intl.NumberFormat('vi-VN').format(p.pricing.dailyRate)}đ/ngày${
                p.metrics.averageRating > 0 ? `\n   ⭐ ${p.metrics.averageRating.toFixed(1)}/5` : ''
              }`
          )
          .join('\n\n')}\n\n💡 Click vào sản phẩm để xem chi tiết!`;

        return {
          reply,
          suggestedProducts: products.map((p) => ({
            _id: p._id,
            title: p.title,
            name: p.title,
            category: p.category,
            images: p.images,
            pricing: p.pricing,
            metrics: p.metrics,
            condition: p.condition,
            owner: p.owner,
            description: p.description
          })),
          suggestedActions: [
            { label: '🔍 Tìm khác', query: 'Tìm sản phẩm khác' },
            { label: '💰 Hỏi giá', query: 'Giá thuê như thế nào?' }
          ],
          context: {
            availableProducts: products,
            searchKeywords: keywords
          }
        };
      } else {
        // No products found - still return general products
        const generalProducts = await Product.find({
          status: 'ACTIVE',
          deletedAt: { $exists: false },
          'availability.isAvailable': true
        })
          .populate('category', 'name')
          .sort({ 'metrics.averageRating': -1 })
          .limit(5)
          .lean();

        return {
          reply: `Xin lỗi, tôi không tìm thấy sản phẩm phù hợp với "${message}".\n\nNhưng đây là một số sản phẩm phổ biến bạn có thể quan tâm:`,
          suggestedProducts: generalProducts.map((p) => ({
            _id: p._id,
            title: p.title,
            name: p.title,
            category: p.category,
            images: p.images,
            pricing: p.pricing,
            metrics: p.metrics
          })),
          suggestedActions: [
            { label: '🔍 Tìm sản phẩm', query: 'Tìm sản phẩm' },
            { label: '💰 Bảng giá', query: 'Giá thuê' }
          ],
          context: {
            availableProducts: generalProducts,
            searchKeywords: keywords
          }
        };
      }
    } catch (error) {
      console.error('Search error:', error);
      return {
        reply: 'Xin lỗi, tôi gặp lỗi khi tìm kiếm. Vui lòng thử lại.',
        suggestedProducts: [],
        suggestedActions: [{ label: '🔍 Thử lại', query: 'Tìm sản phẩm' }],
        context: {}
      };
    }
  }

  /**
   * Build context for AI
   */
  static async buildContext(message) {
    try {
      // Get available products
      const products = await Product.find({
        status: 'ACTIVE',
        deletedAt: { $exists: false },
        'availability.isAvailable': true
      })
        .populate('category', 'name')
        .sort({ 'metrics.averageRating': -1 })
        .limit(10)
        .lean();

      // Get categories
      const categories = await Category.find({
        status: 'ACTIVE',
        deletedAt: { $exists: false }
      })
        .select('name slug')
        .limit(20)
        .lean();

      return {
        availableProducts: products,
        categories: categories
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * Get default actions based on intent
   */
  static getDefaultActions(intentType) {
    const actions = {
      GREETING: [
        { label: '🔍 Tìm sản phẩm', query: 'Tìm sản phẩm' },
        { label: '💰 Bảng giá', query: 'Giá thuê' },
        { label: '📖 Hướng dẫn', query: 'Hướng dẫn' }
      ],
      PRICING: [
        { label: '🔍 Tìm sản phẩm', query: 'Tìm sản phẩm' },
        { label: '📖 Hướng dẫn thuê', query: 'Hướng dẫn thuê' }
      ],
      HOW_TO: [
        { label: '🔍 Tìm sản phẩm ngay', query: 'Tìm sản phẩm' },
        { label: '💰 Hỏi về giá', query: 'Giá thuê' }
      ],
      POLICY: [
        { label: '❓ Tranh chấp', query: 'Xử lý tranh chấp' },
        { label: '💰 Hoàn tiền', query: 'Chính sách hoàn tiền' }
      ],
      GENERAL: [
        { label: '🔍 Tìm sản phẩm', query: 'Tìm sản phẩm' },
        { label: '❓ Câu hỏi thường gặp', query: 'FAQ' }
      ]
    };

    return actions[intentType] || actions.GENERAL;
  }

  /**
   * Detect user intent from message
   */
  static detectIntent(message) {
    const intent = { type: 'GENERAL', keywords: [], category: null };

    // Product search keywords
    const productKeywords = [
      'tìm',
      'thuê',
      'mượn',
      'cho thuê',
      'có',
      'cần',
      'muốn',
      'muốn thuê',
      'muốn mượn',
      'cần thuê',
      'cho tôi',
      'máy ảnh',
      'camera',
      'balo',
      'túi',
      'điện thoại',
      'laptop',
      'xe',
      'đồ',
      'thiết bị',
      'sản phẩm'
    ];

    // Pricing keywords
    const pricingKeywords = [
      'giá',
      'tiền',
      'phí',
      'chi phí',
      'cọc',
      'đặt cọc',
      'bao nhiêu',
      'giá cả',
      'giá thuê',
      'rẻ',
      'đắt'
    ];

    // How-to keywords
    const howToKeywords = [
      'làm sao',
      'làm thế nào',
      'cách',
      'hướng dẫn',
      'đăng',
      'thuê',
      'trả',
      'thanh toán',
      'đặt hàng'
    ];

    // Policy keywords
    const policyKeywords = [
      'chính sách',
      'quy định',
      'điều khoản',
      'huỷ',
      'hoàn tiền',
      'bồi thường',
      'hỏng',
      'mất',
      'tranh chấp'
    ];

    // Greeting keywords
    const greetingKeywords = ['xin chào', 'chào', 'hello', 'hi', 'hey'];

    // Check intents
    if (greetingKeywords.some((kw) => message.includes(kw))) {
      intent.type = 'GREETING';
    } else if (pricingKeywords.some((kw) => message.includes(kw))) {
      intent.type = 'PRICING';
      intent.keywords = pricingKeywords.filter((kw) => message.includes(kw));
    } else if (howToKeywords.some((kw) => message.includes(kw))) {
      intent.type = 'HOW_TO';
      intent.keywords = howToKeywords.filter((kw) => message.includes(kw));
    } else if (policyKeywords.some((kw) => message.includes(kw))) {
      intent.type = 'POLICY';
      intent.keywords = policyKeywords.filter((kw) => message.includes(kw));
    } else if (productKeywords.some((kw) => message.includes(kw))) {
      intent.type = 'PRODUCT_SEARCH';
      intent.keywords = productKeywords.filter((kw) => message.includes(kw));
    }

    // Detect category from message
    if (message.includes('máy ảnh') || message.includes('camera')) {
      intent.category = 'camera';
    } else if (
      message.includes('balo') ||
      message.includes('túi') ||
      message.includes('backpack')
    ) {
      intent.category = 'bag';
    } else if (
      message.includes('điện thoại') ||
      message.includes('phone') ||
      message.includes('smartphone')
    ) {
      intent.category = 'phone';
    } else if (message.includes('laptop') || message.includes('máy tính')) {
      intent.category = 'laptop';
    } else if (message.includes('xe đạp') || message.includes('xe')) {
      intent.category = 'vehicle';
    } else if (message.includes('lều') || message.includes('tent')) {
      intent.category = 'lều';
    } else if (message.includes('drone') || message.includes('flycam')) {
      intent.category = 'drone';
    } else if (message.includes('micro') || message.includes('mic')) {
      intent.category = 'micro';
    }

    return intent;
  }

  /**
   * Handle product search queries
   */
  static async handleProductSearch(message, intent) {
    try {
      // Build search query
      const searchQuery = {
        status: 'ACTIVE',
        deletedAt: { $exists: false },
        'availability.isAvailable': true
      };

      // Extract keywords from message for text search
      const keywords = intent.keywords || [];
      const searchTerms = message
        .split(' ')
        .filter((word) => word.length > 2)
        .filter(
          (word) =>
            ![
              'tìm',
              'muốn',
              'cần',
              'thuê',
              'cho',
              'mượn',
              'của',
              'một',
              'cái',
              'sản',
              'phẩm'
            ].includes(word)
        );

      // Build text search condition
      const textSearchConditions = [];

      if (searchTerms.length > 0) {
        searchTerms.forEach((term) => {
          textSearchConditions.push(
            { title: new RegExp(term, 'i') },
            { description: new RegExp(term, 'i') },
            { 'brand.name': new RegExp(term, 'i') }
          );
        });
      }

      // Filter by category if detected
      if (intent.category) {
        const categories = await Category.find({
          $or: [
            { name: new RegExp(intent.category, 'i') },
            { slug: new RegExp(intent.category, 'i') }
          ],
          status: 'ACTIVE'
        });

        if (categories.length > 0) {
          const categoryConditions = [
            { category: { $in: categories.map((c) => c._id) } },
            { subCategory: { $in: categories.map((c) => c._id) } }
          ];

          // Combine category + text search
          if (textSearchConditions.length > 0) {
            searchQuery.$and = [{ $or: categoryConditions }, { $or: textSearchConditions }];
          } else {
            searchQuery.$or = categoryConditions;
          }
        } else if (textSearchConditions.length > 0) {
          searchQuery.$or = textSearchConditions;
        }
      } else if (textSearchConditions.length > 0) {
        searchQuery.$or = textSearchConditions;
      }

      // Search products
      const products = await Product.find(searchQuery)
        .populate('category', 'name')
        .populate('owner', 'username fullName')
        .sort({ 'metrics.averageRating': -1, 'metrics.rentalCount': -1 })
        .limit(5) // Increase to 5 products
        .lean();

      if (products.length > 0) {
        let reply = `🎯 Tôi tìm thấy ${products.length} sản phẩm phù hợp:\n\n`;

        products.forEach((p, i) => {
          reply += `${i + 1}. ${p.title}\n`;
          reply += `   📦 ${p.category?.name || 'N/A'}\n`;
          reply += `   💰 ${new Intl.NumberFormat('vi-VN').format(p.pricing.dailyRate)} đ/ngày\n`;
          if (p.metrics.averageRating > 0) {
            reply += `   ⭐ ${p.metrics.averageRating.toFixed(1)}/5\n`;
          }
          reply += '\n';
        });

        reply +=
          '💡 Bạn có thể nói "xem chi tiết" hoặc "chi tiết sản phẩm số X" để xem thêm thông tin!';

        return {
          reply,
          suggestedProducts: products.map((p) => ({
            _id: p._id,
            title: p.title,
            name: p.title,
            category: p.category,
            images: p.images,
            pricing: p.pricing,
            metrics: p.metrics,
            condition: p.condition,
            owner: p.owner,
            description: p.description
          })),
          suggestedActions: [
            { label: '🔍 Tìm sản phẩm khác', query: 'Tìm sản phẩm khác' },
            { label: '💰 Hỏi về giá thuê', query: 'Giá thuê như thế nào?' }
          ]
        };
      } else {
        return {
          reply:
            '😔 Hiện tại không có sản phẩm nào phù hợp. Bạn có thể:\n\n• Thử tìm kiếm với từ khóa khác\n• Xem tất cả sản phẩm đang có\n• Liên hệ hỗ trợ để được tư vấn',
          suggestedActions: [
            { label: '📦 Xem tất cả sản phẩm', query: 'Xem tất cả sản phẩm' },
            { label: '🎯 Tìm máy ảnh', query: 'Tìm máy ảnh' },
            { label: '🎒 Tìm balo', query: 'Tìm balo' }
          ]
        };
      }
    } catch (error) {
      console.error('Product search error:', error);
      return {
        reply: 'Xin lỗi, tôi gặp lỗi khi tìm kiếm sản phẩm. Vui lòng thử lại.',
        suggestedActions: []
      };
    }
  }

  /**
   * Handle pricing queries
   */
  static async handlePricingQuery(message, intent) {
    const reply = `💰 **Về giá thuê trên Pira:**

• Giá thuê được tính theo **ngày**
• Mỗi sản phẩm có giá khác nhau tùy loại
• Cần đặt cọc khi thuê (tùy chủ sản phẩm)

**Ví dụ giá thuê:**
🎒 Balo: 20,000 - 100,000đ/ngày
📷 Máy ảnh: 50,000 - 200,000đ/ngày
📱 Điện thoại: 100,000 - 300,000đ/ngày

**Lưu ý:**
• Thuê càng nhiều ngày có thể được giảm giá
• Kiểm tra kỹ thông tin trước khi thuê
• Thanh toán qua ví Pira an toàn

Bạn muốn tìm sản phẩm nào?`;

    return {
      reply,
      suggestedActions: [
        { label: '🔍 Tìm sản phẩm', query: 'Tìm sản phẩm cho thuê' },
        { label: '📖 Hướng dẫn thuê', query: 'Hướng dẫn thuê sản phẩm' }
      ]
    };
  }

  /**
   * Handle how-to queries
   */
  static handleHowToQuery(message, intent) {
    let reply = '';
    let actions = [];

    if (message.includes('thuê') || message.includes('mượn')) {
      reply = `📖 **Hướng dẫn thuê sản phẩm:**

1️⃣ **Tìm sản phẩm**
   • Tìm kiếm hoặc duyệt danh mục
   • Xem chi tiết và đánh giá

2️⃣ **Đặt thuê**
   • Chọn ngày thuê
   • Thêm vào giỏ hàng
   • Thanh toán qua ví Pira

3️⃣ **Nhận hàng**
   • Shipper giao đến tận nơi
   • Kiểm tra sản phẩm
   • Xác nhận nhận hàng

4️⃣ **Trả hàng**
   • Đóng gói cẩn thận
   • Chờ shipper đến lấy
   • Hoàn tiền cọc

Bạn cần hỗ trợ thêm gì không?`;

      actions = [
        { label: '🔍 Tìm sản phẩm ngay', query: 'Tìm sản phẩm' },
        { label: '💰 Thanh toán như thế nào?', query: 'Thanh toán' }
      ];
    } else if (message.includes('đăng') || message.includes('cho thuê')) {
      reply = `📖 **Hướng dẫn đăng sản phẩm cho thuê:**

1️⃣ **Chuẩn bị**
   • Chụp ảnh sản phẩm đẹp
   • Chuẩn bị thông tin chi tiết

2️⃣ **Đăng sản phẩm**
   • Vào "Quản lý sản phẩm"
   • Nhấn "Thêm sản phẩm mới"
   • Điền đầy đủ thông tin

3️⃣ **Đặt giá thuê**
   • Giá/ngày hợp lý
   • Tiền cọc (nếu có)
   • Phí giao hàng

4️⃣ **Quản lý đơn thuê**
   • Xác nhận đơn thuê
   • Giao hàng cho shipper
   • Nhận tiền sau khi hoàn tất

Bạn muốn đăng sản phẩm ngay không?`;

      actions = [
        { label: '➕ Đăng sản phẩm', query: 'Đăng sản phẩm mới' },
        { label: '💡 Tư vấn giá thuê', query: 'Giá thuê' }
      ];
    } else {
      reply = `📖 **Tôi có thể hướng dẫn bạn:**

• Cách thuê sản phẩm
• Cách đăng sản phẩm cho thuê
• Cách thanh toán
• Cách trả hàng
• Giải quyết tranh chấp

Bạn muốn biết về vấn đề nào?`;

      actions = [
        { label: '🎯 Hướng dẫn thuê', query: 'Hướng dẫn thuê sản phẩm' },
        { label: '➕ Hướng dẫn đăng', query: 'Hướng dẫn đăng sản phẩm' }
      ];
    }

    return { reply, suggestedActions: actions };
  }

  /**
   * Handle policy queries
   */
  static handlePolicyQuery(message, intent) {
    let reply = `📋 **Chính sách của Pira:**

**1. Chính sách thuê:**
• Phải đặt cọc theo yêu cầu chủ sản phẩm
• Hoàn cọc 100% nếu trả đúng hạn, nguyên vẹn
• Trễ hạn: phạt theo thỏa thuận

**2. Chính sách hoàn tiền:**
• Hủy trước 24h: hoàn 90%
• Hủy trong 24h: hoàn 50%
• Sản phẩm lỗi: hoàn 100%

**3. Tranh chấp:**
• Báo cáo trong 24h khi nhận hàng
• Admin làm trung gian giải quyết
• Có bồi thường nếu sản phẩm lỗi

**4. Trách nhiệm:**
• Người thuê: giữ gìn sản phẩm
• Chủ sản phẩm: cung cấp đúng mô tả
• Pira: bảo vệ quyền lợi 2 bên

Bạn cần biết thêm gì?`;

    return {
      reply,
      suggestedActions: [
        { label: '❓ Tranh chấp', query: 'Xử lý tranh chấp' },
        { label: '💰 Hoàn tiền', query: 'Chính sách hoàn tiền' }
      ]
    };
  }

  /**
   * Handle greeting
   */
  static handleGreeting() {
    return {
      reply: `Xin chào! 👋 Tôi là trợ lý ảo của Pira.

Tôi có thể giúp bạn:
• 🔍 Tìm sản phẩm cho thuê
• 💰 Giải đáp về giá và chính sách
• 📖 Hướng dẫn sử dụng nền tảng
• ❓ Trả lời các câu hỏi khác

Bạn cần hỗ trợ gì?`,
      suggestedActions: [
        { label: '🔍 Tìm sản phẩm', query: 'Tìm sản phẩm' },
        { label: '💰 Bảng giá', query: 'Giá thuê' },
        { label: '📖 Hướng dẫn', query: 'Hướng dẫn sử dụng' }
      ]
    };
  }

  /**
   * Handle general queries
   */
  static async handleGeneralQuery(message) {
    // Try to find relevant products anyway
    const products = await Product.find({
      status: 'ACTIVE',
      deletedAt: { $exists: false },
      'availability.isAvailable': true
    })
      .sort({ 'metrics.averageRating': -1 })
      .limit(3)
      .lean();

    return {
      reply: `Tôi chưa hiểu rõ câu hỏi của bạn. 🤔

Bạn có thể hỏi tôi về:
• Tìm kiếm sản phẩm cụ thể
• Giá thuê và chính sách
• Hướng dẫn sử dụng
• Câu hỏi về dịch vụ

Hoặc bạn có thể xem một số sản phẩm phổ biến bên dưới! 👇`,
      suggestedProducts: products.slice(0, 2),
      suggestedActions: [
        { label: '🔍 Tìm sản phẩm', query: 'Tìm sản phẩm' },
        { label: '❓ Hỏi về chính sách', query: 'Chính sách' }
      ]
    };
  }
}

module.exports = ChatbotService;
