/**
 * Translation Service
 * Dịch concepts từ tiếng Anh sang tiếng Việt
 */
class TranslationService {
  /**
   * Dictionary từ tiếng Anh -> tiếng Việt
   */
  static englishToVietnamese = {
    // Electronics & Technology
    phone: 'điện thoại',
    mobile: 'di động',
    smartphone: 'điện thoại thông minh',
    iphone: 'iphone',
    electronic: 'điện tử',
    electronics: 'đồ điện tử',
    device: 'thiết bị',
    technology: 'công nghệ',
    computer: 'máy tính',
    laptop: 'laptop',
    tablet: 'máy tính bảng',
    screen: 'màn hình',
    display: 'hiển thị',
    charger: 'sạc',
    battery: 'pin',
    cable: 'cáp',
    wireless: 'không dây',

    // Bags & Fashion
    bag: 'túi',
    backpack: 'balo',
    rucksack: 'balo',
    baggage: 'hành lý',
    luggage: 'vali',
    suitcase: 'vali',
    fashion: 'thời trang',
    accessory: 'phụ kiện',
    travel: 'du lịch',
    carry: 'mang',
    pack: 'gói',
    clothing: 'quần áo',
    wear: 'mặc',
    shirt: 'áo',
    pants: 'quần',
    shoes: 'giày',
    boots: 'ủng',
    hat: 'mũ',
    cap: 'nón',
    jacket: 'áo khoác',
    coat: 'áo choàng',

    // Camera & Photography
    camera: 'máy ảnh',
    photography: 'nhiếp ảnh',
    photo: 'ảnh',
    picture: 'hình ảnh',
    lens: 'ống kính',
    dslr: 'máy ảnh dslr',
    mirrorless: 'máy ảnh không gương',
    tripod: 'chân máy',
    flash: 'đèn flash',
    'memory card': 'thẻ nhớ',
    photographer: 'nhiếp ảnh gia',
    portrait: 'chân dung',
    landscape: 'phong cảnh',
    video: 'video',
    filming: 'quay phim',
    gopro: 'camera hành trình',
    drone: 'flycam',
    gimbal: 'gimbal',

    // Sports & Recreation
    sport: 'thể thao',
    sports: 'thể thao',
    fitness: 'thể dục',
    exercise: 'tập luyện',
    gym: 'phòng gym',
    workout: 'luyện tập',
    game: 'trò chơi',
    play: 'chơi',
    recreation: 'giải trí',
    outdoor: 'ngoài trời',
    hiking: 'leo núi',
    climbing: 'leo',
    camping: 'cắm trại',
    tent: 'lều',
    'sleeping bag': 'túi ngủ',
    bicycle: 'xe đạp',
    bike: 'xe',
    cycling: 'đạp xe',
    running: 'chạy bộ',
    swimming: 'bơi',
    yoga: 'yoga',
    ball: 'bóng',
    football: 'bóng đá',
    basketball: 'bóng rổ',
    tennis: 'tennis',
    badminton: 'cầu lông',

    // Vehicles
    motorcycle: 'xe máy',
    motorbike: 'xe máy',
    car: 'ô tô',
    vehicle: 'phương tiện',
    wheel: 'bánh xe',
    helmet: 'mũ bảo hiểm',

    // Water Sports
    surfboard: 'ván lướt sóng',
    kayak: 'thuyền kayak',
    boat: 'thuyền',
    swimming: 'bơi',
    diving: 'lặn',
    snorkeling: 'lặn biển',

    // Tools & Equipment
    tool: 'công cụ',
    equipment: 'thiết bị',
    machine: 'máy móc',
    drill: 'máy khoan',
    hammer: 'búa',
    screwdriver: 'tua vít',
    saw: 'cưa',
    wrench: 'cờ lê',
    ladder: 'thang',
    rope: 'dây thừng',

    // Home & Kitchen
    home: 'nhà',
    house: 'nhà',
    kitchen: 'nhà bếp',
    furniture: 'đồ nội thất',
    table: 'bàn',
    chair: 'ghế',
    bed: 'giường',
    sofa: 'sofa',
    appliance: 'đồ gia dụng',
    refrigerator: 'tủ lạnh',
    microwave: 'lò vi sóng',
    oven: 'lò nướng',
    stove: 'bếp',
    blender: 'máy xay',
    mixer: 'máy trộn',
    toaster: 'máy nướng bánh',
    kettle: 'ấm đun nước',

    // Music & Entertainment
    music: 'âm nhạc',
    guitar: 'đàn guitar',
    piano: 'đàn piano',
    drum: 'trống',
    speaker: 'loa',
    headphone: 'tai nghe',
    microphone: 'micro',
    instrument: 'nhạc cụ',

    // Books & Learning
    book: 'sách',
    notebook: 'sổ tay',
    pen: 'bút',
    pencil: 'bút chì',
    education: 'giáo dục',
    learning: 'học tập',
    study: 'học',

    // Nature & Animals
    animal: 'động vật',
    dog: 'chó',
    cat: 'mèo',
    pet: 'thú cưng',
    bird: 'chim',
    tree: 'cây',
    flower: 'hoa',
    plant: 'cây',
    nature: 'thiên nhiên',
    outdoor: 'ngoài trời',

    // General
    object: 'đồ vật',
    item: 'vật phẩm',
    thing: 'đồ',
    product: 'sản phẩm',
    equipment: 'trang thiết bị',
    gear: 'đồ nghề',
    accessory: 'phụ kiện',
    new: 'mới',
    old: 'cũ',
    modern: 'hiện đại',
    vintage: 'cổ điển',
    professional: 'chuyên nghiệp',
    portable: 'di động',
    compact: 'nhỏ gọn',
    large: 'lớn',
    small: 'nhỏ',
    lightweight: 'nhẹ',
    heavy: 'nặng',
    durable: 'bền',
    quality: 'chất lượng',

    // Colors
    black: 'đen',
    white: 'trắng',
    red: 'đỏ',
    blue: 'xanh dương',
    green: 'xanh lá',
    yellow: 'vàng',
    orange: 'cam',
    purple: 'tím',
    pink: 'hồng',
    brown: 'nâu',
    gray: 'xám',
    grey: 'xám',

    // Actions
    rental: 'cho thuê',
    rent: 'thuê',
    borrow: 'mượn',
    lend: 'cho mượn',
    use: 'sử dụng',
    work: 'làm việc',

    // Ignore words (không cần dịch)
    'no person': null,
    indoors: null,
    outdoors: null,
    sfw: null,
    nsfw: null,
    safe: null,
    adult: null
  };

