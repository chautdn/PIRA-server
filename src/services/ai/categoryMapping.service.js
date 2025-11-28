class CategoryMappingService {
  /**
   * Get category keywords for matching
   * @param {string} categoryName - Category name
   * @returns {Array} Array of keywords
   */
  static getCategoryKeywords(categoryName) {

    const categoryKeywordMap = {
      // CAMERA & PHOTOGRAPHY
      'máy ảnh': [
        'camera',
        'photography',
        'lens',
        'photo',
        'picture',
        'digital camera',
        'dslr',
        'mirrorless'
      ],
      gopro: ['gopro', 'action camera', 'action cam', 'video camera', 'sports camera'],
      camera: ['camera', 'photography', 'lens', 'photo', 'picture', 'digital camera', 'dslr'],

      // BAGS & BACKPACKS
      'ba lô': ['backpack', 'rucksack', 'hiking bag', 'mountain bag'],
      balo: ['backpack', 'rucksack', 'hiking bag'],
      túi: ['bag', 'handbag', 'purse', 'pouch', 'satchel'],
      'túi xách': ['handbag', 'purse', 'shoulder bag', 'tote bag'],
      'hành lý': ['luggage', 'suitcase', 'baggage', 'travel bag'],

      // SHOES & FOOTWEAR
      giày: ['shoes', 'footwear', 'sneakers', 'boots'],
      'giày thể thao': ['sneakers', 'sports shoes', 'athletic shoes', 'running shoes'],
      'giày leo núi': ['hiking boots', 'mountain boots', 'trekking shoes'],
      dép: ['sandals', 'flip flops', 'slippers'],

      // ELECTRONICS
      'điện thoại': ['phone', 'smartphone', 'mobile phone', 'cellphone'],
      'máy tính': ['laptop', 'computer', 'notebook', 'tablet'],
      'tai nghe': ['headphones', 'earphones', 'headset', 'earbuds'],
      sạc: ['charger', 'power bank', 'charging cable', 'adapter'],

      // CLOTHING
      áo: ['shirt', 'top', 'blouse', 'jacket', 'sweater'],
      quần: ['pants', 'trousers', 'jeans', 'shorts'],
      'áo khoác': ['jacket', 'coat', 'windbreaker', 'hoodie'],

      // SPORTS & FITNESS
      'thể thao': ['sports equipment', 'athletic gear', 'fitness equipment'],
      bóng: ['ball', 'soccer ball', 'basketball', 'volleyball'],
      vợt: ['racket', 'tennis racket', 'badminton racket'],

      // COOKING & KITCHEN
      'nấu ăn': ['cooking', 'cookware', 'kitchen utensils', 'cooking pot'],
      bếp: ['stove', 'camping stove', 'portable stove'],
      nồi: ['pot', 'cooking pot', 'pan'],

      // CAMPING & OUTDOOR
      'cắm trại': ['camping', 'tent', 'camping gear', 'outdoor gear'],
      lều: ['tent', 'shelter', 'camping tent'],
      'túi ngủ': ['sleeping bag', 'sleep sack'],

      // BEAUTY & PERSONAL CARE
      'mỹ phẩm': ['cosmetics', 'makeup', 'beauty products'],
      'dầu gội': ['shampoo', 'hair care', 'toiletries'],

      // VEHICLES
      'xe máy': ['motorcycle', 'motorbike', 'scooter'],
      'xe đạp': ['bicycle', 'bike', 'cycling'],
      'ô tô': ['car', 'automobile', 'vehicle'],

      // TRAVEL ACCESSORIES
      'phụ kiện du lịch': ['travel accessories', 'travel gear', 'luggage accessories'],
      'ổ khóa': ['lock', 'padlock', 'luggage lock'],
      'thẻ hành lý': ['luggage tag', 'baggage tag'],

      // TECHNOLOGY CATEGORIES - For compound categories
      'thiết bị công nghệ du lịch': [
        'camera',
        'photography',
        'lens',
        'photo',
        'picture',
        'digital camera',
        'dslr',
        'mirrorless',
        'electronics',
        'technology',
        'equipment',
        'gopro',
        'action camera',
        'device',
        'gadget',
        'digital',
        'tech'
      ]
    };

    let keywords = [];
    const lowerCategoryName = categoryName.toLowerCase();

    // Special handling for "Khác" category - allow any object
    if (lowerCategoryName.includes('khác') || lowerCategoryName.includes('other')) {
      return ['object', 'item', 'thing', 'product', 'equipment', 'tool', 'device', 'material'];
    }

    // 1. EXACT CATEGORY MATCH
    for (const [key, keywordList] of Object.entries(categoryKeywordMap)) {
      if (lowerCategoryName.includes(key)) {
          keywords = [...keywords, ...keywordList];
        }
    }

    // 2. FLEXIBLE MATCHING for compound categories
    if (keywords.length === 0) {
      const flexibleMatching = {
        'công nghệ': ['technology', 'electronics', 'digital', 'equipment', 'device', 'tech'],
        'du lịch': ['travel', 'tourism', 'portable', 'compact'],
        'thiết bị': ['equipment', 'device', 'tool', 'gear', 'apparatus']
      };

      for (const [vietnameseWord, englishWords] of Object.entries(flexibleMatching)) {
        if (lowerCategoryName.includes(vietnameseWord)) {
          keywords = [...keywords, ...englishWords];
        }
      }
    }

    // 3. FALLBACK: Use category words
    if (keywords.length === 0) {
      keywords = lowerCategoryName
        .split(/[\s&\-_]+/)
        .filter((word) => word.length > 2)
        .map((word) => word.toLowerCase());

    }

    // Remove duplicates
    const uniqueKeywords = [...new Set(keywords)];

    return uniqueKeywords;
  }

  /**
   * Check semantic match between keyword and detection
   * @param {string} keyword - Expected keyword
   * @param {string} detection - Detected concept
   * @returns {boolean} True if semantic match found
   */
  static isSemanticMatch(keyword, detection) {
    const strictSynonymMap = {
      // CAMERA - Only camera related
      camera: ['photography', 'lens', 'photo', 'picture', 'dslr', 'mirrorless'],
      photography: ['camera', 'lens', 'photo', 'picture'],
      gopro: ['action camera', 'action cam', 'video camera'],
      lens: ['camera', 'photography', 'optical', 'focus'],
      electronics: ['technology', 'digital', 'electronic', 'device'],
      technology: ['electronics', 'digital', 'tech', 'equipment'],
      equipment: ['device', 'tool', 'gear', 'apparatus'],

      // BAGS - Only bag related
      backpack: ['rucksack', 'hiking bag', 'mountain bag'],
      bag: ['handbag', 'purse', 'pouch', 'satchel'],
      luggage: ['suitcase', 'baggage', 'travel bag'],

      // SHOES - Only footwear
      shoes: ['footwear', 'sneakers', 'boots'],
      sneakers: ['sports shoes', 'athletic shoes', 'running shoes'],
      boots: ['hiking boots', 'mountain boots'],
      sandals: ['flip flops', 'slippers'],

      // ELECTRONICS - Very specific
      phone: ['smartphone', 'mobile phone', 'cellphone'],
      laptop: ['computer', 'notebook'],
      headphones: ['earphones', 'headset', 'earbuds'],
      charger: ['power bank', 'charging cable', 'adapter'],

      // CLOTHING - Specific garments only
      shirt: ['blouse', 'top', 'tee'],
      pants: ['trousers', 'jeans', 'shorts'],
      jacket: ['coat', 'windbreaker', 'hoodie'],

      // SPORTS - Specific equipment only
      ball: ['soccer ball', 'basketball', 'volleyball'],
      racket: ['tennis racket', 'badminton racket'],

      // COOKING - Specific tools only
      pot: ['cooking pot', 'pan'],
      stove: ['camping stove', 'portable stove'],

      // CAMPING - Specific gear only
      tent: ['shelter', 'camping tent'],
      'sleeping bag': ['sleep sack'],

      // VEHICLES - Specific types only
      motorcycle: ['motorbike', 'scooter'],
      bicycle: ['bike'],
      car: ['automobile']
    };

    if (strictSynonymMap[keyword]) {
      const isMatch = strictSynonymMap[keyword].some(
        (synonym) => detection.includes(synonym) || synonym.includes(detection)
      );

      if (isMatch) {
         console.log(`✅ Semantic match: "${keyword}" <-> "${detection}"`);
      }

      return isMatch;
    }

    return false;
  }

  /**
   * Check Vietnamese keyword match
   * @param {string} keyword - Expected keyword
   * @param {string} concept - Detected concept
   * @param {string} categoryName - Full category name
   * @returns {boolean} True if Vietnamese match found
   */
  static isVietnameseMatch(keyword, concept, categoryName) {
    const strictVietnameseMap = {
      // CAMERA & PHOTOGRAPHY
      'máy ảnh': ['camera', 'photography', 'lens', 'photo', 'picture', 'dslr'],
      camera: ['camera', 'photography', 'lens', 'photo'],
      gopro: ['gopro', 'action camera', 'action cam'],

      // BAGS
      'ba lô': ['backpack', 'rucksack', 'hiking bag'],
      balo: ['backpack', 'rucksack'],
      túi: ['bag', 'handbag', 'purse', 'pouch'],
      'hành lý': ['luggage', 'suitcase', 'baggage'],

      // SHOES & FOOTWEAR
      giày: ['shoes', 'footwear', 'sneakers', 'boots'],
      dép: ['sandals', 'flip flops', 'slippers'],

      // ELECTRONICS
      'điện thoại': ['phone', 'smartphone', 'mobile phone'],
      'máy tính': ['laptop', 'computer', 'notebook'],
      'tai nghe': ['headphones', 'earphones', 'headset'],

      // TECHNOLOGY TERMS
      'công nghệ': ['technology', 'electronics', 'digital', 'tech'],
      'thiết bị': ['equipment', 'device', 'tool', 'gear'],

      // CLOTHING
      áo: ['shirt', 'top', 'blouse', 'jacket'],
      quần: ['pants', 'trousers', 'jeans'],

      // SPORTS
      'thể thao': ['sports equipment', 'athletic gear'],
      bóng: ['ball'],
      vợt: ['racket'],

      // COOKING
      'nấu ăn': ['cooking', 'cookware', 'kitchen'],
      bếp: ['stove'],
      nồi: ['pot', 'pan'],

      // CAMPING
      'cắm trại': ['camping', 'tent', 'camping gear'],
      lều: ['tent', 'shelter'],

      // VEHICLES
      'xe máy': ['motorcycle', 'motorbike', 'scooter'],
      'xe đạp': ['bicycle', 'bike'],
      'ô tô': ['car', 'automobile']
    };

    const lowerCategoryName = categoryName.toLowerCase();

    for (const [vietnameseWord, englishWords] of Object.entries(strictVietnameseMap)) {
      if (lowerCategoryName.includes(vietnameseWord)) {
        const isMatch = englishWords.some(
          (englishWord) =>
            concept.includes(englishWord.toLowerCase()) ||
            englishWord.toLowerCase().includes(concept) ||
            concept === englishWord.toLowerCase()
        );

        if (isMatch) {
         
          return true;
        }
      }
    }

    return false;
  }
}

module.exports = CategoryMappingService;
