/**
 * Vietnamese text utilities for search normalization
 */

// Vietnamese diacritic removal map
const vietnameseDiacriticMap = {
  à: 'a',
  á: 'a',
  ạ: 'a',
  ả: 'a',
  ã: 'a',
  â: 'a',
  ầ: 'a',
  ấ: 'a',
  ậ: 'a',
  ẩ: 'a',
  ẫ: 'a',
  ă: 'a',
  ằ: 'a',
  ắ: 'a',
  ặ: 'a',
  ẳ: 'a',
  ẵ: 'a',
  è: 'e',
  é: 'e',
  ẹ: 'e',
  ẻ: 'e',
  ẽ: 'e',
  ê: 'e',
  ề: 'e',
  ế: 'e',
  ệ: 'e',
  ể: 'e',
  ễ: 'e',
  ì: 'i',
  í: 'i',
  ị: 'i',
  ỉ: 'i',
  ĩ: 'i',
  ò: 'o',
  ó: 'o',
  ọ: 'o',
  ỏ: 'o',
  õ: 'o',
  ô: 'o',
  ồ: 'o',
  ố: 'o',
  ộ: 'o',
  ổ: 'o',
  ỗ: 'o',
  ơ: 'o',
  ờ: 'o',
  ớ: 'o',
  ợ: 'o',
  ở: 'o',
  ỡ: 'o',
  ù: 'u',
  ú: 'u',
  ụ: 'u',
  ủ: 'u',
  ũ: 'u',
  ư: 'u',
  ừ: 'u',
  ứ: 'u',
  ự: 'u',
  ử: 'u',
  ữ: 'u',
  ỳ: 'y',
  ý: 'y',
  ỵ: 'y',
  ỷ: 'y',
  ỹ: 'y',
  đ: 'd',
  À: 'a',
  Á: 'a',
  Ạ: 'a',
  Ả: 'a',
  Ã: 'a',
  Â: 'a',
  Ầ: 'a',
  Ấ: 'a',
  Ậ: 'a',
  Ẩ: 'a',
  Ẫ: 'a',
  Ă: 'a',
  Ằ: 'a',
  Ắ: 'a',
  Ặ: 'a',
  Ẳ: 'a',
  Ẵ: 'a',
  È: 'e',
  É: 'e',
  Ẹ: 'e',
  Ẻ: 'e',
  Ẽ: 'e',
  Ê: 'e',
  Ề: 'e',
  Ế: 'e',
  Ệ: 'e',
  Ể: 'e',
  Ễ: 'e',
  Ì: 'i',
  Í: 'i',
  Ị: 'i',
  Ỉ: 'i',
  Ĩ: 'i',
  Ò: 'o',
  Ó: 'o',
  Ọ: 'o',
  Ỏ: 'o',
  Õ: 'o',
  Ô: 'o',
  Ồ: 'o',
  Ố: 'o',
  Ộ: 'o',
  Ổ: 'o',
  Ỗ: 'o',
  Ơ: 'o',
  Ờ: 'o',
  Ớ: 'o',
  Ợ: 'o',
  Ở: 'o',
  Ỡ: 'o',
  Ù: 'u',
  Ú: 'u',
  Ụ: 'u',
  Ủ: 'u',
  Ũ: 'u',
  Ư: 'u',
  Ừ: 'u',
  Ứ: 'u',
  Ự: 'u',
  Ử: 'u',
  Ữ: 'u',
  Ỳ: 'y',
  Ý: 'y',
  Ỵ: 'y',
  Ỷ: 'y',
  Ỹ: 'y',
  Đ: 'd'
};

/**
 * Remove Vietnamese diacritics from text
 */
function removeDiacritics(text) {
  if (!text) return '';

  return text
    .split('')
    .map((char) => vietnameseDiacriticMap[char] || char)
    .join('');
}

/**
 * Create search patterns for Vietnamese text
 * Supports both with and without diacritics
 */
function createSearchPatterns(searchTerm) {
  if (!searchTerm) return [];

  const normalizedTerm = removeDiacritics(searchTerm.toLowerCase());
  const originalTerm = searchTerm.toLowerCase();

  const patterns = [
    originalTerm, // Original search term
    normalizedTerm // Without diacritics
  ];

  // Add common Vietnamese word variations
  const wordVariations = {
    may: ['máy', 'may'],
    anh: ['ảnh', 'anh'],
    quay: ['quay', 'quây'],
    fim: ['phim', 'fim'],
    camera: ['camera', 'máy ảnh'],
    túi: ['túi', 'tui', 'balo'],
    'du lịch': ['du lịch', 'du lich', 'travel']
  };

  // Create regex pattern that matches both with and without diacritics
  let flexiblePattern = originalTerm;

  // Replace each character with a pattern that matches both accented and unaccented versions
  const reverseMap = {};
  Object.keys(vietnameseDiacriticMap).forEach((accented) => {
    const unaccented = vietnameseDiacriticMap[accented];
    if (!reverseMap[unaccented]) {
      reverseMap[unaccented] = [unaccented];
    }
    reverseMap[unaccented].push(accented);
  });

  // Build flexible regex pattern
  flexiblePattern = flexiblePattern
    .split('')
    .map((char) => {
      const variations = reverseMap[char];
      if (variations && variations.length > 1) {
        return `[${variations.join('')}]`;
      }
      return char;
    })
    .join('');

  patterns.push(flexiblePattern);

  return [...new Set(patterns)]; // Remove duplicates
}

/**
 * Generate MongoDB search filter with Vietnamese support
 */
function createVietnameseSearchFilter(searchTerm, fields = ['title', 'description']) {
  if (!searchTerm || !searchTerm.trim()) {
    return {};
  }

  const patterns = createSearchPatterns(searchTerm.trim());
  const searchConditions = [];

  patterns.forEach((pattern) => {
    fields.forEach((field) => {
      searchConditions.push({
        [field]: { $regex: pattern, $options: 'i' }
      });
    });
  });

  return {
    $or: searchConditions
  };
}

module.exports = {
  removeDiacritics,
  createSearchPatterns,
  createVietnameseSearchFilter
};