  /**
   * Translate concept từ Anh sang Việt
   * @param {string} englishText - Text tiếng Anh
   * @returns {string|null} Text tiếng Việt hoặc null nếu không cần dịch
   */
  static translateToVietnamese(englishText) {
    if (!englishText) return null;

    const normalized = englishText.toLowerCase().trim();

    // Check exact match
    if (this.englishToVietnamese.hasOwnProperty(normalized)) {
      return this.englishToVietnamese[normalized];
    }

    // Check partial match
    for (const [key, value] of Object.entries(this.englishToVietnamese)) {
      if (value === null) continue; // Skip ignore words

      // If concept contains the key or vice versa
      if (normalized.includes(key) || key.includes(normalized)) {
        return value;
      }
    }

    // Không tìm thấy translation, trả về original
    return normalized;
  }

  /**
   * Translate nhiều concepts
   * @param {Array} concepts - Array of concepts [{name, value}]
   * @returns {Array} Translated concepts with both English and Vietnamese
   */
  static translateConcepts(concepts) {
    if (!Array.isArray(concepts)) return [];

    return concepts
      .map((concept) => {
        const vietnamese = this.translateToVietnamese(concept.name);

        // Skip null translations (ignored words)
        if (vietnamese === null) {
          return null;
        }

        return {
          ...concept,
          nameEnglish: concept.name,
          name: vietnamese, // Override với tiếng Việt
          nameVietnamese: vietnamese
        };
      })
      .filter((c) => c !== null); // Remove ignored concepts
  }

  /**
   * Get all translations (for reference)
   */
  static getAllTranslations() {
    return this.englishToVietnamese;
  }
}

module.exports = TranslationService;
