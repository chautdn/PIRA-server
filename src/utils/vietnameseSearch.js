/**
 * Vietnamese Search Utility
 * Handles comprehensive Vietnamese text search with accent normalization
 */

// Vietnamese character mappings
const vietnameseMap = {
  a: '[aàáạảãâầấậẩẫăằắặẳẵ]',
  e: '[eèéẹẻẽêềếệểễ]',
  i: '[iìíịỉĩ]',
  o: '[oòóọỏõôồốộổỗơờớợởỡ]',
  u: '[uùúụủũưừứựửữ]',
  y: '[yỳýỵỷỹ]',
  d: '[dđ]',
  A: '[AÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]',
  E: '[EÈÉẸẺẼÊỀẾỆỂỄ]',
  I: '[IÌÍỊỈĨ]',
  O: '[OÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]',
  U: '[UÙÚỤỦŨƯỪỨỰỬỮ]',
  Y: '[YỲÝỴỶỸ]',
  D: '[DĐ]'
};

/**
 * Remove Vietnamese accents from text
 */
function removeAccents(text) {
  return text
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/[đ]/g, 'd')
    .replace(/[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]/g, 'A')
    .replace(/[ÈÉẸẺẼÊỀẾỆỂỄ]/g, 'E')
    .replace(/[ÌÍỊỈĨ]/g, 'I')
    .replace(/[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]/g, 'O')
    .replace(/[ÙÚỤỦŨƯỪỨỰỬỮ]/g, 'U')
    .replace(/[ỲÝỴỶỸ]/g, 'Y')
    .replace(/[Đ]/g, 'D');
}

/**
 * Create accent-insensitive regex pattern for Vietnamese text
 */
function createVietnamesePattern(searchTerm) {
  // Escape special regex characters first
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Replace each character with its Vietnamese equivalents
  let pattern = '';
  for (let char of escaped) {
    if (vietnameseMap[char]) {
      pattern += vietnameseMap[char];
    } else if (vietnameseMap[char.toLowerCase()]) {
      // Handle case where we have uppercase mapping
      pattern += vietnameseMap[char.toLowerCase()].replace(
        /\[([a-z])/g,
        '[' + char.toUpperCase() + '$1'
      );
    } else {
      pattern += char;
    }
  }

  return pattern;
}

/**
 * Create multiple search patterns for comprehensive matching
 */
function createSearchPatterns(searchTerm) {
  const trimmed = searchTerm.trim();
  if (!trimmed) return [];

  const patterns = [];

  // 1. Exact phrase with Vietnamese accent support
  const vietnamesePattern = createVietnamesePattern(trimmed);
  patterns.push(vietnamesePattern);

  // 2. No-accent version (both ways)
  const noAccent = removeAccents(trimmed);
  if (noAccent !== trimmed) {
    patterns.push(createVietnamesePattern(noAccent));
  }

  // 3. Word-by-word matching (for phrases like "máy ảnh")
  const words = trimmed.split(/\s+/);
  if (words.length > 1) {
    // All words must appear (order doesn't matter)
    const wordPatterns = words.map((word) => `(?=.*${createVietnamesePattern(word)})`);
    patterns.push(wordPatterns.join(''));

    // Also try no-accent version of word-by-word
    const noAccentWords = words.map((word) => removeAccents(word));
    const noAccentWordPatterns = noAccentWords.map(
      (word) => `(?=.*${createVietnamesePattern(word)})`
    );
    patterns.push(noAccentWordPatterns.join(''));
  }

  // 4. Partial matching for single characters (like "máy" should match "máy ảnh")
  if (words.length === 1 && trimmed.length >= 2) {
    patterns.push(`${vietnamesePattern}[\\s\\w]*`);
  }

  return [...new Set(patterns)]; // Remove duplicates
}

/**
 * Generate MongoDB search conditions with comprehensive Vietnamese support
 */
function generateSearchConditions(
  searchTerm,
  fields = ['title', 'description', 'brand.name', 'brand.model']
) {
  const patterns = createSearchPatterns(searchTerm);
  const conditions = [];

  // Create conditions for each pattern and field combination
  patterns.forEach((pattern) => {
    fields.forEach((field) => {
      conditions.push({
        [field]: { $regex: pattern, $options: 'i' }
      });
    });
  });

  return conditions;
}

module.exports = {
  removeAccents,
  createVietnamesePattern,
  createSearchPatterns,
  generateSearchConditions
};
