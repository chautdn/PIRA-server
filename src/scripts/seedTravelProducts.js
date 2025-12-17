const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
require('dotenv').config();

// 3 owner IDs
const OWNERS = ['69266ec999e64ed9a8483e97', '68d3556d9b4c00cdfa1d9a63', '68d4b53e3202ddb7f422f113'];

// Hàm random số từ min đến max
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Hàm random owner
const randomOwner = () => OWNERS[randomInt(0, OWNERS.length - 1)];

// Hàm random condition
const randomCondition = () => {
  const conditions = ['NEW', 'LIKE_NEW', 'GOOD'];
  return conditions[randomInt(0, conditions.length - 1)];
};

// Hàm tạo slug
const createSlug = (title) => {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
};

// Hàm tạo images phù hợp với sản phẩm
const generateProductImages = (title, categorySlug) => {
  const imageSets = {
    'leu-cam-trai-2-nguoi': [
      {
        url: 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800',
        alt: `${title} - Tent setup`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800',
        alt: `${title} - Camping scene`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Tent interior`,
        isMain: false
      }
    ],
    'leu-gia-dinh': [
      {
        url: 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800',
        alt: `${title} - Family tent`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Large camping tent`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Family camping`,
        isMain: false
      }
    ],
    'tui-ngu-tam-trai': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Sleeping bag`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Camping gear`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Outdoor sleeping`,
        isMain: false
      }
    ],
    'ghe-ban-gap': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Camping chairs`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Outdoor furniture`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Picnic setup`,
        isMain: false
      }
    ],
    'ba-lo-leo-nui': [
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Hiking backpack`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Trekking gear`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Mountain hiking`,
        isMain: false
      }
    ],
    'tui-chong-nuoc': [
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Waterproof bag`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Kayaking gear`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Water sports`,
        isMain: false
      }
    ],
    'bep-nhien-lieu': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Camping stove`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Outdoor cooking`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Campfire cooking`,
        isMain: false
      }
    ],
    'den-doi-dau': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Headlamp`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Night hiking`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Camping lights`,
        isMain: false
      }
    ],
    'bo-so-cuu': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - First aid kit`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Emergency supplies`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Safety gear`,
        isMain: false
      }
    ],
    'dao-da-nang-sinh-ton': [
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Multi-tool knife`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Survival gear`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Outdoor tools`,
        isMain: false
      }
    ],
    'may-anh-gopro': [
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Action camera`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Adventure photography`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Sports camera`,
        isMain: false
      }
    ],
    'flycam-drone': [
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Drone flying`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Aerial photography`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Drone technology`,
        isMain: false
      }
    ],
    'xe-may-du-lich': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Adventure motorcycle`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Motorcycle touring`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Travel bike`,
        isMain: false
      }
    ],
    'binh-nuoc-giu-nhiet': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Insulated water bottle`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Hydration gear`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Outdoor drinking`,
        isMain: false
      }
    ],
    'den-leu': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Lantern light`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Camping illumination`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Tent lighting`,
        isMain: false
      }
    ],
    'xe-dap-dia-hinh': [
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Mountain bike`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Bike trail`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Cycling adventure`,
        isMain: false
      }
    ],
    'bo-noi-dung-cu-an-uong': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Camping cookware`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Outdoor kitchen`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Camp cooking`,
        isMain: false
      }
    ],
    'den-pin-cam-tay': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Flashlight`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Handheld light`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Portable lighting`,
        isMain: false
      }
    ],
    'thiet-bi-dien-tu-khac': [
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Electronic device`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Gadgets`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Tech gear`,
        isMain: false
      }
    ],
    'trang-bi-leo-nui': [
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Climbing gear`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Mountain climbing`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Rock climbing`,
        isMain: false
      }
    ],
    'kayak-sup': [
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Kayak on water`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Paddle boarding`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Water sports`,
        isMain: false
      }
    ],
    'van-truot-patin': [
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Skateboard`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Inline skating`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
        alt: `${title} - Action sports`,
        isMain: false
      }
    ],
    'khac-sub': [
      {
        url: 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800',
        alt: `${title} - Outdoor gear`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Adventure equipment`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Miscellaneous gear`,
        isMain: false
      }
    ]
  };

  return (
    imageSets[categorySlug] || [
      {
        url: 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800',
        alt: `${title} - Camping gear`,
        isMain: true
      },
      {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
        alt: `${title} - Outdoor equipment`,
        isMain: false
      },
      {
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
        alt: `${title} - Adventure gear`,
        isMain: false
      }
    ]
  );
};

// Product templates theo từng subcategory du lịch
const productTemplates = {
  // LỀU CẮM TRẠI 2 NGƯỜI
  'leu-cam-trai-2-nguoi': [
    {
      title: 'Lều Cắm Trại 2 Người NatureHike Cloud Up 2',
      description:
        'Lều 2 người NatureHike Cloud Up 2 siêu nhẹ chỉ 1.8kg, thiết kế double layer chống mưa tuyệt đối. Khung nhôm 7001 bền chắc, vải 20D nylon ripstop chống thấm 4000mm. Cửa lưới chống muỗi 2 bên, túi đựng đồ bên trong. Dựng lều nhanh chóng trong 3 phút. Kích thước 210x130x100cm đủ rộng cho 2 người. Màu xanh lá cây, kèm theo bao đựng và dây chằng. Thích hợp cho trekking, camping cá nhân.',
      brand: { name: 'NatureHike', model: 'Cloud Up 2' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800&q=80',
          alt: 'Lều NatureHike Cloud Up 2 màu xanh lá',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&q=80',
          alt: 'Lều cắm trại 2 người giữa rừng',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
          alt: 'Bên trong lều cắm trại double layer',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 80000,
        weeklyRate: 450000,
        monthlyRate: 1200000,
        deposit: { amount: 400000 }
      }
    },
    {
      title: 'Lều 2 Người Coleman Sundome 2 Person Tent',
      description:
        'Coleman Sundome lều classic cho 2 người, thiết kế dome dễ dựng. Khung fiberglass bền, vải polyester chống thấm nước 1500mm. Hệ thống thông gió WeatherTec giảm ngưng tụ. Cửa chính rộng, cửa sổ lưới. Kích thước 213x152x122cm, đủ rộng thoải mái. Túi đựng đồ bên trong và móc treo đèn. Màu xanh navy. Đã sử dụng nhẹ, còn rất tốt.',
      brand: { name: 'Coleman', model: 'Sundome 2' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1537225228614-56cc3556d7ed?w=800&q=80',
          alt: 'Lều Coleman Sundome màu xanh navy',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&q=80',
          alt: 'Lều dome 2 người thiết kế classic',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&q=80',
          alt: 'Lều camping dễ dựng Coleman',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 70000,
        weeklyRate: 400000,
        monthlyRate: 1100000,
        deposit: { amount: 350000 }
      }
    },
    {
      title: 'Lều Dã Ngoại 2 Người Quechua MH100 Fresh',
      description:
        'Quechua MH100 Fresh lều 2 người với công nghệ Fresh&Black phản xạ nhiệt, giữ mát bên trong. Vải polyester chống thấm 2000mm, dựng dễ dàng. 2 cửa thoáng khí, túi đựng đồ. Kích thước 205x145x98cm. Trọng lượng 2.3kg gọn nhẹ. Màu be/nâu. Phù hợp camping, picnic, festival. Tình trạng tốt, vệ sinh sạch sẽ.',
      brand: { name: 'Quechua', model: 'MH100 Fresh' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1476041800959-2f6bb412c8ce?w=800&q=80',
          alt: 'Lều Quechua MH100 Fresh màu be nâu',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1487730116645-74489c95b41b?w=800&q=80',
          alt: 'Lều 2 người cho festival và picnic',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800&q=80',
          alt: 'Lều công nghệ Fresh&Black phản xạ nhiệt',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 60000,
        weeklyRate: 350000,
        monthlyRate: 950000,
        deposit: { amount: 300000 }
      }
    },
    {
      title: 'Lều Trekking MSR Hubba Hubba NX 2-Person',
      description:
        'MSR Hubba Hubba NX lều backpacking cao cấp cho 2 người, trọng lượng siêu nhẹ 1.54kg. Thiết kế freestanding với 2 cửa và 2 tiền sảnh. Vải ripstop nylon chống thấm 1200mm, khung nhôm DAC. Hệ thống thông gió tối ưu chống ngưng tụ. Kích thước 213x127x100cm. Màu đỏ/xám. Kèm footprint. Đã trekking 5 chuyến, bảo dưỡng kỹ.',
      brand: { name: 'MSR', model: 'Hubba Hubba NX' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?w=800&q=80',
          alt: 'Lều MSR Hubba Hubba NX màu đỏ xám',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&q=80',
          alt: 'Lều backpacking siêu nhẹ MSR',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&q=80',
          alt: 'Lều trekking 2 cửa freestanding',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 120000,
        weeklyRate: 700000,
        monthlyRate: 2000000,
        deposit: { amount: 800000 }
      }
    },
    {
      title: 'Lều Cắm Trại Kazmi K20T3T010 Ultra Light',
      description:
        'Kazmi K20T3T010 lều ultralight 2 người từ Hàn Quốc, trọng lượng chỉ 1.65kg. Double layer, vải 15D nylon siliconized chống thấm 3000mm. Khung nhôm 7001 chắc chắn. 2 cửa, 2 vestibule. Thông gió tốt chống ngưng tụ. Kích thước 220x130x105cm. Màu be/cam. Gọn nhẹ cho solo backpacking. Mới 90%.',
      brand: { name: 'Kazmi', model: 'K20T3T010' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1508873881324-c92a3fc536ba?w=800&q=80',
          alt: 'Lều Kazmi ultralight màu cam be',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1476041800959-2f6bb412c8ce?w=800&q=80',
          alt: 'Lều siêu nhẹ Hàn Quốc Kazmi',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1487730116645-74489c95b41b?w=800&q=80',
          alt: 'Lều double layer 2 vestibule',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 100000,
        weeklyRate: 580000,
        monthlyRate: 1650000,
        deposit: { amount: 600000 }
      }
    },
    {
      images: [
        {
          url: 'https://images.unsplash.com/photo-1471115853179-bb1d604434e0?w=800&q=80',
          alt: 'Lều The North Face Stormbreak màu vàng xám',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&q=80',
          alt: 'Lều camping 2 người freestanding',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1526491109672-74740652b963?w=800&q=80',
          alt: 'Lều đôi kinh tế The North Face',
          isMain: false
        }
      ],

      title: 'Lều Đôi The North Face Stormbreak 2',
      description:
        'The North Face Stormbreak 2 lều camping kinh tế cho 2 người. Khung nhôm bền, vải polyester chống thấm 1500mm. Thiết kế freestanding dễ dựng. 1 cửa chính, cửa lưới chống muỗi. Vestibule để đồ. Kích thước 213x165x107cm rộng rãi. Trọng lượng 2.18kg. Màu vàng/xám. Đã camping 10 lần, vệ sinh sạch.',
      brand: { name: 'The North Face', model: 'Stormbreak 2' },
      pricing: {
        dailyRate: 75000,
        weeklyRate: 430000,
        monthlyRate: 1200000,
        deposit: { amount: 380000 }
      }
    }
  ],

  // LỀU GIA ĐÌNH
  'leu-gia-dinh': [
    {
      title: 'Lều Gia Đình 6 Người Coleman Instant Cabin',
      description:
        'Coleman Instant Cabin lều gia đình lớn cho 6 người, dựng instant trong 60 giây. Khung pre-attached tiện lợi, vải polyester WeatherTec chống thấm. Cửa lớn hinged-door, cửa sổ lưới 6 panel thông gió tốt. Kích thước 305x305x198cm, đủ cao để đứng thẳng. Ngăn riêng có thể tháo rời. Túi đựng có bánh xe. Thích hợp camping gia đình, picnic. Tình trạng tốt.',
      brand: { name: 'Coleman', model: 'Instant Cabin 6P' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800&q=80',
          alt: 'Lều gia đình Coleman Instant Cabin 6 người',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&q=80',
          alt: 'Lều cabin lớn cho gia đình',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1508873881324-c92a3fc536ba?w=800&q=80',
          alt: 'Bên trong lều gia đình rộng rãi',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 200000,
        weeklyRate: 1200000,
        monthlyRate: 3500000,
        deposit: { amount: 1500000 }
      }
    },
    {
      title: 'Lều Cắm Trại 4 Người Naturehike Village 13',
      description:
        'NatureHike Village 13 lều gia đình 4 người thiết kế tunnel, 1 phòng ngủ + 1 living space. Vải 210T polyester chống thấm 3000mm. Khung fiberglass 11mm bền. 3 cửa, nhiều cửa sổ lưới. Kích thước 390x200x140cm. Trọng lượng 6kg. Màu xanh lá. Phù hợp camping gia đình cuối tuần. Đã sử dụng 5 lần, bảo quản tốt.',
      brand: { name: 'NatureHike', model: 'Village 13' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1487730116645-74489c95b41b?w=800&q=80',
          alt: 'Lều NatureHike Village 13 xanh lá tunnel',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1476041800959-2f6bb412c8ce?w=800&q=80',
          alt: 'Lều tunnel 4 người NatureHike',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&q=80',
          alt: 'Lều camping cuối tuần gia đình',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 150000,
        weeklyRate: 900000,
        monthlyRate: 2600000,
        deposit: { amount: 1000000 }
      }
    },
    {
      title: 'Lều Gia Đình 8 Người Core Instant Cabin',
      description:
        'Core Instant Cabin lều siêu lớn cho 8 người, instant setup trong 60 giây. Vải rip-stop chống thấm H20 Block Technology. Trần cao 183cm đứng thẳng được. Advanced venting system với adjustable ground vent. Divider curtain tạo 2 phòng riêng. Kích thước 427x305x183cm. Túi đựng có bánh xe. Màu xanh. Thích hợp đi nhóm lớn.',
      brand: { name: 'Core', model: 'Instant Cabin 8P' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1526491109672-74740652b963?w=800&q=80',
          alt: 'Lều siêu lớn Core Instant Cabin 8 người',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800&q=80',
          alt: 'Lều xanh instant setup cho nhóm',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1508873881324-c92a3fc536ba?w=800&q=80',
          alt: 'Lều 2 phòng cho 8 người',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 250000,
        weeklyRate: 1500000,
        monthlyRate: 4200000,
        deposit: { amount: 2000000 }
      }
    },
    {
      title: 'Lều Tunnel 5 Người Quechua Air Seconds 5.2',
      description:
        'Quechua Air Seconds 5.2 lều inflatable cho 5 người, bơm hơi dựng trong 90 giây. 2 phòng ngủ + living area rộng. Vải polyester Fresh&Black chống nóng. Hệ thống Air Pole thay thế khung truyền thống. Cửa lớn, cửa sổ nhiều. Kích thước 400x230x190cm. Kèm túi đựng và bơm. Màu xanh/trắng. Đã camping 3 lần gia đình.',
      brand: { name: 'Quechua', model: 'Air Seconds 5.2' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1537225228614-56cc3556d7ed?w=800&q=80',
          alt: 'Lều Quechua Air Seconds 5.2 inflatable',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1471115853179-bb1d604434e0?w=800&q=80',
          alt: 'Lều bơm hơi 5 người Quechua',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&q=80',
          alt: 'Lều xanh trắng Air Pole 2 phòng',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 280000,
        weeklyRate: 1650000,
        monthlyRate: 4800000,
        deposit: { amount: 2200000 }
      }
    },
    {
      title: 'Lều Dome Gia Đình 4 Người Eureka Copper Canyon',
      description:
        'Eureka Copper Canyon lều cabin-style cho 4 người, trần cao 213cm đứng thẳng thoải mái. Khung thép bền chắc, vải polyester chống thấm. Cửa lớn D-style, 2 cửa sổ lưới. E! Power Port cho dây điện. Túi đựng đồ bên trong. Kích thước 213x213x213cm. Trọng lượng 10.4kg. Màu nâu. Thích hợp car camping.',
      brand: { name: 'Eureka', model: 'Copper Canyon 4' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1476041800959-2f6bb412c8ce?w=800&q=80',
          alt: 'Lều Eureka Copper Canyon 4 màu nâu',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1526491109672-74740652b963?w=800&q=80',
          alt: 'Lều cabin-style cho car camping',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&q=80',
          alt: 'Lều trần cao 213cm đứng thẳng',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 180000,
        weeklyRate: 1050000,
        monthlyRate: 3000000,
        deposit: { amount: 1200000 }
      }
    },
    {
      title: 'Lều Gia Đình 6 Người Vango Odyssey Air 600',
      description:
        'Vango Odyssey Air 600 lều inflatable cao cấp cho 6 người. AirBeam technology dựng nhanh chóng. 3 phòng ngủ + living space lớn. Vải Protex 70D chống thấm 4000mm. TBS II tension band system ổn định. Pre-angled beams chống gió tốt. Kích thước 545x380x210cm. Màu xanh Moroccan Blue. Mới 95%, rất đẹp.',
      brand: { name: 'Vango', model: 'Odyssey Air 600' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1487730116645-74489c95b41b?w=800&q=80',
          alt: 'Lều Vango Odyssey Air 600 cao cấp xanh',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1508873881324-c92a3fc536ba?w=800&q=80',
          alt: 'Lều Moroccan Blue 3 phòng ngủ',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&q=80',
          alt: 'Lều AirBeam technology 6 người',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 320000,
        weeklyRate: 1900000,
        monthlyRate: 5500000,
        deposit: { amount: 2500000 }
      }
    }
  ],

  // TÚI NGỦ & TẤM TRẢI
  'tui-ngu-tam-trai': [
    {
      title: 'Túi Ngủ Naturehike LW180 Mùa Hè 1.5 Season',
      description:
        'NatureHike LW180 túi ngủ envelope siêu nhẹ 650g cho mùa hè. Lớp lót polyester mềm mại, bên ngoài 190T nylon. Nhiệt độ thoải mái 15-25°C. Có thể mở thành chăn phẳng. Kích thước 190x75cm. Túi đựng compression nhỏ gọn 18x14cm. Màu xanh lá. Thích hợp camping mùa hè, du lịch. Đã giặt sạch.',
      brand: { name: 'NatureHike', model: 'LW180' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?w=800&q=80',
          alt: 'Túi ngủ NatureHike LW180 xanh lá nhẹ',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&q=80',
          alt: 'Túi ngủ envelope mùa hè',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800&q=80',
          alt: 'Túi ngủ siêu nhẹ 650g',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 35000,
        weeklyRate: 200000,
        monthlyRate: 550000,
        deposit: { amount: 150000 }
      }
    },
    {
      title: 'Túi Ngủ Coleman Palmetto 30°F/-1°C Regular',
      description:
        'Coleman Palmetto túi ngủ 3 season cho nhiệt độ xuống -1°C. Lớp lót polyester ComfortSmart ấm áp. Lớp Thermolock giữ nhiệt tốt. ZipPlow zipper không bị kẹt. Có thể ghép 2 túi thành đôi. Kích thước 213x81cm. Trọng lượng 1.9kg. Màu xanh lá. Máy giặt được. Camping mùa thu/đông. Tình trạng tốt.',
      brand: { name: 'Coleman', model: 'Palmetto 30°F' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&q=80',
          alt: 'Túi ngủ Coleman Palmetto 3 season',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
          alt: 'Túi ngủ -1°C mùa đông',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1476041800959-2f6bb412c8ce?w=800&q=80',
          alt: 'Túi ngủ Thermolock giữ nhiệt tốt',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 50000,
        weeklyRate: 290000,
        monthlyRate: 800000,
        deposit: { amount: 250000 }
      }
    },
    {
      title: "Túi Ngủ Lông Vũ The North Face Cat's Meow",
      description:
        "The North Face Cat's Meow túi ngủ lông vũ 600-fill cho -7°C. Thiết kế mummy form-fitting giữ nhiệt tốt. Vải ripstop nylon chống nước DWR. Hood có dây rút, draft tube chống gió. Zipper 2 chiều thuận tiện. Kích thước 198x81/53cm. Trọng lượng 1.19kg. Màu vàng/xám. Backpacking, trekking núi cao. Mới 90%.",
      brand: { name: 'The North Face', model: "Cat's Meow" },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1471115853179-bb1d604434e0?w=800&q=80',
          alt: 'Túi ngủ lông vũ The North Face vàng xám',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1508873881324-c92a3fc536ba?w=800&q=80',
          alt: 'Túi ngủ mummy 600-fill down',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1537225228614-56cc3556d7ed?w=800&q=80',
          alt: 'Túi ngủ trekking núi cao -7°C',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 90000,
        weeklyRate: 520000,
        monthlyRate: 1500000,
        deposit: { amount: 600000 }
      }
    },
    {
      title: 'Thảm Hơi Tự Phồng Thermarest NeoAir XLite',
      description:
        'Thermarest NeoAir XLite thảm hơi tự phồng siêu nhẹ 350g cho backpacking. ThermaCapture technology phản xạ nhiệt cơ thể R-value 4.2. Triangular Core Matrix tạo ổn định. Kích thước 183x51cm dày 6.4cm êm ái. Màu vàng cam. Kèm túi đựng và bộ vá. Đã trekking 10 lần, không thủng lỗ.',
      brand: { name: 'Thermarest', model: 'NeoAir XLite' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1526491109672-74740652b963?w=800&q=80',
          alt: 'Thảm hơi Thermarest NeoAir XLite cam',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1471115853179-bb1d604434e0?w=800&q=80',
          alt: 'Thảm tự phồng siêu nhẹ 350g',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&q=80',
          alt: 'Thảm ngủ backpacking R-value 4.2',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 60000,
        weeklyRate: 350000,
        monthlyRate: 1000000,
        deposit: { amount: 400000 }
      }
    },
    {
      title: 'Tấm Trải Cách Nhiệt EVA 2 Lớp 180x60cm',
      description:
        'Tấm trải cách nhiệt EVA foam 2 lớp dày 10mm, cách nhiệt tốt và chống ẩm. Bề mặt texture chống trượt, màu xanh/bạc. Nhẹ 280g, cuộn gọn dễ mang theo. Kích thước 180x60cm. Có dây buộc cố định. Thích hợp picnic, camping, yoga ngoài trời. Vệ sinh dễ dàng. Đã sử dụng nhẹ.',
      brand: { name: 'Generic', model: 'EVA Mat 10mm' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
          alt: 'Tấm trải EVA foam xanh bạc',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1508873881324-c92a3fc536ba?w=800&q=80',
          alt: 'Tấm cách nhiệt 2 lớp 10mm',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1487730116645-74489c95b41b?w=800&q=80',
          alt: 'Thảm picnic cuộn gọn',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 80000 }
      }
    },
    {
      title: 'Túi Ngủ Đôi Coleman Tandem 3-in-1',
      description:
        'Coleman Tandem túi ngủ đôi 3-in-1 có thể tách thành 2 túi đơn. Rộng 132cm cho 2 người. Nhiệt độ 10°C. Lớp lót polyester mềm mại. ComfortSmart technology. 2 zipper riêng biệt. Kích thước 213x132cm. Trọng lượng 3.4kg. Màu xanh đậm. Thích hợp đi cặp đôi, gia đình. Máy giặt được.',
      brand: { name: 'Coleman', model: 'Tandem 3-in-1' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1537225228614-56cc3556d7ed?w=800&q=80',
          alt: 'Túi ngủ đôi Coleman Tandem xanh đậm',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&q=80',
          alt: 'Túi ngủ 3-in-1 cho cặp đôi',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&q=80',
          alt: 'Túi ngủ rộng 132cm cho 2 người',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 70000,
        weeklyRate: 400000,
        monthlyRate: 1100000,
        deposit: { amount: 350000 }
      }
    }
  ],

  // GHẾ & BÀN GẤP
  'ghe-ban-gap': [
    {
      title: 'Ghế Xếp Du Lịch Coleman Quad Chair Cooler',
      description:
        'Coleman Quad Chair ghế xếp có túi giữ lạnh tích hợp (4 lon), tựa tay có cốc holder. Khung thép chịu tải 113kg, vải polyester 600D bền. Tựa lưng cao 50cm thoải mái. Gấp gọn với túi xách có dây đeo vai. Kích thước mở 81x51x91cm. Màu đen/đỏ. Thích hợp camping, picnic, câu cá. Tình trạng tốt.',
      brand: { name: 'Coleman', model: 'Quad Chair Cooler' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
          alt: 'Ghế xếp Coleman Quad Chair đen đỏ',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800&q=80',
          alt: 'Ghế camping có túi giữ lạnh',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
          alt: 'Ghế du lịch gấp gọn Coleman',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 40000,
        weeklyRate: 230000,
        monthlyRate: 650000,
        deposit: { amount: 200000 }
      }
    },
    {
      title: 'Ghế Gấp Ultralight Helinox Chair One',
      description:
        'Helinox Chair One ghế gấp siêu nhẹ 890g với khung nhôm DAC TH72M. Vải polyester chịu lực 600D. Lắp ráp nhanh chóng bằng shock cord. Chịu tải 145kg dù rất nhẹ. Kích thước ngồi 52x50cm cao 66cm. Gấp gọn 35x10x12cm. Màu đỏ. Kèm túi đựng. Thích hợp backpacking, trekking. Mới 95%.',
      brand: { name: 'Helinox', model: 'Chair One' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=800&q=80',
          alt: 'Ghế gấp Helinox Chair One màu đỏ',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
          alt: 'Ghế ultralight cho trekking',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80',
          alt: 'Ghế camping nhẹ 890g',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 60000,
        weeklyRate: 350000,
        monthlyRate: 1000000,
        deposit: { amount: 400000 }
      }
    },
    {
      title: 'Bàn Gấp Nhôm Du Lịch 70x70cm Có Điều Chỉnh Cao',
      description:
        'Bàn gấp nhôm alloy nhẹ chỉ 2.5kg, mặt bàn 70x70cm rộng rãi. Chân bàn điều chỉnh 3 mức cao 40/55/62cm. Mặt bàn MDF chống nước, khung nhôm chống gỉ. Gấp gọn 70x70x7cm. Có tay cầm xách. Màu bạc/nâu gỗ. Chịu tải 30kg. Thích hợp camping, picnic gia đình. Đã sử dụng nhẹ.',
      brand: { name: 'Outdoor Life', model: 'Alu Folding Table' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=800&q=80',
          alt: 'Bàn gấp nhôm 70x70cm',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
          alt: 'Bàn du lịch điều chỉnh cao',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
          alt: 'Bàn camping gấp gọn',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 50000,
        weeklyRate: 290000,
        monthlyRate: 800000,
        deposit: { amount: 300000 }
      }
    },
    {
      title: 'Ghế Xếp Có Tựa Lưng Kazmi K20T1C015',
      description:
        'Kazmi K20T1C015 ghế xếp tựa lưng cao thư giãn, khung nhôm 7075 siêu bền. Vải oxford 600D chống nước. Tựa đầu có thể điều chỉnh. 2 tựa tay có túi đựng, cốc holder. Chịu tải 120kg. Kích thước 55x67x92cm. Gấp gọn 94x17x17cm. Trọng lượng 2.8kg. Màu be. Kèm túi đeo vai. Camping thoải mái.',
      brand: { name: 'Kazmi', model: 'K20T1C015' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800&q=80',
          alt: 'Ghế Kazmi tựa lưng cao màu be',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80',
          alt: 'Ghế camping thư giãn có tựa đầu',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=800&q=80',
          alt: 'Ghế xếp Kazmi Hàn Quốc',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 55000,
        weeklyRate: 320000,
        monthlyRate: 900000,
        deposit: { amount: 350000 }
      }
    },
    {
      title: 'Bộ Bàn Ghế Gấp 4 Người Quechua Table & Chairs Set',
      description:
        'Quechua bộ bàn ghế gấp cho 4 người gồm 1 bàn + 4 ghế xếp. Khung nhôm nhẹ, mặt bàn 110x70cm. Ghế có lưng và tay vịn. Gấp gọn tất cả vào bàn, có tay cầm xách. Trọng lượng tổng 8kg. Màu xanh/xám. Chịu tải mỗi ghế 110kg. Thích hợp picnic gia đình, camping. Tình trạng tốt.',
      brand: { name: 'Quechua', model: 'Table & 4 Chairs Set' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=800&q=80',
          alt: 'Bộ bàn ghế Quechua 4 người',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
          alt: 'Bàn ghế picnic gia đình gấp gọn',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
          alt: 'Bộ bàn ghế camping nhậm nhập',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 100000,
        weeklyRate: 580000,
        monthlyRate: 1650000,
        deposit: { amount: 600000 }
      }
    },
    {
      title: 'Ghế Recliner Camping Alps Mountaineering King Kong',
      description:
        'Alps Mountaineering King Kong ghế xếp siêu to cho người to con, chịu tải 181kg. Tựa lưng recline 4 vị trí. Khung thép powder-coated bền chắc. Vải polyester 600D. 2 tựa tay rộng có cốc holder. Chân ghế có đệm chống lún. Kích thước 86x61x102cm. Màu xanh navy. Túi xách có bánh xe. Camping sang trọng.',
      brand: { name: 'Alps Mountaineering', model: 'King Kong Chair' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800&q=80',
          alt: 'Ghế Alps Mountaineering King Kong navy',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
          alt: 'Ghế recliner camping chịu tải lớn',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80',
          alt: 'Ghế xếp 4 vị trí recline',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 65000,
        weeklyRate: 380000,
        monthlyRate: 1100000,
        deposit: { amount: 400000 }
      }
    }
  ],

  // BA LÔ LEO NÚI
  'ba-lo-leo-nui': [
    {
      title: 'Ba Lô Leo Núi Deuter Aircontact Lite 65+10L',
      description:
        'Deuter Aircontact Lite 65+10L ba lô trekking cao cấp với hệ thống lưng Aircontact Lite thông gió tốt. Vari-Quick điều chỉnh chiều dài lưng. Hip belt có túi đựng đồ. Nắp mở rộng thêm 10L. Túi ngủ compartment riêng. Rain cover tích hợp. Vải Deuter-Ripstop 210 chống xé. Màu xanh navy. Size M. Đã trekking 5 chuyến.',
      brand: { name: 'Deuter', model: 'Aircontact Lite 65+10' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1622260614927-45b8f81023b4?w=800&q=80',
          alt: 'Ba lô Deuter Aircontact Lite xanh navy',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
          alt: 'Ba lô trekking 65L Deuter',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1577982787983-e07c6730f2d3?w=800&q=80',
          alt: 'Ba lô leo núi Aircontact Lite',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 80000,
        weeklyRate: 460000,
        monthlyRate: 1300000,
        deposit: { amount: 500000 }
      }
    },
    {
      title: 'Ba Lô Phượt Osprey Atmos AG 50L Size M',
      description:
        'Osprey Atmos AG 50L với công nghệ Anti-Gravity suspension, lưng lưới 3D thoáng mát. FlapJacket rain cover tích hợp. Stow-on-the-Go trekking pole attachment. Hip belt và harness điều chỉnh. Dual access từ top và front panel. Hydration compatible. Màu xám/xanh. Size M phù hợp lưng 43-51cm. Mới 90%.',
      brand: { name: 'Osprey', model: 'Atmos AG 50' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
          alt: 'Ba lô Osprey Atmos AG 50L xám xanh',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1622260614927-45b8f81023b4?w=800&q=80',
          alt: 'Ba lô Anti-Gravity suspension',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=800&q=80',
          alt: 'Osprey Atmos backpack 50L',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 90000,
        weeklyRate: 520000,
        monthlyRate: 1500000,
        deposit: { amount: 600000 }
      }
    },
    {
      title: 'Balo Trekking Lowe Alpine Diran 65:75L',
      description:
        'Lowe Alpine Diran 65:75L ba lô adjustable từ 65L đến 75L bằng extension collar. TriShield Pro vải bền chống nước. AirZone back system thoáng khí. Hip belt có 2 túi lớn. Bottom compartment cho túi ngủ. Trekking pole loops, ice axe loop. Màu xanh đen. Size L. Chịu tải 25kg. Backpacking lâu ngày.',
      brand: { name: 'Lowe Alpine', model: 'Diran 65:75' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1577982787983-e07c6730f2d3?w=800&q=80',
          alt: 'Ba lô Lowe Alpine Diran xanh đen',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
          alt: 'Balo trekking 65-75L adjustable',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1622260614927-45b8f81023b4?w=800&q=80',
          alt: 'Ba lô AirZone backpacking',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 75000,
        weeklyRate: 430000,
        monthlyRate: 1250000,
        deposit: { amount: 550000 }
      }
    },
    {
      title: 'Ba Lô 40L Quechua MH500 Waterproof',
      description:
        'Quechua MH500 40L ba lô chống nước hoàn toàn với vải waterproof và đường may sealed. Không cần rain cover. Lưng foam thoáng khí. Hip belt tháo rời. Top lid có túi đựng. Side compression straps. Màu xanh đậm. Phù hợp trekking 2-3 ngày. Trọng lượng 1.5kg nhẹ. Tình trạng tốt, vệ sinh sạch.',
      brand: { name: 'Quechua', model: 'MH500 40L' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=800&q=80',
          alt: 'Ba lô Quechua MH500 40L xanh đậm',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
          alt: 'Ba lô waterproof 40L',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1577982787983-e07c6730f2d3?w=800&q=80',
          alt: 'Balo trekking nhẹ 1.5kg',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 50000,
        weeklyRate: 290000,
        monthlyRate: 850000,
        deposit: { amount: 350000 }
      }
    },
    {
      title: 'Balo Phượt Gregory Baltoro 75L GC Pro',
      description:
        'Gregory Baltoro 75L hàng đầu cho multi-day trekking. Response A3 suspension điều chỉnh hoàn hảo. QuickSwap hip belt có thể thay. Dual access U-zip. Rain cover, hydration sleeve. Nhiều túi đựng đồ. Vải 420D Velocity nylon bền. Màu xám than. Size M. Chịu tải 30kg thoải mái. Mới 85%.',
      brand: { name: 'Gregory', model: 'Baltoro 75 GC Pro' },
      pricing: {
        dailyRate: 100000,
        weeklyRate: 580000,
        monthlyRate: 1700000,
        deposit: { amount: 700000 }
      }
    },
    {
      title: 'Ba Lô Ultralight Granite Gear Crown2 60L',
      description:
        'Granite Gear Crown2 60L ba lô ultralight chỉ 1.02kg nhưng chịu tải 18kg. Re-Fit hip belt điều chỉnh. Removable framesheet và hip belt để giảm cân. Vải 100D Robic nylon bền nhẹ. Side pockets lớn. Lid pocket. Màu xanh lá. Thích hợp thru-hiking, fastpacking. Đã trekking 200km, còn rất tốt.',
      brand: { name: 'Granite Gear', model: 'Crown2 60' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=800&q=80',
          alt: 'Ba lô Granite Gear Crown2 60L xanh lá',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
          alt: 'Ba lô ultralight 1.02kg',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1577982787983-e07c6730f2d3?w=800&q=80',
          alt: 'Ba lô thru-hiking fastpacking',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 70000,
        weeklyRate: 400000,
        monthlyRate: 1150000,
        deposit: { amount: 450000 }
      }
    }
  ],

  // TÚI CHỐNG NƯỚC
  'tui-chong-nuoc': [
    {
      title: 'Túi Khô Chống Nước Sea to Summit Big River 35L',
      description:
        'Sea to Summit Big River 35L túi khô chống nước tuyệt đối với vải TPU 420D siêu bền. Đường may hàn kín. Hypalon roll-top closure kín nước. D-ring gắn thêm. Có quai đeo vai tháo rời. Màu xanh dương. Kích thước 30x65cm. Thích hợp kayaking, rafting, đi biển. Đã sử dụng nhẹ, không hỏng.',
      brand: { name: 'Sea to Summit', model: 'Big River 35L' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=800&q=80',
          alt: 'Túi khô Sea to Summit xanh dương',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800&q=80',
          alt: 'Túi chống nước TPU 35L',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1520338733455-d36f46c531f8?w=800&q=80',
          alt: 'Túi kayaking rafting waterproof',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 40000,
        weeklyRate: 230000,
        monthlyRate: 650000,
        deposit: { amount: 250000 }
      }
    },
    {
      title: 'Balo Chống Nước Osprey Transporter 65L',
      description:
        'Osprey Transporter 65L balo chống nước dạng duffel/backpack 2-in-1. Vải TPU-coated 900D chống nước tốt. Overlapping rain flap. Harness và hip belt có thể cất đi. Side handles, end handles. Lockable zippers. Màu đen. Internal organization pockets. Đa năng cho du lịch, trekking. Mới 90%.',
      brand: { name: 'Osprey', model: 'Transporter 65' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
          alt: 'Balo Osprey Transporter 65L đen',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1622260614927-45b8f81023b4?w=800&q=80',
          alt: 'Balo chống nước 2-in-1 duffel',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?w=800&q=80',
          alt: 'Osprey waterproof backpack 65L',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 60000,
        weeklyRate: 350000,
        monthlyRate: 1000000,
        deposit: { amount: 400000 }
      }
    },
    {
      title: 'Túi Chống Nước Đa Năng NatureHike 60L Vàng',
      description:
        'NatureHike 60L túi khô chống nước với vải PVC 500D bền. Roll-top closure với buckle clip. Có quai đeo vai và tay xách. Màu vàng nổi bật dễ nhận diện. Kích thước 35x73cm. Nhẹ 580g. Thích hợp chèo thuyền, moto phượt, đi biển mưa. Giá cả phải chăng. Tình trạng tốt.',
      brand: { name: 'NatureHike', model: 'Dry Bag 60L' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800&q=80',
          alt: 'Túi khô NatureHike 60L vàng',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=800&q=80',
          alt: 'Túi chống nước PVC 60L',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1520338733455-d36f46c531f8?w=800&q=80',
          alt: 'Túi waterproof cho moto phượt',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 500000,
        deposit: { amount: 200000 }
      }
    },
    {
      title: 'Túi Chống Nước Nhỏ 5L Sea to Summit Ultra-Sil',
      description:
        'Sea to Summit Ultra-Sil 5L túi khô siêu nhẹ chỉ 25g. Vải siliconized Cordura 30D chống nước. Hypalon roll-top. Oval shape dễ đóng gói. Màu xanh lá. Kích thước 23x42cm. Thích hợp đựng quần áo, điện thoại, ví khi trekking. Có thể đựng trong balo. Mới 100% chưa qua sử dụng.',
      brand: { name: 'Sea to Summit', model: 'Ultra-Sil 5L' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1520338733455-d36f46c531f8?w=800&q=80',
          alt: 'Túi khô Ultra-Sil 5L xanh lá',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=800&q=80',
          alt: 'Túi chống nước siêu nhẹ 25g',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800&q=80',
          alt: 'Dry bag nhỏ 5L cho trekking',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 85000,
        monthlyRate: 250000,
        deposit: { amount: 100000 }
      }
    },
    {
      title: 'Balo Khô Chống Nước Hypergear 20L Roll Top',
      description:
        'Hypergear 20L balo khô với vải PVC 500D chống nước IP66. Roll-top closure 3 cuộn. Quai đeo vai padded thoải mái. Front zipper pocket chống nước. Reflective strip an toàn đêm. Màu đen/xám. Thích hợp đi làm mưa, cycling, gym, đi biển. Đã sử dụng 6 tháng, còn tốt.',
      brand: { name: 'Hypergear', model: 'Dry Pac 20L' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=800&q=80',
          alt: 'Balo khô Hypergear 20L đen xám',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800&q=80',
          alt: 'Balo chống nước roll-top IP66',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1520338733455-d36f46c531f8?w=800&q=80',
          alt: 'Dry pac 20L cho cycling gym',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 35000,
        weeklyRate: 200000,
        monthlyRate: 580000,
        deposit: { amount: 220000 }
      }
    },
    {
      title: 'Túi Chống Nước Loại Lớn 90L Với Quai Đeo',
      description:
        'Túi khô 90L siêu lớn vải PVC tarpaulin 600D cực bền. Roll-top với buckle khoá chắc chắn. 2 quai đeo vai rộng + tay xách. Đáy reinforced chống mài mòn. Màu cam. Kích thước 40x85cm. Chứa được nhiều đồ cho camping dài ngày, kayaking, rafting. Tình trạng tốt, đã vệ sinh.',
      brand: { name: 'Generic Pro', model: 'Dry Bag 90L' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800&q=80',
          alt: 'Túi khô 90L cam siêu lớn',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=800&q=80',
          alt: 'Túi chống nước 90L tarpaulin',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1520338733455-d36f46c531f8?w=800&q=80',
          alt: 'Dry bag lớn cho kayaking rafting',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 45000,
        weeklyRate: 260000,
        monthlyRate: 750000,
        deposit: { amount: 300000 }
      }
    }
  ],

  // BẾP & NHIÊN LIỆU
  'bep-nhien-lieu': [
    {
      title: 'Bếp Ga Mini Coleman F1 Ultralight',
      description:
        'Coleman F1 bếp ga siêu nhẹ chỉ 240g, công suất 3000W đủ nấu ăn cho 2-3 người. Van điều chỉnh lửa, chân đế ổn định. Chống gió tốt với thiết kế windshield. Đốt gas Coleman hoặc MSR. Màu xanh. Kèm túi đựng và hướng dẫn. Thích hợp backpacking, camping ngắn ngày.',
      brand: { name: 'Coleman', model: 'F1 Ultralight' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Coleman F1 stove cooking',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Camping stove setup',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Outdoor cooking equipment',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 150000,
        monthlyRate: 400000,
        deposit: { amount: 150000 }
      }
    },
    {
      title: 'Bếp Cồn Trang Trí MSR PocketRocket Deluxe',
      description:
        'MSR PocketRocket Deluxe bếp cồn siêu nhẹ 265g, công suất 10000W nấu sôi nước nhanh chóng. Đốt được nhiều loại nhiên liệu: gas, cồn, xăng. Van điều chỉnh chính xác. Chân đế titanium bền. Màu xanh. Kèm windshield và túi đựng. Thích hợp trekking đường dài.',
      brand: { name: 'MSR', model: 'PocketRocket Deluxe' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'MSR PocketRocket stove',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Backpacking stove',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Ultralight cooking gear',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 35000,
        weeklyRate: 200000,
        monthlyRate: 550000,
        deposit: { amount: 200000 }
      }
    },

    {
      title: 'Bếp Gas Du Lịch Snow Peak LiteMax',
      description:
        'Snow Peak LiteMax bếp gas cao cấp, công suất 3000W. Thiết kế titanium siêu nhẹ 190g. Chân đế ổn định, windshield tích hợp. Đốt gas Snow Peak hoặc Coleman. Màu đen. Kèm túi đựng da. Thích hợp backpacking, camping sang trọng.',
      brand: { name: 'Snow Peak', model: 'LiteMax Stove' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcSyRPDBC_jUMvYES0FCWDew1dGpGnEKL8-btT4cpVa6ANROKrKM9n-PCoiDE616OIsHJQUFZoer5gCvpnJ_gNNhVjFSZL-EiF4dc8mdbd8YkHFBhhJuaQAZOclff_PrJc-h-0_--J7x7mM&usqp=CAc',
          alt: 'Snow Peak LiteMax stove',
          isMain: true
        },
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcSyRPDBC_jUMvYES0FCWDew1dGpGnEKL8-btT4cpVa6ANROKrKM9n-PCoiDE616OIsHJQUFZoer5gCvpnJ_gNNhVjFSZL-EiF4dc8mdbd8YkHFBhhJuaQAZOclff_PrJc-h-0_--J7x7mM&usqp=CAc',
          alt: 'Premium camping stove',
          isMain: false
        },
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcSyRPDBC_jUMvYES0FCWDew1dGpGnEKL8-btT4cpVa6ANROKrKM9n-PCoiDE616OIsHJQUFZoer5gCvpnJ_gNNhVjFSZL-EiF4dc8mdbd8YkHFBhhJuaQAZOclff_PrJc-h-0_--J7x7mM&usqp=CAc',
          alt: 'Titanium cooking equipment',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 45000,
        weeklyRate: 260000,
        monthlyRate: 700000,
        deposit: { amount: 300000 }
      }
    },
    {
      title: 'Bếp Cồn Esbit Trang Trí',
      description:
        'Bếp cồn Esbit trang trí, đốt được viên nén cồn. Công suất nhỏ nhưng đủ hâm đồ ăn, pha trà. Siêu nhẹ 85g, gấp gọn. Chân đế ổn định. Màu xanh. Kèm 2 viên nén cồn. Thích hợp trekking nhẹ, picnic. Giá rẻ, tiện dụng.',
      brand: { name: 'Trang Trí', model: 'Esbit Alcohol Stove' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcTr32jwjRynh-J9OeIeTB0L5C2zeH36W01Y5ON5e38J6BbZJXeGwiuHAjsCuZJgIInTb-BgeATdeJEFuCuOYDVul3W6mGcWfQjynU6DGNwW&usqp=CAc',
          alt: 'Esbit alcohol stove',
          isMain: true
        },
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcTr32jwjRynh-J9OeIeTB0L5C2zeH36W01Y5ON5e38J6BbZJXeGwiuHAjsCuZJgIInTb-BgeATdeJEFuCuOYDVul3W6mGcWfQjynU6DGNwW&usqp=CAc',
          alt: 'Ultralight alcohol stove',
          isMain: false
        },
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcTr32jwjRynh-J9OeIeTB0L5C2zeH36W01Y5ON5e38J6BbZJXeGwiuHAjsCuZJgIInTb-BgeATdeJEFuCuOYDVul3W6mGcWfQjynU6DGNwW&usqp=CAc',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 100000 }
      }
    }
  ],

  // ĐÈN ĐỘI ĐẦU
  'den-doi-dau': [
    {
      title: 'Đèn Đội Đầu Petzl Actik Core',
      description:
        'Petzl Actik Core đèn đội đầu siêu sáng 450 lumen, 3 chế độ ánh sáng. Công nghệ Reactive Lighting tự động điều chỉnh. Pin Lithium-ion sạc lại được. Thời gian sử dụng 12 giờ ở chế độ tiết kiệm. Trọng lượng 82g. Màu đen. Kèm dây đeo đầu và cáp sạc. Thích hợp trekking đêm.',
      brand: { name: 'Petzl', model: 'Actik Core' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Petzl Actik headlamp',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Night hiking headlamp',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Rechargeable headlight',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 450000,
        deposit: { amount: 180000 }
      }
    },
    {
      title: 'Đèn Đội Đầu Black Diamond Spot 400',
      description:
        'Black Diamond Spot 400 đèn đội đầu 400 lumen, 3 chế độ ánh sáng. Công nghệ PowerTap tăng sáng khẩn cấp. Pin 3xAAA (không kèm). Thời gian sử dụng 200 giờ ở chế độ thấp. Trọng lượng 92g. Màu xanh. Kèm dây đeo và hướng dẫn. Thích hợp camping, trekking.',
      brand: { name: 'Black Diamond', model: 'Spot 400' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcT8MVqayv7ziRaE70vBM0D_GKlzfn9XtZ0Nby_5J3oYeS8ZYkZcZdOQWxAmiNhQQz5pOKqJiRl_pRE1xiDIXVCwgJ4gU14-UL4lMIAm6c6Y9KpUbF5ZlKjja5ySvvm6w3fmEisacp0hl5k&usqp=CAc',
          alt: 'Black Diamond headlamp',
          isMain: true
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 150000 }
      }
    },
    {
      title: 'Đèn Đội Đầu LED Lenser MH10',
      description:
        'LED Lenser MH10 đèn đội đầu 1000 lumen cực sáng, 5 chế độ ánh sáng. Công nghệ Advanced Focus System. Pin Lithium sạc lại được. Thời gian sử dụng 40 giờ. Chống nước IPX6. Trọng lượng 126g. Màu đen. Kèm dây đeo và cáp sạc. Thích hợp công việc ngoài trời.',
      brand: { name: 'LED Lenser', model: 'MH10' },
      images: [
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcSb-y-ZalDKfQn3ijhdqI64-NSpMEN5oH6fR0FtUytSLnNWmTS3tLwf7BwA4YzucAIindPWuW9oLIhe4SCpluh3aiXDG66b-EW8Sp326t9QYvhGUruH_tH-OQLIj4tRRlpHXl6mhq8&usqp=CAc',
          alt: 'LED Lenser headlamp',
          isMain: true
        }
      ],
      pricing: {
        dailyRate: 35000,
        weeklyRate: 200000,
        monthlyRate: 550000,
        deposit: { amount: 220000 }
      }
    },
    {
      title: 'Đèn Đội Đầu Ultralight 200 Lumen',
      description:
        'Đèn đội đầu siêu nhẹ chỉ 45g, 200 lumen đủ sáng. 3 chế độ ánh sáng. Pin CR123A (không kèm). Thời gian sử dụng 100 giờ. Chống nước nhẹ. Màu đỏ. Kèm dây đeo. Thích hợp chạy bộ đêm, dã ngoại nhẹ. Giá rẻ, tiện lợi.',
      brand: { name: 'Generic', model: 'Ultralight Headlamp 200L' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcTLRTptAMug9AOzCPRYFuaTeXcaUSPUIbdBYvCAuY0vZmpI1DsYp2e5Wy-i8vYzx_tp7gJ2n1kZmV1P_ofJhxxNLeUOGxF9OcrFErevHS7Q6GbPwcv8zzvT6exoEUhB2rxmt5UUmAYbSw&usqp=CAc',
          alt: 'Ultralight headlamp',
          isMain: true
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 80000 }
      }
    },
    {
      title: 'Đèn Đội Đầu Petzl Tikka R+',
      description:
        'Petzl Tikka R+ đèn đội đầu 205 lumen, 4 chế độ ánh sáng. Công nghệ red light bảo tồn tầm nhìn đêm. Pin 3xAAA (không kèm). Thời gian sử dụng 160 giờ. Trọng lượng 82g. Màu xanh. Kèm dây đeo. Thích hợp trekking, camping.',
      brand: { name: 'Petzl', model: 'Tikka R+' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcTLRTptAMug9AOzCPRYFuaTeXcaUSPUIbdBYvCAuY0vZmpI1DsYp2e5Wy-i8vYzx_tp7gJ2n1kZmV1P_ofJhxxNLeUOGxF9OcrFErevHS7Q6GbPwcv8zzvT6exoEUhB2rxmt5UUmAYbSw&usqp=CAc',
          alt: 'Petzl Tikka headlamp',
          isMain: true
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 150000 }
      }
    },
    {
      title: 'Đèn Đội Đầu Rechargeable 500 Lumen',
      description:
        'Đèn đội đầu sạc lại được 500 lumen, 5 chế độ ánh sáng. Pin Lithium 2000mAh. Thời gian sử dụng 8 giờ ở chế độ cao. Chống nước IPX5. Trọng lượng 120g. Màu đen. Kèm cáp sạc USB. Thích hợp công việc, trekking.',
      brand: { name: 'Generic Pro', model: 'Rechargeable Headlamp 500L' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Rechargeable headlamp',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'USB rechargeable headlight',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Cordless headlamp',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 120000 }
      }
    }
  ],

  // BỘ SƠ CỨU
  'bo-so-cuu': [
    {
      title: 'Bộ Sơ Cứu Trang Trí 50 Chi Tiết',
      description:
        'Bộ sơ cứu Trang Trí 50 chi tiết đầy đủ, gồm băng cá nhân, băng dán, thuốc sát trùng, gạc, băng ép, kéo, kẹp, găng tay y tế. Túi đựng nylon bền, có khoá zip. Kích thước 18x12x6cm. Trọng lượng 280g. Màu đỏ. Thích hợp dã ngoại, du lịch. Đầy đủ, chất lượng tốt.',
      brand: { name: 'Trang Trí', model: 'First Aid Kit 50pcs' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Trang Trí first aid kit',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Camping first aid supplies',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Emergency medical kit',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 100000 }
      }
    },
    {
      title: 'Túi Y Tế Dã Ngoại Adventure Medical Kits',
      description:
        'Adventure Medical Kits Mountain Series túi y tế chuyên nghiệp cho trekking. Gồm 200+ items: bandages, medications, instruments. Hướng dẫn sơ cứu chi tiết. Túi Cordura bền, chống nước. Trọng lượng 340g. Màu xanh. Thích hợp trekking đường dài, leo núi.',
      brand: { name: 'Adventure Medical Kits', model: 'Mountain Series' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcQxWEXAW3tSDzB8qrbPeK99cqNL9Cs3HMnVuCES1btwzcEMLHoigopeSTdcRpGdYsePtLuHOypKfxcg3Ar-fO21KJPsuFVKQrAeHmTjmIbKQX_MlTNzh_aeWi4Oiu-uoqH22Nw58FRDtw&usqp=CAc',
          alt: 'Adventure Medical first aid kit',
          isMain: true
        }
      ],
      pricing: {
        dailyRate: 35000,
        weeklyRate: 200000,
        monthlyRate: 550000,
        deposit: { amount: 200000 }
      }
    },
    {
      title: 'Bộ Sơ Cứu Nhỏ Gọn 20 Chi Tiết',
      description:
        'Bộ sơ cứu nhỏ gọn 20 chi tiết cơ bản: băng dán, thuốc đỏ, gạc vô trùng, băng cá nhân, kéo nhỏ. Túi đựng vải dù bền. Kích thước 12x8x4cm. Trọng lượng 120g. Màu xanh. Thích hợp đi chơi ngày, picnic. Đủ dùng cho các vết thương nhỏ.',
      brand: { name: 'Generic', model: 'Compact First Aid Kit 20pcs' },
      images: [
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcRFjVu6WW84xDaV47OCwmmyiogK-fGxn58L0T3aPSfZm6LfqnKtigue-uqpNFt8yoMsxiQpDNLwh1dJxnhd5KFM5B_6mLyHllv50sp0ZVe6&usqp=CAc',
          alt: 'Compact first aid kit',
          isMain: true
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 70000 }
      }
    },
    {
      title: 'Bộ Sơ Cứu Gia Đình 100 Chi Tiết',
      description:
        'Bộ sơ cứu gia đình lớn 100 chi tiết, gồm đầy đủ thuốc men, dụng cụ: paracetamol, băng dán lớn, nạng tay, mặt nạ oxy. Hộp nhựa ABS bền, có khoá. Kích thước 25x15x10cm. Trọng lượng 800g. Màu trắng. Thích hợp nhà ở, dã ngoại gia đình.',
      brand: { name: 'Generic Pro', model: 'Family First Aid Kit 100pcs' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcRuachJDCtTntvqGZt8YlRVA_YCdLc0SOku8Q3FZ6Yy8H2CiyOTi3XxCudMiv7CWpgS0Oxds5XoYS9GfEjijFkpnDkK3gLmb6Pi5kHVxFt4paPIDybFEMByMJSXECapYW_AvA2hBEbHUIc&usqp=CAc',
          alt: 'Family first aid kit',
          isMain: true
        },
        {
          url: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcQxWEXAW3tSDzB8qrbPeK99cqNL9Cs3HMnVuCES1btwzcEMLHoigopeSTdcRpGdYsePtLuHOypKfxcg3Ar-fO21KJPsuFVKQrAeHmTjmIbKQX_MlTNzh_aeWi4Oiu-uoqH22Nw58FRDtw&usqp=CAc',
          alt: 'Comprehensive medical kit',
          isMain: false
        },
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcSyRPDBC_jUMvYES0FCWDew1dGpGnEKL8-btT4cpVa6ANROKrKM9n-PCoiDE616OIsHJQUFZoer5gCvpnJ_gNNhVjFSZL-EiF4dc8mdbd8YkHFBhhJuaQAZOclff_PrJc-h-0_--J7x7mM&usqp=CAc',
          alt: 'Home emergency supplies',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 450000,
        deposit: { amount: 150000 }
      }
    },
    {
      title: 'Túi Sơ Cứu Chống Nước Outdoor Research',
      description:
        'Outdoor Research First Aid Pouch túi sơ cứu chống nước hoàn toàn. Gồm 50+ items thiết yếu. Vải nylon ripstop bền. Có dây đeo vào balo. Kích thước 15x10x5cm. Trọng lượng 200g. Màu cam nổi bật. Thích hợp trekking, cứu hộ.',
      brand: { name: 'Outdoor Research', model: 'First Aid Pouch' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcRNeafg4wyu_cyjqpmiotg7xdzLVUBwh8NcaadFIEADU5niHn4iYPpxcNy8xThIPtHBGkLuUS4uTTdjVu5XwxclG8yc7t1matO-YOp8Q1x8n55O41o_nY0-IIWJM4DKOX_y7Sih6w&usqp=CAc',
          alt: 'Outdoor Research first aid pouch',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Waterproof medical pouch',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Backpack medical kit',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 130000 }
      }
    },
    {
      title: 'Bộ Sơ Cứu Du Lịch Trang Trí 30 Chi Tiết',
      description:
        'Bộ sơ cứu du lịch Trang Trí 30 chi tiết, gồm băng dán, thuốc đau, sát trùng, gạc. Túi nylon có khoá zip và dây đeo. Kích thước 15x10x5cm. Trọng lượng 180g. Màu đỏ. Thích hợp du lịch, dã ngoại. Chất lượng Việt Nam, giá hợp lý.',
      brand: { name: 'Trang Trí', model: 'Travel First Aid Kit 30pcs' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcRNeafg4wyu_cyjqpmiotg7xdzLVUBwh8NcaadFIEADU5niHn4iYPpxcNy8xThIPtHBGkLuUS4uTTdjVu5XwxclG8yc7t1matO-YOp8Q1x8n55O41o_nY0-IIWJM4DKOX_y7Sih6w&usqp=CAc',
          alt: 'Travel first aid kit',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Compact travel medical kit',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Portable emergency kit',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 18000,
        weeklyRate: 100000,
        monthlyRate: 270000,
        deposit: { amount: 90000 }
      }
    }
  ],

  // DAO ĐA NANG & DUNG CU SINH TON
  'dao-da-nang-sinh-ton': [
    {
      title: 'Dao Đa Năng Leatherman Wave+',
      description:
        'Leatherman Wave+ dao đa năng 18 công cụ: dao, kéo, cờ lê, tua vít, mở hộp, mở chai, kìm. Khung thép 420HC bền. Mở một tay thuận tiện. Có sheath đựng. Trọng lượng 241g. Màu đen. Thích hợp outdoor, survival. Đã sử dụng nhẹ, còn tốt.',
      brand: { name: 'Leatherman', model: 'Wave+' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Leatherman Wave multi-tool',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Survival multi-tool',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Outdoor multi-tool',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 40000,
        weeklyRate: 230000,
        monthlyRate: 650000,
        deposit: { amount: 250000 }
      }
    },
    {
      title: 'Dao Sinh Tồn Trang Trí 7 in 1',
      description:
        'Dao sinh tồn Trang Trí 7 in 1: dao, kéo, cờ lê, tua vít, mở hộp, mở chai, đá lửa. Lưỡi dao thép carbon bền. Tay cầm gỗ thoải mái. Có bao đựng. Trọng lượng 180g. Màu gỗ. Thích hợp dã ngoại, camping. Chất lượng Việt Nam, giá rẻ.',
      brand: { name: 'Trang Trí', model: 'Survival Knife 7-in-1' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Trang Trí survival knife',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Multi-function survival tool',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Camping survival knife',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 100000 }
      }
    },
    {
      title: 'Bật Lửa Sinh Tồn Trang Trí',
      description:
        'Bật lửa sinh tồn Trang Trí đa năng: bật lửa, đá lửa, la bàn, còi cứu hộ, đèn LED, gương tín hiệu. Vỏ nhôm bền. Chống nước. Trọng lượng 120g. Màu đen. Thích hợp trekking, survival. Đầy đủ công cụ thiết yếu. Chất lượng tốt.',
      brand: { name: 'Trang Trí', model: 'Survival Lighter Multi-tool' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Survival lighter multi-tool',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Emergency survival tool',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Multi-purpose survival device',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 70000 }
      }
    },
    {
      title: 'Dao Đa Năng Victorinox Swiss Army Tinker',
      description:
        'Victorinox Swiss Army Tinker dao đa năng 12 công cụ: dao lớn, dao nhỏ, kéo, cờ lê, tua vít, mở hộp, mở chai. Khung thép không gỉ. Mở bằng 2 tay an toàn. Có sheath. Trọng lượng 95g. Màu đỏ. Thích hợp outdoor, EDC. Chất lượng Thụy Sĩ.',
      brand: { name: 'Victorinox', model: 'Swiss Army Tinker' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Victorinox Swiss Army knife',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Swiss Army multi-tool',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Classic multi-tool',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 450000,
        deposit: { amount: 180000 }
      }
    },
    {
      title: 'Còi Cứu Hộ 3 Tần Số Trang Trí',
      description:
        'Còi cứu hộ Trang Trí 3 tần số: 2000Hz, 3000Hz, 4000Hz. Âm thanh cực lớn 120dB. Chống nước hoàn toàn. Có dây đeo. Trọng lượng 25g. Màu cam nổi bật. Thích hợp trekking, biển. Phát âm xa 1km. Chất lượng Việt Nam.',
      brand: { name: 'Trang Trí', model: 'Emergency Whistle 3-tone' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Emergency whistle',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Survival whistle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Loud emergency signal',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 8000,
        weeklyRate: 40000,
        monthlyRate: 110000,
        deposit: { amount: 30000 }
      }
    },
    {
      title: 'Dao Sinh Tồn Trang Trí Có Đá Lửa',
      description:
        'Dao sinh tồn Trang Trí có đá lửa tích hợp, lưỡi dao thép carbon 7cm. Tay cầm gỗ + cao su chống trượt. Có bao da. Trọng lượng 150g. Màu đen. Thích hợp camping, survival. Đầy đủ công cụ sinh tồn cơ bản.',
      brand: { name: 'Trang Trí', model: 'Survival Knife with Fire Starter' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Survival knife with fire starter',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Fire starting survival tool',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Complete survival knife',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 130000 }
      }
    }
  ],

  // MAY ANH & GOPRO
  'may-anh-gopro': [
    {
      title: 'GoPro Hero 7 Silver',
      description:
        'GoPro Hero 7 Silver quay 4K30, chụp 10MP. Chống nước 10m, chống sốc. Màn hình cảm ứng 2". Kết nối WiFi/Bluetooth. Quay time-lapse, slow motion. Pin 1220mAh. Kèm housing, mount. Màu đen. Thích hợp thể thao mạo hiểm, du lịch.',
      brand: { name: 'GoPro', model: 'Hero 7 Silver' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'GoPro Hero 7 Silver',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Action camera setup',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Waterproof action camera',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 80000,
        weeklyRate: 450000,
        monthlyRate: 1200000,
        deposit: { amount: 500000 }
      }
    },
    {
      title: 'Máy Ảnh Du Lịch Canon PowerShot G7 X Mark II',
      description:
        'Canon PowerShot G7 X Mark II máy ảnh compact 20.1MP, zoom 4.2x 24-100mm. Quay 4K, màn hình lật 180°. WiFi/NFC. Pin NB-13L. Kích thước nhỏ gọn. Màu đen. Thích hợp du lịch, vlogging. Đã sử dụng nhẹ, còn bảo hành.',
      brand: { name: 'Canon', model: 'PowerShot G7 X Mark II' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcT19ewnIFAqgF5xoIjG152ErD4MwUIKCUyWbvDJJv5XXjkCh8rf2d_kRU2OitClFqSncPLG0h5XB8tbtInjv3a1q0jRIH8PtvcF1WAhE18ZcnAgC9NN_vOC6bRKzizkJJd4L4SLZw&usqp=CAc',
          alt: 'Canon PowerShot camera',
          isMain: true
        }
      ],
      pricing: {
        dailyRate: 60000,
        weeklyRate: 350000,
        monthlyRate: 950000,
        deposit: { amount: 400000 }
      }
    },
    {
      title: 'GoPro Hero 8 Black',
      description:
        'GoPro Hero 8 Black quay 4K60, HyperSmooth 3.0 chống rung. Chụp 12MP, màn hình trước/sau. Chống nước 10m. Kết nối WiFi/Bluetooth. Quay 360°, time warp. Pin 1220mAh. Kèm housing, mount đa dạng. Màu đen. Flagship action camera.',
      brand: { name: 'GoPro', model: 'Hero 8 Black' },
      images: [
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQ6xuDivOOho5Wy_e9mNV8Yj5dxiCER_ad-wJJxSGPjuG1vOmilTcuwOUpwiWAcJG2rppx_xJD40ouFSivPPTeW5Fj7QNrytHKbHAiWdIU9zLb3QH0OJOWUHgXr3FGoWD_Cw-vRy6E&usqp=CAc',
          alt: 'GoPro Hero 8 Black',
          isMain: true
        },
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcSd4jplrz_aNHd_JeiJnzyd1-uIA9rqudovUgrNfR4HHAJjQOnBmwoUtTRgKseA_ZxOFhXoSi81YxYxAzFlGo5V9NQNuHZSRyoIdCNtepdOfet4PJPS23f3uOpAUw&usqp=CAc',
          alt: 'Professional action camera',
          isMain: false
        },
        {
          url: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcRO4VJoN5htZ6UQEOY-y3JtQ2lu_xNOT36VSZrqUE7C2rjv6DWJtob9QcA9MP4NhCBSsctc-kLZPKc9PfTn-XdDhumzvO1IW4gLFCtIXQdsKxhVXCrIJzRq&usqp=CAc',
          alt: '4K60 action camera',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 100000,
        weeklyRate: 580000,
        monthlyRate: 1650000,
        deposit: { amount: 600000 }
      }
    },
    {
      title: 'Máy Ảnh Chống Nước Olympus Tough TG-6',
      description:
        'Olympus Tough TG-6 máy ảnh chống nước 15m, chống sốc 2.1m, chống bụi, chống lạnh -10°C. 12MP, zoom 4x 25-100mm. Quay 4K. Màn hình 3". WiFi. Pin LI-92B. Màu đen. Thích hợp thể thao mạo hiểm, lặn.',
      brand: { name: 'Olympus', model: 'Tough TG-6' },
      images: [
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQ2PTnd-HYpU0xrujmfrcGd82oohrViK3qqXfdQ2RRYAlD-Lpfc5PY6pyYP0l1WSlBerH8z-Va8U8Yw5YNVMA2nBrwRquEVVGc2egs9RnmU3DffmXyvgE5xAQRh6aYO0Q&usqp=CAc',
          alt: 'Olympus Tough camera',
          isMain: true
        },
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQ2PTnd-HYpU0xrujmfrcGd82oohrViK3qqXfdQ2RRYAlD-Lpfc5PY6pyYP0l1WSlBerH8z-Va8U8Yw5YNVMA2nBrwRquEVVGc2egs9RnmU3DffmXyvgE5xAQRh6aYO0Q&usqp=CAc',
          alt: 'Rugged waterproof camera',
          isMain: false
        },
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQ2PTnd-HYpU0xrujmfrcGd82oohrViK3qqXfdQ2RRYAlD-Lpfc5PY6pyYP0l1WSlBerH8z-Va8U8Yw5YNVMA2nBrwRquEVVGc2egs9RnmU3DffmXyvgE5xAQRh6aYO0Q&usqp=CAc',
          alt: 'Shockproof adventure camera',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 70000,
        weeklyRate: 400000,
        monthlyRate: 1100000,
        deposit: { amount: 450000 }
      }
    },
    {
      title: 'GoPro Hero 6 Silver',
      description:
        'GoPro Hero 6 Silver quay 4K30, chụp 10MP. Chống nước 10m. Màn hình cảm ứng. Kết nối WiFi/Bluetooth. Quay slow motion 1080p. Pin 1220mAh. Kèm housing, quick release. Màu bạc. Thích hợp thể thao, du lịch.',
      brand: { name: 'GoPro', model: 'Hero 6 Silver' },
      images: [
        {
          url: 'https://s.yimg.com/ny/api/res/1.2/AyklhFjf2oCNCtRHMm1DvQ--/YXBwaWQ9aGlnaGxhbmRlcjt3PTk2MDtoPTU0MA--/https://o.aolcdn.com/images/dar/5845cadfecd996e0372f/cf07b5f88e5f4ea02a76d8d2d564fc3eee71d137/aHR0cDovL28uYW9sY2RuLmNvbS9oc3Mvc3RvcmFnZS9taWRhcy82ZGNlOWZiMzJkOWUxNTA2YmIwNzZkY2ZjNDdjM2E3OS8yMDU3Nzk5MzQvSGVybzZMYXVuY2hfMTgwMCsyLmpwZw==',
          alt: 'GoPro Hero 6 Silver',
          isMain: true
        },
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQ6xuDivOOho5Wy_e9mNV8Yj5dxiCER_ad-wJJxSGPjuG1vOmilTcuwOUpwiWAcJG2rppx_xJD40ouFSivPPTeW5Fj7QNrytHKbHAiWdIU9zLb3QH0OJOWUHgXr3FGoWD_Cw-vRy6E&usqp=CAc',
          alt: 'Affordable action camera',
          isMain: false
        },
        {
          url: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcRO4VJoN5htZ6UQEOY-y3JtQ2lu_xNOT36VSZrqUE7C2rjv6DWJtob9QcA9MP4NhCBSsctc-kLZPKc9PfTn-XdDhumzvO1IW4gLFCtIXQdsKxhVXCrIJzRq&usqp=CAc',
          alt: '4K action camera',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 60000,
        weeklyRate: 350000,
        monthlyRate: 950000,
        deposit: { amount: 400000 }
      }
    },
    {
      title: 'Máy Ảnh Du Lịch Sony RX100 VI',
      description:
        'Sony RX100 VI máy ảnh compact 20.1MP, zoom 24-200mm. Quay 4K, màn hình lật. Fast Hybrid AF. WiFi/NFC/Bluetooth. Pin NP-BX1. Kích thước nhỏ gọn. Màu đen. Thích hợp du lịch, street photography.',
      brand: { name: 'Sony', model: 'RX100 VI' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcTE4jkfFkAct9fWFtU-m-T3jBgMKT5Df5njKq9tDhjP0F8QaI8NEAG2KU_UUP8_jO5SSWZnfKt1irwDlndALyCzcVj1CrkjA5A8O_6E9zo&usqp=CAc',
          alt: 'Sony RX100 camera',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Premium compact camera',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: '4K compact camera',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 80000,
        weeklyRate: 450000,
        monthlyRate: 1200000,
        deposit: { amount: 500000 }
      }
    }
  ],

  // FLYCAM & DRONE
  'flycam-drone': [
    {
      title: 'Drone DJI Mini 2',
      description:
        'DJI Mini 2 drone siêu nhẹ 249g, bay 31 phút. Quay 4K30, Hyperlapse. Chụp 12MP. Trả về nhà thông minh. Chống gió level 5. Kèm remote controller, pin. Màu xanh. Thích hợp chụp ảnh, quay phim du lịch.',
      brand: { name: 'DJI', model: 'Mini 2' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcT74GqhV5YfBrZrYiHoPLLB4vHq99K5LdmWthjxjzO-DwSOSkVN3tq9cBdS61LqE4B4GIi-70flAua_iE82lndGqCOWF-HsSxCW9XvnMS7AsMGtnh6uWZWg3Heg9SHlqo3YfKU1vu28hg&usqp=CAc',
          alt: 'DJI Mini 2 drone',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Lightweight drone',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: '4K aerial drone',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 150000,
        weeklyRate: 850000,
        monthlyRate: 2400000,
        deposit: { amount: 1000000 }
      }
    },
    {
      title: 'Flycam DJI Osmo Action',
      description:
        'DJI Osmo Action flycam quay 4K60, HyperSmooth chống rung. Chụp 12MP. Chống nước 11m. Màn hình trước/sau. Mount đa dạng. Pin 1300mAh. Kèm housing, mount. Màu đen. Thích hợp thể thao mạo hiểm.',
      brand: { name: 'DJI', model: 'Osmo Action' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcRDyOofkG_9hSAj0rGLA-LRYl6M24baegPU3OT_X1989b9SKIr3NXLo5InyoSFI0G9ApYEGjWTOzzOmjAg6jYZc7wmP5YqjNVfNo8zXfY46BHZCwHMXTjwZnLhw6b8Je2fsxkpdwwCleI4&usqp=CAc',
          alt: 'DJI Osmo Action camera',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Action flycam',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Waterproof action camera',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 80000,
        weeklyRate: 450000,
        monthlyRate: 1200000,
        deposit: { amount: 500000 }
      }
    },
    {
      title: 'Drone DJI Mavic Air 2',
      description:
        'DJI Mavic Air 2 drone bay 34 phút, tầm xa 10km. Quay 4K60, 48MP. Chụp panorama 180°. Chống gió level 5. Trả về nhà. Kèm remote, 3 pin. Màu trắng. Drone phổ biến cho du lịch.',
      brand: { name: 'DJI', model: 'Mavic Air 2' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQq7UAMlqtavkafsYZhIOlj3wJe8WHj-2fpwQ&s',
          alt: 'DJI Mavic Air 2 drone',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Foldable drone',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: '4K travel drone',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 200000,
        weeklyRate: 1150000,
        monthlyRate: 3300000,
        deposit: { amount: 1500000 }
      }
    },
    {
      title: 'Flycam Insta360 GO 3',
      description:
        'Insta360 GO 3 flycam siêu nhỏ, quay 1440p. Chống nước 5m. Dán mọi bề mặt. Điều khiển bằng app. Pin 310mAh. Kèm mount đa dạng. Màu trắng. Thích hợp vlogging, thể thao.',
      brand: { name: 'Insta360', model: 'GO 3' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRxpyon7pH7FdZ8G6YOAQvtLfJRDnsfYZvzAw&s',
          alt: 'Insta360 GO 3 camera',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Mini action camera',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Wearable action camera',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 60000,
        weeklyRate: 350000,
        monthlyRate: 950000,
        deposit: { amount: 400000 }
      }
    },
    {
      title: 'Drone Parrot Anafi',
      description:
        'Parrot Anafi drone bay 25 phút, quay 4K. Chụp 21MP. Zoom 32x lossless. Chống gió tốt. Trả về nhà. Kèm Skycontroller 3, pin. Màu trắng. Drone cao cấp cho nhiếp ảnh.',
      brand: { name: 'Parrot', model: 'Anafi' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ-txwkg7__Raq6teheXc2TXeSLXp9EN9MY-Q&s',
          alt: 'Parrot Anafi drone',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Professional drone',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: '4K zoom drone',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 250000,
        weeklyRate: 1450000,
        monthlyRate: 4200000,
        deposit: { amount: 1800000 }
      }
    },
    {
      title: 'Flycam GoPro MAX',
      description:
        'GoPro MAX flycam quay 360°, 5.6K. Chụp 360° 16.6MP. Chống nước 5m. Quay time-lapse 360°. Pin 1600mAh. Kèm mount. Màu đen. Thích hợp VR content, thể thao.',
      brand: { name: 'GoPro', model: 'MAX' },
      images: [
        {
          url: 'https://www.phukiengopro.com/image/data/may-bay-gopro-karma-vietnam/may-bay-gopro-karma-phu-kien-gopro.jpg',
          alt: 'GoPro MAX 360 camera',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: '360 degree action camera',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'VR action camera',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 90000,
        weeklyRate: 520000,
        monthlyRate: 1500000,
        deposit: { amount: 600000 }
      }
    }
  ],

  // BINH NUOC & BINH GIU NHIET
  'binh-nuoc-giu-nhiet': [
    {
      title: 'Bình Nước Thể Thao Trang Trí 1L',
      description:
        'Bình nước thể thao Trang Trí 1L, vòi uống tiện lợi. Chống rò rỉ hoàn toàn. Tay cầm thoải mái. Màu xanh. Thích hợp mang theo khi tập gym, du lịch. Chất lượng Việt Nam, giá rẻ.',
      brand: { name: 'Trang Trí', model: 'Sports Water Bottle 1L' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcRdGPlPWor0JlDUttymq1jwVz9l2iV-R2gKQxWeQqJ42nOwvMgrjOEa7kHcbXS-LnpFH8a9vbNqILI0AbS-sXZ2YfkHqQ5nil932DZ5T4WG1n0mwrJTocCxX_E&usqp=CAc',
          alt: 'Trang Trí sports water bottle',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Leak-proof water bottle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Convenient drinking bottle',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 10000,
        weeklyRate: 55000,
        monthlyRate: 150000,
        deposit: { amount: 40000 }
      }
    },
    {
      title: 'Bình Giữ Nhiệt Thermos 1L',
      description:
        'Thermos bình giữ nhiệt 1L, giữ nóng 12 giờ, giữ lạnh 24 giờ. Vỏ inox 304 bền. Nắp xoáy kín. Tay cầm. Màu xanh. Thích hợp mang trà, cà phê đi làm. Đã sử dụng 6 tháng, còn tốt.',
      brand: { name: 'Thermos', model: 'Insulated Bottle 1L' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcQqfHAADFi9TwNs_fmZPgfsO8syQDpeLBeQhbtZBtV3JUYel74QhRiDyIECeWV8pUY5h__WonaiNPLxN_g8gAaZtIEjgpY4p8qF4kFKgpph9Si-gWnC5H9iPPg9UjGt5HA3UmowLGLSzFo&usqp=CAc',
          alt: 'Thermos insulated bottle',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Thermal water bottle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Hot cold bottle',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 80000 }
      }
    },
    {
      title: 'Bình Nước Hydro Flask 18oz',
      description:
        'Hydro Flask bình nước giữ nhiệt 532ml, giữ nóng 12h, giữ lạnh 24h. Vỏ thép không gỉ. Nắp xoáy. Tay đeo. Màu trắng. Thích hợp outdoor, gym. Đã dùng 3 tháng, vệ sinh sạch.',
      brand: { name: 'Hydro Flask', model: 'Standard Mouth 18oz' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHCkezPC8JUbUeGllPkLcTUL6m68nQlU2eCQ&s',
          alt: 'Hydro Flask water bottle',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Premium insulated bottle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Stainless steel water bottle',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 100000 }
      }
    },
    {
      title: 'Bình Nước Trang Trí 500ml Có Vòi',
      description:
        'Bình nước Trang Trí 500ml, vòi uống tiện lợi. Chống rò rỉ. Tay cầm. Màu đỏ. Thích hợp tập gym, mang theo. Nhỏ gọn, tiện dụng. Chất lượng tốt, giá hợp lý.',
      brand: { name: 'Trang Trí', model: 'Water Bottle 500ml' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQw82WaSuCpKMslKUuO904FWKC25nJca4p0oQ&s',
          alt: 'Trang Trí water bottle',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Compact water bottle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Portable drinking bottle',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 8000,
        weeklyRate: 40000,
        monthlyRate: 110000,
        deposit: { amount: 25000 }
      }
    },
    {
      title: 'Bình Giữ Nhiệt Lock&Lock 1.8L',
      description:
        'Lock&Lock bình giữ nhiệt 1.8L lớn, giữ nóng 8 giờ. Vỏ nhựa cao cấp. Nắp xoáy. Tay cầm. Màu xanh. Thích hợp gia đình, văn phòng. Dung tích lớn, tiện lợi.',
      brand: { name: 'Lock&Lock', model: 'Thermal Bottle 1.8L' },
      images: [
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcSFDxJzGlYy42eOTjJ8gI0RHvcVWV3dEhVrLSHvRHfse_wLimjhaUqHagLtybqXG0iO-GeI_YACXcnJZHMeE_hhxxHbCLequrTg0LaZDPzPcCQF6QDTMbQH6VCSvOExnYNPOPw&usqp=CAc',
          alt: 'Lock&Lock thermal bottle',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Large capacity bottle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Family thermal bottle',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 60000 }
      }
    },
    {
      title: 'Bình Nước Thể Thao 2L Trang Trí',
      description:
        'Bình nước thể thao Trang Trí 2L lớn, vòi uống tiện. Chống rò rỉ tốt. Quai đeo vai. Màu đen. Thích hợp mang nước cho nhóm, dã ngoại. Dung tích lớn, tiện lợi.',
      brand: { name: 'Trang Trí', model: 'Sports Bottle 2L' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcQJF8iHWCyoOp1tPJqI2bmwIo7QbQBzESoApUSha3IowNIHJ1ib_azA_t9sT7Txnm-v7pm7mC0oxSF3C4LYHvZGVQn3STvojP2ESIIJoV5xof-V72XxtOAqPqhDsX2fD0bKqA0lJQo&usqp=CAc',
          alt: 'Trang Trí large water bottle',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: '2L sports bottle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Group water bottle',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 12000,
        weeklyRate: 65000,
        monthlyRate: 180000,
        deposit: { amount: 50000 }
      }
    }
  ],

  // DEN LEU
  'den-leu': [
    {
      title: 'Đèn Lều Trang Trí LED 3W',
      description:
        'Đèn lều Trang Trí LED 3W, sáng trắng 300 lumen. Pin sạc 2000mAh. Thời gian dùng 20 giờ. Chống nước nhẹ. Có móc treo. Màu vàng. Thích hợp treo trong lều camping. Giá rẻ, tiện lợi.',
      brand: { name: 'Trang Trí', model: 'Tent Light LED 3W' },
      images: [
        {
          url: 'https://bizweb.dktcdn.net/thumb/grande/100/269/619/articles/den-led-nho-trang-tri-ngoai-troi-2.jpg?v=1650947058353',
          alt: 'Trang Trí tent light',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'LED tent illumination',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Portable tent light',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 8000,
        weeklyRate: 40000,
        monthlyRate: 110000,
        deposit: { amount: 25000 }
      }
    },
    {
      title: 'Đèn Lều Năng Lượng Mặt Trời Biolite',
      description:
        'Biolite SolarPanel 5+ đèn lều sạc năng lượng mặt trời. Sáng 250 lumen. Pin 3200mAh. USB output. Chống nước IPX4. Màu xanh. Thích hợp camping xanh, trekking. Tự sạc, thân thiện môi trường.',
      brand: { name: 'Biolite', model: 'SolarPanel Tent Light' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Biolite solar tent light',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Solar powered light',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Eco-friendly tent light',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 60000 }
      }
    },
    {
      title: 'Đèn Lều LED Trang Trí Có Cảm Biến',
      description:
        'Đèn lều LED Trang Trí có cảm biến chuyển động. Sáng 200 lumen khi có người. Pin sạc 1500mAh. Thời gian dùng 15 giờ. Chống nước nhẹ. Màu trắng. Tiết kiệm pin, tiện lợi.',
      brand: { name: 'Trang Trí', model: 'Motion Sensor Tent Light' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWMcsXn36UJNFMDEQkJ7ZpddOJDT_anOW4MQ&s',
          alt: 'Motion sensor tent light',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Automatic tent light',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Smart tent illumination',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 10000,
        weeklyRate: 55000,
        monthlyRate: 150000,
        deposit: { amount: 35000 }
      }
    },
    {
      title: 'Đèn Lều USB Rechargeable 5W',
      description:
        'Đèn lều sạc USB 5W, sáng 500 lumen. Pin 4000mAh. Thời gian dùng 12 giờ. Chống nước IPX5. Móc treo đa năng. Màu xanh. Thích hợp camping dài ngày.',
      brand: { name: 'Generic Pro', model: 'USB Tent Light 5W' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcTWXbPVHpAQfKGC8KDQIqUsgZ8JglIWywnosq7L1mOO8BJG0oLTkxqAdRERuVUiAgDYL4UUgrwJ7kMEGXJcUX-JYBhVl4oxoreM0kjy-73EKWpptV-FfUfh&usqp=CAc',
          alt: 'USB rechargeable tent light',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'High power tent light',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Bright camping light',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 12000,
        weeklyRate: 65000,
        monthlyRate: 180000,
        deposit: { amount: 45000 }
      }
    },
    {
      title: 'Đèn Lều Trang Trí 2 Đèn LED',
      description:
        'Đèn lều Trang Trí 2 đèn LED riêng biệt. Mỗi đèn 2W, sáng 200 lumen. Pin sạc riêng. Thời gian dùng 25 giờ. Chống nước nhẹ. Màu cam. Thích hợp lều lớn, camping nhóm.',
      brand: { name: 'Trang Trí', model: 'Dual LED Tent Light' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcQqmH8wqh26ssD7oi7WZSxTLY7LsTZId5ngXsBSQxDw1O0sEnkpzXRW7pyiJh-DZmYSiIcujOKwyNZIp8LzKjjw0rWQ802hahUWx9DNqFs1&usqp=CAc',
          alt: 'Dual LED tent light',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Two-light tent setup',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Group camping light',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 55000 }
      }
    },
    {
      title: 'Đèn Lều Năng Lượng Mặt Trời 10W',
      description:
        'Đèn lều sạc năng lượng mặt trời 10W. Sáng 800 lumen. Pin 6000mAh. USB output 2A. Chống nước IPX6. Màu đen. Thích hợp camping tự cung cấp điện.',
      brand: { name: 'Generic Solar', model: '10W Solar Tent Light' },
      images: [
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQ_oPg9iKhlAbVna0SEUii20dbMBXxyGsl1V6Fhv03Zu0jcv6NDOiBQiUc41GA1sk17TZD0eidxFcl3AW-YLnuBIudH3f0BoTjD-ZR0Rgg&usqp=CAc',
          alt: '10W solar tent light',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'High capacity solar light',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Off-grid camping light',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 80000 }
      }
    }
  ],

  // XE DAP DIA HINH
  'xe-dap-dia-hinh': [
    {
      title: 'Xe Đạp Địa Hình MTB Trang Trí 26"',
      description:
        'Xe đạp địa hình Trang Trí 26", khung thép bền. Hệ thống phanh V-brake. Bánh xe địa hình. Màu xanh. Thích hợp đường phố, du lịch nhẹ. Đã dùng 1 năm, bảo dưỡng tốt.',
      brand: { name: 'Trang Trí', model: 'MTB 26"' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcQbE2GVr1kt8ve0WG3ONEIbjZ-XnVmgf_sgMtSnhcBsoOuM9NHHBhuVfIKSGBi1l5X0ZjC-v0RbR37_a_HMv0HIe2zSuJ8lU4QVdmaB2TrqbtZBDFKHlB83lctwN9kQ8u9ddAQBjQJ1LLE&usqp=CAc',
          alt: 'Trang Trí MTB bicycle',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Mountain bike rental',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Off-road bicycle',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 50000,
        weeklyRate: 290000,
        monthlyRate: 800000,
        deposit: { amount: 300000 }
      }
    },
    {
      title: 'Xe Đạp Touring Giant Escape 3',
      description:
        'Giant Escape 3 xe đạp touring, khung nhôm ALUXX. Hộp số Shimano 24 tốc. Phanh đĩa hydraulic. Bánh 700c. Màu xanh navy. Thích hợp du lịch đường dài. Đã đi 2000km, còn tốt.',
      brand: { name: 'Giant', model: 'Escape 3' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSnG7hSuXMyLy54PIPDyfUEM90WlEnXKRCA6A&s',
          alt: 'Giant Escape touring bike',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Road touring bicycle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Long distance bike',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 80000,
        weeklyRate: 450000,
        monthlyRate: 1200000,
        deposit: { amount: 500000 }
      }
    },
    {
      title: 'Xe Đạp Địa Hình Rockrider ST 500',
      description:
        'Rockrider ST 500 xe đạp MTB, khung nhôm 6061. Hộp số SRAM SX Eagle 12 tốc. Phanh đĩa Shimano. Bánh 29". Màu đỏ. Thích hợp trail riding. Đã dùng 6 tháng, còn mới.',
      brand: { name: 'Rockrider', model: 'ST 500' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQiwnyQZ-UxSh3fAGSQx1TuSUGGAl_j5552JQ&s',
          alt: 'Rockrider MTB bicycle',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trail mountain bike',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: '29er mountain bike',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 100000,
        weeklyRate: 580000,
        monthlyRate: 1650000,
        deposit: { amount: 600000 }
      }
    },
    {
      title: 'Xe Đạp Hybrid Trang Trí 700c',
      description:
        'Xe đạp hybrid Trang Trí 700c, khung thép. Hộp số 21 tốc. Phanh V-brake. Thích hợp đường phố + đường đất. Màu đen. Đã dùng 2 năm, vận hành tốt.',
      brand: { name: 'Trang Trí', model: 'Hybrid 700c' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcSKCMI-TS4lw9W-kao12Xd_wufw3xl1A_wXCGdVBdqfUfVIglPenfGVMURJkrEPI2lOhe9pkJre_rlq7Po_dq79Q9llWTl_WpCITyMm5gk8DSrpSR-3n5yK96idrl2POzXEvLvzJQDUrS4&usqp=CAc',
          alt: 'Trang Trí hybrid bike',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'City hybrid bicycle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Versatile bike rental',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 60000,
        weeklyRate: 350000,
        monthlyRate: 950000,
        deposit: { amount: 350000 }
      }
    },
    {
      title: 'Xe Đạp Đua Trek Emonda ALR 5',
      description:
        'Trek Emonda ALR 5 xe đạp đua, khung carbon OCLV. Hộp số Shimano 105 11 tốc. Phanh đĩa. Bánh 700c. Màu xanh. Thích hợp cycling đường dài. Đã đi 1500km.',
      brand: { name: 'Trek', model: 'Emonda ALR 5' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcSKCMI-TS4lw9W-kao12Xd_wufw3xl1A_wXCGdVBdqfUfVIglPenfGVMURJkrEPI2lOhe9pkJre_rlq7Po_dq79Q9llWTl_WpCITyMm5gk8DSrpSR-3n5yK96idrl2POzXEvLvzJQDUrS4&usqp=CAc',
          alt: 'Trek Emonda road bike',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Carbon road bicycle',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Performance road bike',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 120000,
        weeklyRate: 700000,
        monthlyRate: 2000000,
        deposit: { amount: 800000 }
      }
    },
    {
      title: 'Xe Đạp Trẻ Em Trang Trí 20',
      description:
        'Xe đạp trẻ em Trang Trí 20", khung thép chắc chắn. Phanh V-brake an toàn. Màu xanh vàng. Thích hợp trẻ 8-12 tuổi. Đã dùng nhẹ, còn tốt.',
      brand: { name: 'Trang Trí', model: 'Kids Bike 20"' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcQf8U50sZ7OBH733bpNR9ORG2027kAc5kQw4GYlz_55vfg4QPyt6T2dfNR12g9LQ2i6qHvEJ0xr-lxfENVz71Rii7z7HVVR30yJeNMYgxOx_Ny0kvOVx27p_wk&usqp=CAc',
          alt: 'Trang Trí kids bike',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Children bicycle rental',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Family bike rental',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 450000,
        deposit: { amount: 150000 }
      }
    }
  ],

  // BO NOI & DUNG CU AN UONG
  'bo-noi-dung-cu-an-uong': [
    {
      title: 'Bộ Nồi Trang Trí 3 Chi Tiết',
      description:
        'Bộ nồi Trang Trí 3 chi tiết: nồi 1.5L, chảo 20cm, nắp. Vỏ nhôm dày. Tay cầm cách nhiệt. Màu xanh. Thích hợp nấu ăn dã ngoại. Chất lượng Việt Nam, tiện lợi.',
      brand: { name: 'Trang Trí', model: 'Cookware Set 3pcs' },
      images: [
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcQ_Dx33E6wsCYKv4nlT14fpjcM2w7MNtIrb_xOeIsHmYcTHrEFMvm8GOqkx5eSqv8qp8JUlWnFZF6FMmVuoF-MbHgxG7S-tAVdJIAQ8l34&usqp=CAc',
          alt: 'Trang Trí cookware set',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Camping cookware',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Outdoor cooking set',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 100000 }
      }
    },
    {
      title: 'Bộ Dụng Cụ Ăn Uống Trang Trí 4 Người',
      description:
        'Bộ dụng cụ ăn uống Trang Trí cho 4 người: 4 dĩa, 4 bát, 4 đôi đũa, 4 cốc. Nhựa PP bền. Gấp gọn. Màu xanh. Thích hợp picnic, camping. Dễ vệ sinh, tiện lợi.',
      brand: { name: 'Trang Trí', model: 'Dinnerware Set 4 People' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcTeAbIbzUJXKpuOD-GhUxCxcRyCKxNnwkqUtM0bIy48RtCl5vQwb-Rp3a9uXUAFcMNBU-k9RtnwWZtVifOm_7ceBUqymg7IGFNG3JE_F80WUMA9QE6HTtAr1NFFoRB4B9WsdzmGCyOF-q0&usqp=CAc',
          alt: 'Trang Trí dinnerware set',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Camping dinnerware',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Foldable eating utensils',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 80000 }
      }
    },
    {
      title: 'Nồi Trang Trí 2L Có Nắp',
      description:
        'Nồi Trang Trí 2L lớn có nắp, vỏ nhôm dày 2mm. Tay cầm cách nhiệt. Thích hợp nấu cơm, canh cho nhóm. Màu xanh. Chất lượng tốt, bền.',
      brand: { name: 'Trang Trí', model: 'Large Pot 2L' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcSxHSYDyND9Qb2zipGhvbaCrIgReRFe7ndc_82Tq3zjnMmf8ork9z5psJAVYRm8H-HxaBzFKdHw_AlkV1Tmfu9J826kMnD0L-jiUUOW_IohwnbePaildqC6wb8A2eYl8Ry_X9bq1UAY-3s&usqp=CAc',
          alt: 'Trang Trí large pot',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Group cooking pot',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Camping large pot',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 60000 }
      }
    },
    {
      title: 'Bộ Đũa Đũa Gấp Trang Trí 6 Đôi',
      description:
        'Bộ đũa đũa gấp Trang Trí 6 đôi, tre bền. Gấp gọn dễ mang. Màu tự nhiên. Thích hợp picnic, dã ngoại. Dễ vệ sinh, tiện lợi.',
      brand: { name: 'Trang Trí', model: 'Folding Chopsticks 6 Pairs' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trang Trí folding chopsticks',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Portable chopsticks',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Bamboo folding utensils',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 8000,
        weeklyRate: 40000,
        monthlyRate: 110000,
        deposit: { amount: 25000 }
      }
    },
    {
      title: 'Chảo Trang Trí 24cm Không Dính',
      description:
        'Chảo Trang Trí 24cm chống dính, vỏ nhôm. Tay cầm cách nhiệt. Thích hợp chiên, xào. Màu đen. Chất lượng tốt, dễ vệ sinh.',
      brand: { name: 'Trang Trí', model: 'Non-stick Pan 24cm' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Trang Trí non-stick pan',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Camping frying pan',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Outdoor cooking pan',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 12000,
        weeklyRate: 65000,
        monthlyRate: 180000,
        deposit: { amount: 45000 }
      }
    },
    {
      title: 'Bộ Dụng Cụ Trang Trí 8 Chi Tiết',
      description:
        'Bộ dụng cụ Trang Trí 8 chi tiết: dao, kéo, thìa, đũa, nĩa, mở hộp, mở chai, gắp. Thép không gỉ. Gấp gọn. Màu xanh. Thích hợp dã ngoại đầy đủ.',
      brand: { name: 'Trang Trí', model: 'Utensil Set 8pcs' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trang Trí utensil set',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Complete camping utensils',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Foldable kitchen set',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 18000,
        weeklyRate: 100000,
        monthlyRate: 270000,
        deposit: { amount: 70000 }
      }
    }
  ],

  // DEN PIN CAM TAY
  'den-pin-cam-tay': [
    {
      title: 'Đèn Pin Cầm Tay LED Lenser P7',
      description:
        'LED Lenser P7 đèn pin cầm tay 320 lumen, chiếu xa 240m. Công nghệ Advanced Focus System. Pin 4xAA (không kèm). Thời gian dùng 25 giờ. Chống nước IPX4. Trọng lượng 175g. Màu đen.',
      brand: { name: 'LED Lenser', model: 'P7' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcTRNtfZOXFkPt76vpX2gRKXV4QDN4riM72V6IeRHKUg5-jQlKolb81YiozkMZ5dpjJJlcRveTdqWnS1qXT3KY6ifeWzWM0gkPlBqFzfH5iPuLSQs45lvgEm6xa9MpqKOzPQjMwIRP0G1g&usqp=CAc',
          alt: 'LED Lenser P7 flashlight',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Professional flashlight',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'High power torch',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 80000 }
      }
    },
    {
      title: 'Đèn Pin Trang Trí 1000 Lumen',
      description:
        'Đèn pin Trang Trí 1000 lumen siêu sáng, chiếu xa 200m. 5 chế độ ánh sáng. Pin sạc 4000mAh. Thời gian dùng 8 giờ. Chống nước IPX6. Trọng lượng 250g. Màu đen. Thích hợp cứu hộ.',
      brand: { name: 'Trang Trí', model: 'Super Bright Flashlight 1000L' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTURdIF2cXQy9RrEDfIMSRIEzUslDdc9HztXw&s',
          alt: 'Trang Trí super bright flashlight',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: '1000 lumen torch',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Emergency flashlight',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 60000 }
      }
    },
    {
      title: 'Đèn Pin Cầm Tay Rechargeable 500L',
      description:
        'Đèn pin sạc lại 500 lumen, 3 chế độ. Pin Lithium 2000mAh. Thời gian dùng 6 giờ. Chống nước IPX5. USB charging. Trọng lượng 180g. Màu xanh. Thích hợp hàng ngày.',
      brand: { name: 'Generic Pro', model: 'Rechargeable Flashlight 500L' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcT2doqMnhjoL1np-ZS73U8Tylaee_EnFMTspVVSHhnyqy6aQ1VfpMp_32pkLmpnRcMuoKo_5jgXowOKrDoxroQ-3jbiHlwHKQKJUkh8oHj8x8miYOBBTQXZ0iviIb6kKE_Y38Hu_A&usqp=CAc',
          alt: 'Rechargeable flashlight',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'USB rechargeable torch',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Cordless flashlight',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 12000,
        weeklyRate: 65000,
        monthlyRate: 180000,
        deposit: { amount: 45000 }
      }
    },
    {
      title: 'Đèn Pin LED Lenser MT7',
      description:
        'LED Lenser MT7 đèn pin đa năng 400 lumen, có zoom. Công nghệ Temperature Control. Pin 2xCR123. Thời gian dùng 8 giờ. Chống nước IPX6. Trọng lượng 135g. Màu đen.',
      brand: { name: 'LED Lenser', model: 'MT7' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'LED Lenser MT7 flashlight',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Zoom flashlight',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Multi-function torch',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 100000 }
      }
    },
    {
      title: 'Đèn Pin Trang Trí Có Đèn Khẩn Cấp',
      description:
        'Đèn pin Trang Trí có đèn khẩn cấp đỏ. Sáng 300 lumen. Pin sạc 3000mAh. Thời gian dùng 15 giờ. Chống nước nhẹ. Trọng lượng 200g. Màu đỏ. Thích hợp cứu hộ.',
      brand: { name: 'Trang Trí', model: 'Emergency Flashlight' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Emergency flashlight',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Red emergency light',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Safety flashlight',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 10000,
        weeklyRate: 55000,
        monthlyRate: 150000,
        deposit: { amount: 35000 }
      }
    },
    {
      title: 'Đèn Pin Tác Tính Trang Trí 200L',
      description:
        'Đèn pin tác tính Trang Trí 200 lumen, nhỏ gọn. Pin CR123A. Thời gian dùng 50 giờ. Chống nước nhẹ. Trọng lượng 80g. Màu đen. Thích hợp mang theo hàng ngày.',
      brand: { name: 'Trang Trí', model: 'Tactical Flashlight 200L' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Tactical flashlight',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Compact tactical torch',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Pocket flashlight',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 8000,
        weeklyRate: 40000,
        monthlyRate: 110000,
        deposit: { amount: 25000 }
      }
    }
  ],

  // THIET BI DIEN TU KHAC
  'thiet-bi-dien-tu-khac': [
    {
      title: 'Pin Dự Phòng Xiaomi 10000mAh',
      description:
        'Pin dự phòng Xiaomi 10000mAh, output 18W. Sạc nhanh Quick Charge 3.0. 2 cổng USB. Màn hình hiển thị pin. Chống nước nhẹ. Màu đen. Thích hợp du lịch, công việc.',
      brand: { name: 'Xiaomi', model: 'Power Bank 10000mAh' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcRmihnmsk8He9F0NKIB9qN6VQdIx4adxSOKhUSjEXXC94l1XpDICox1l-g8Xqu7iZqVnBr-8D376Yt8qibbcBp07vCBx-bVRnCSFgcUVKTGIiZkDOLAxDTcWOap&usqp=CAc',
          alt: 'Xiaomi power bank',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Portable charger',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Travel power bank',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 60000 }
      }
    },
    {
      title: 'Bộ Phát WiFi 4G Xiaomi',
      description:
        'Bộ phát WiFi 4G Xiaomi, hỗ trợ sim 4G. Tốc độ download 150Mbps. Pin 2000mAh. Kết nối 10 thiết bị. Màn hình LCD. Màu trắng. Thích hợp du lịch quốc tế.',
      brand: { name: 'Xiaomi', model: '4G WiFi Router' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcSVw1XiH3vhkKmS2B3s0aMjeIrNzm4HhBeDjVADu4Y-Oo2nHBHsXZ3OwudJBxYG-mnuitm7zHH9k3lcdgwEfWd1By4-GBSEFvn4dxW6mzaydv2R5Tr_j3ycOA&usqp=CAc',
          alt: 'Xiaomi 4G WiFi router',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Portable WiFi hotspot',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Travel internet device',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 100000 }
      }
    },
    {
      title: 'Pin Dự Phòng Anker 20000mAh',
      description:
        'Pin dự phòng Anker PowerCore 20000mAh, output 22.5W. Sạc nhanh PowerIQ. 2 cổng USB. Công nghệ an toàn. Màu đen. Thích hợp sạc laptop, điện thoại.',
      brand: { name: 'Anker', model: 'PowerCore 20000' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcT2doqMnhjoL1np-ZS73U8Tylaee_EnFMTspVVSHhnyqy6aQ1VfpMp_32pkLmpnRcMuoKo_5jgXowOKrDoxroQ-3jbiHlwHKQKJUkh8oHj8x8miYOBBTQXZ0iviIb6kKE_Y38Hu_A&usqp=CAc',
          alt: 'Anker power bank',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'High capacity charger',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Laptop power bank',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 80000 }
      }
    },
    {
      title: 'Sạc Năng Lượng Mặt Trời 21W',
      description:
        'Sạc năng lượng mặt trời 21W, hiệu suất 23%. Sạc USB 5V/2.1A. Chống nước hoàn toàn. Gấp gọn. Trọng lượng 200g. Màu xanh. Thích hợp trekking tự cung cấp điện.',
      brand: { name: 'Generic Solar', model: 'Solar Charger 21W' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcT2doqMnhjoL1np-ZS73U8Tylaee_EnFMTspVVSHhnyqy6aQ1VfpMp_32pkLmpnRcMuoKo_5jgXowOKrDoxroQ-3jbiHlwHKQKJUkh8oHj8x8miYOBBTQXZ0iviIb6kKE_Y38Hu_A&usqp=CAc',
          alt: 'Solar charger',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Portable solar panel',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Off-grid charger',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 450000,
        deposit: { amount: 120000 }
      }
    },
    {
      title: 'Adapter Du Lịch Universal',
      description:
        'Adapter du lịch universal, hỗ trợ 150 quốc gia. USB 2.1A. Chống quá tải. Gấp gọn. Trọng lượng 120g. Màu trắng. Thích hợp du lịch quốc tế.',
      brand: { name: 'Generic', model: 'Universal Travel Adapter' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcT2doqMnhjoL1np-ZS73U8Tylaee_EnFMTspVVSHhnyqy6aQ1VfpMp_32pkLmpnRcMuoKo_5jgXowOKrDoxroQ-3jbiHlwHKQKJUkh8oHj8x8miYOBBTQXZ0iviIb6kKE_Y38Hu_A&usqp=CAc',
          alt: 'Universal travel adapter',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Worldwide adapter',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'International charger',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 10000,
        weeklyRate: 55000,
        monthlyRate: 150000,
        deposit: { amount: 40000 }
      }
    },
    {
      title: 'Loa Bluetooth JBL Go 3',
      description:
        'Loa Bluetooth JBL Go 3, chống nước IPX7. Pin 5 giờ. Kết nối Bluetooth 4.1. Màu xanh. Thích hợp nghe nhạc dã ngoại. Đã dùng 1 năm, còn tốt.',
      brand: { name: 'JBL', model: 'Go 3' },
      images: [
        {
          url: 'https://encrypted-tbn3.gstatic.com/shopping?q=tbn:ANd9GcT2doqMnhjoL1np-ZS73U8Tylaee_EnFMTspVVSHhnyqy6aQ1VfpMp_32pkLmpnRcMuoKo_5jgXowOKrDoxroQ-3jbiHlwHKQKJUkh8oHj8x8miYOBBTQXZ0iviIb6kKE_Y38Hu_A&usqp=CAc',
          alt: 'JBL Go 3 speaker',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Waterproof Bluetooth speaker',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Portable camping speaker',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 100000 }
      }
    }
  ],

  // TRANG BI LEO NUI
  'trang-bi-leo-nui': [
    {
      title: 'Gậy Trekking Trang Trí 2 Chiếc',
      description:
        'Gậy trekking Trang Trí 2 chiếc, gấp gọn 3 đoạn. Tay cầm foam thoải mái. Đế carbide bền. Chiều cao điều chỉnh. Trọng lượng 480g. Màu xanh. Thích hợp trekking núi.',
      brand: { name: 'Trang Trí', model: 'Trekking Poles 2pcs' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:ANd9GcQ2vDyioK16GzXBM8SiR88Vm0PKQ2Vcrr_M1lPUhybHl2Q7LE3iEjkTz5lpkzqrm2-Ay6x009_KvVs6DTihwe-MQRkNYs6AkPgI2zJAzjw&usqp=CAc',
          alt: 'Trang Trí trekking poles',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Hiking poles',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Mountain trekking gear',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 80000 }
      }
    },
    {
      title: 'Móc Cà Rông Trang Trí 6 Chiếc',
      description:
        'Móc cà rông Trang Trí 6 chiếc các size. Thép không gỉ bền. Có bao đựng. Trọng lượng 200g. Màu bạc. Thích hợp leo núi, climbing cơ bản.',
      brand: { name: 'Trang Trí', model: 'Carabiners 6pcs' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Trang Trí carabiners',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Climbing carabiners',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Mountain climbing hardware',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 60000 }
      }
    },
    {
      title: 'Dây Leo Núi Trang Trí 10m',
      description:
        'Dây leo núi Trang Trí 10m, đường kính 10mm. Chống thấm nước. Độ bền 2000kg. Có móc khóa 2 đầu. Màu xanh. Thích hợp climbing, rappelling.',
      brand: { name: 'Trang Trí', model: 'Climbing Rope 10m' },
      images: [
        {
          url: 'https://gw.alicdn.com/imgextra/i1/2446214237/TB2ds05dXXXXXagXXXXXXXXXXXX_!!2446214237.jpg',
          alt: 'Trang Trí climbing rope',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Mountain climbing rope',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Rappelling rope',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 450000,
        deposit: { amount: 120000 }
      }
    },
    {
      title: 'Găng Tay Leo Núi Trang Trí',
      description:
        'Găng tay leo núi Trang Trí, da + vải bền. Chống trượt tốt. Có bảo vệ khớp ngón. Size L. Màu đen. Thích hợp climbing, trekking khó.',
      brand: { name: 'Trang Trí', model: 'Climbing Gloves' },
      images: [
        {
          url: 'https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcR5MM25JWV6IE6pcmv7Jnz9RjEVUZP-Ss36f1ZMR5v9rmk-b4X2EWc_oL55SjJb-d4rQBm3nXKumLD8nG_vsZPOpw7qFwj49DoAlfYnZTP2mlaHJ-SQO4FgkT0T&usqp=CAc',
          alt: 'Trang Trí climbing gloves',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Mountain climbing gloves',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Rock climbing protection',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 12000,
        weeklyRate: 65000,
        monthlyRate: 180000,
        deposit: { amount: 45000 }
      }
    },
    {
      title: 'Balo Leo Núi Trang Trí 30L',
      description:
        'Balo leo núi Trang Trí 30L, vải Cordura bền. Nhiều túi đựng dụng cụ. Chịu tải 15kg. Màu xanh. Thích hợp climbing, multi-pitch.',
      brand: { name: 'Trang Trí', model: 'Climbing Backpack 30L' },
      images: [
        {
          url: 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcS2JZrBAxV4M_48n6LdH-ii7mdDNglFMSKege7QhvmAEKUJyJt-2-In5yxruvkzKe0z0gETuQb2Zp0BC-ZVNFKdE0iTgP5eDYzWeUpugUA2Tf1Ou2LqHvf78q_G4blWWUcFUguw5y0Umg&usqp=CAc',
          alt: 'Trang Trí climbing backpack',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Technical climbing pack',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Alpine climbing gear',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 100000 }
      }
    },
    {
      title: 'Mũ Bảo Hiểm Leo Núi Trang Trí',
      description:
        'Mũ bảo hiểm leo núi Trang Trí, ABS shell. Hệ thống thông gió. Dây đeo điều chỉnh. Trọng lượng 350g. Màu xanh. Thích hợp climbing, trekking hiểm trở.',
      brand: { name: 'Trang Trí', model: 'Climbing Helmet' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTBPSNoPx5XPF3sFuTEn1JDhqUqWSKX9QWRUQ&s',
          alt: 'Trang Trí climbing helmet',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Rock climbing helmet',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Mountain safety helmet',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 18000,
        weeklyRate: 100000,
        monthlyRate: 270000,
        deposit: { amount: 70000 }
      }
    }
  ],

  // KAYAK & SUP
  'kayak-sup': [
    {
      title: 'Kayak Touring Trang Trí 1 Người',
      description:
        'Kayak touring Trang Trí 1 người, dài 4.5m. Vỏ polyethylene bền. Chỗ ngồi điều chỉnh. Chống nước hoàn toàn. Màu xanh. Thích hợp chèo sông, hồ.',
      brand: { name: 'Trang Trí', model: 'Touring Kayak 1P' },
      images: [
        {
          url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT0UEbVkVyBDQMQlBAz9ht88086UPk7oQ4vzw&s',
          alt: 'Trang Trí touring kayak',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Single person kayak',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'River touring kayak',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 100000,
        weeklyRate: 580000,
        monthlyRate: 1650000,
        deposit: { amount: 600000 }
      }
    },
    {
      title: 'Ván Chèo Đứng SUP Trang Trí 10\'6"',
      description:
        'Ván chèo đứng SUP Trang Trí 10\'6", epoxy bền. Chiều dày 6". Vô lăng. Leash dây đeo. Màu xanh dương. Thích hợp sông hồ, biển.',
      brand: { name: 'Trang Trí', model: 'SUP Board 10\'6"' },
      images: [
        {
          url: 'data:image/jpeg;base64,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',
          alt: 'Trang Trí SUP board',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Stand up paddle board',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Water sports SUP',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 120000,
        weeklyRate: 700000,
        monthlyRate: 2000000,
        deposit: { amount: 800000 }
      }
    },
    {
      title: 'Kayak Ngồi Trang Trí 2 Người',
      description:
        'Kayak ngồi Trang Trí 2 người, dài 5.2m. Vỏ polyethylene. 2 chỗ ngồi. Chống nước hoàn toàn. Màu vàng. Thích hợp gia đình chèo thuyền.',
      brand: { name: 'Trang Trí', model: 'Sit-on-Top Kayak 2P' },
      images: [
        {
          url: 'data:image/jpeg;base64,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',
          alt: 'Trang Trí tandem kayak',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Two person kayak',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Family kayak rental',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 150000,
        weeklyRate: 850000,
        monthlyRate: 2400000,
        deposit: { amount: 1000000 }
      }
    },
    {
      title: "Ván SUP Bơm Trang Trí 11'",
      description:
        'Ván SUP bơm Trang Trí 11\', dày 6". Bơm điện kèm theo. Vô lăng. Leash. Màu xanh. Dễ vận chuyển. Thích hợp du lịch.',
      brand: { name: 'Trang Trí', model: "Inflatable SUP 11'" },
      images: [
        {
          url: 'data:image/jpeg;base64,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',
          alt: 'Trang Trí inflatable SUP',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Portable SUP board',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Travel SUP board',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 80000,
        weeklyRate: 450000,
        monthlyRate: 1200000,
        deposit: { amount: 500000 }
      }
    },
    {
      title: 'Mái Chèo Kayak Trang Trí 2 Chiếc',
      description:
        'Mái chèo kayak Trang Trí 2 chiếc, nhôm + composite. Chiều dài 210cm. Cầm thoải mái. Màu đen. Thích hợp kayak touring.',
      brand: { name: 'Trang Trí', model: 'Kayak Paddles 2pcs' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Trang Trí kayak paddles',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Kayak paddles',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Water sports paddles',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 450000,
        deposit: { amount: 120000 }
      }
    },
    {
      title: 'Áo Phao Cứu Sinh Trang Trí',
      description:
        'Áo phao cứu sinh Trang Trí, PVC foam. Chiều dài 80cm. Dây đeo chắc chắn. Màu cam nổi bật. Thích hợp kayak, SUP an toàn.',
      brand: { name: 'Trang Trí', model: 'Life Jacket' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trang Trí life jacket',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Kayak life vest',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Water safety jacket',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 20000,
        weeklyRate: 110000,
        monthlyRate: 300000,
        deposit: { amount: 80000 }
      }
    }
  ],

  // VAN TRUOT & PATIN
  'van-truot-patin': [
    {
      title: 'Ván Trượt Địa Hình Trang Trí',
      description:
        'Ván trượt địa hình Trang Trí, deck maple 8 ply. Trucks aluminum. Wheels 52mm 99A. Chịu tải 100kg. Màu đen. Thích hợp park, street.',
      brand: { name: 'Trang Trí', model: 'Street Skateboard' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Trang Trí skateboard',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Street skateboard',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Urban skateboard',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 40000,
        weeklyRate: 230000,
        monthlyRate: 650000,
        deposit: { amount: 250000 }
      }
    },
    {
      title: 'Giày Patin Inline Trang Trí',
      description:
        'Giày patin inline Trang Trí, 4 bánh. Khung nhôm. Bánh PU 80mm. Phanh gót. Size 42. Màu xanh. Thích hợp tập luyện, giải trí.',
      brand: { name: 'Trang Trí', model: 'Inline Skates' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trang Trí inline skates',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Rollerblades',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Inline skating gear',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 35000,
        weeklyRate: 200000,
        monthlyRate: 550000,
        deposit: { amount: 200000 }
      }
    },
    {
      title: 'Ván Trượt Cruiser Trang Trí',
      description:
        'Ván trượt cruiser Trang Trí, deck bamboo. Trucks steel. Wheels 59mm 78A. Màu gỗ. Thích hợp dancing, carving. Nhẹ nhàng, mượt mà.',
      brand: { name: 'Trang Trí', model: 'Cruiser Skateboard' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Trang Trí cruiser board',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Dancing skateboard',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Carving skateboard',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 450000,
        deposit: { amount: 150000 }
      }
    },
    {
      title: 'Giày Patin Roller Trang Trí',
      description:
        'Giày patin roller Trang Trí, 8 bánh. Khung PP. Bánh PVC. Phanh. Size 40. Màu hồng. Thích hợp trẻ em, người mới tập.',
      brand: { name: 'Trang Trí', model: 'Roller Skates' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trang Trí roller skates',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Quad skates',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Classic roller skates',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 130000 }
      }
    },
    {
      title: 'Ván Trượt Longboard Trang Trí',
      description:
        'Ván trượt longboard Trang Trí, deck 42". Trucks reverse kingpin. Wheels 70mm 78A. Màu xanh. Thích hợp cruising, dancing.',
      brand: { name: 'Trang Trí', model: 'Longboard' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Trang Trí longboard',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Dancing longboard',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Cruising skateboard',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 35000,
        weeklyRate: 200000,
        monthlyRate: 550000,
        deposit: { amount: 200000 }
      }
    },
    {
      title: 'Mũ Bảo Hiểm Skate Trang Trí',
      description:
        'Mũ bảo hiểm skate Trang Trí, ABS shell. Hệ thống thông gió. Dây đeo. Trọng lượng 400g. Màu đen. Thích hợp skateboard, patin an toàn.',
      brand: { name: 'Trang Trí', model: 'Skate Helmet' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trang Trí skate helmet',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Skateboarding helmet',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Inline skating helmet',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 60000 }
      }
    }
  ],

  // KHAC
  'khac-sub': [
    {
      title: 'Bộ Dụng Cụ Đa Năng Trang Trí',
      description:
        'Bộ dụng cụ đa năng Trang Trí, gồm tua vít, cờ lê, kìm. Thép carbon. 20 chi tiết. Có hộp đựng. Màu xanh. Thích hợp sửa chữa cơ bản.',
      brand: { name: 'Trang Trí', model: 'Multi-tool Kit' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Trang Trí tool kit',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Multi-purpose tools',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Repair tool set',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 25000,
        weeklyRate: 140000,
        monthlyRate: 380000,
        deposit: { amount: 100000 }
      }
    },
    {
      title: 'Túi Đựng Đồ Trang Trí 50L',
      description:
        'Túi đựng đồ Trang Trí 50L, vải canvas bền. Quai đeo vai. Khóa zip. Màu xanh. Thích hợp đựng đồ trekking, dã ngoại.',
      brand: { name: 'Trang Trí', model: 'Gear Bag 50L' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trang Trí gear bag',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Outdoor gear bag',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Travel storage bag',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 15000,
        weeklyRate: 80000,
        monthlyRate: 220000,
        deposit: { amount: 60000 }
      }
    },
    {
      title: 'Bình Xịt Muỗi Trang Trí',
      description:
        'Bình xịt muỗi Trang Trí 200ml, DEET 30%. Bảo vệ 8 giờ. Mùi nhẹ. Thích hợp dã ngoại, trekking. An toàn cho da.',
      brand: { name: 'Trang Trí', model: 'Mosquito Repellent Spray' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Trang Trí mosquito spray',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Outdoor insect repellent',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Camping bug spray',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 8000,
        weeklyRate: 40000,
        monthlyRate: 110000,
        deposit: { amount: 25000 }
      }
    },
    {
      title: 'Kính Mát Trang Trí',
      description:
        'Kính mát Trang Trí, gọng nhôm. Kính polarized. Chống UV 100%. Màu đen. Thích hợp thể thao, dã ngoại.',
      brand: { name: 'Trang Trí', model: 'Sports Sunglasses' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trang Trí sunglasses',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Polarized sunglasses',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Outdoor sunglasses',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 12000,
        weeklyRate: 65000,
        monthlyRate: 180000,
        deposit: { amount: 45000 }
      }
    },
    {
      title: 'Bộ Câu Cá Cơ Bản Trang Trí',
      description:
        'Bộ câu cá cơ bản Trang Trí, cần câu 2.1m, máy câu spinning, mồi giả. Thích hợp câu sông, hồ. Giá rẻ, chất lượng ổn.',
      brand: { name: 'Trang Trí', model: 'Basic Fishing Kit' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Trang Trí fishing kit',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Basic fishing gear',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Fishing rod and reel',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 30000,
        weeklyRate: 170000,
        monthlyRate: 450000,
        deposit: { amount: 120000 }
      }
    },
    {
      title: 'La Bàn Cơ Bản Trang Trí',
      description:
        'La bàn cơ bản Trang Trí, nhôm. Độ chính xác cao. Có dây đeo. Trọng lượng 50g. Màu bạc. Thích hợp định hướng trekking.',
      brand: { name: 'Trang Trí', model: 'Basic Compass' },
      images: [
        {
          url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
          alt: 'Trang Trí compass',
          isMain: true
        },
        {
          url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
          alt: 'Hiking compass',
          isMain: false
        },
        {
          url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
          alt: 'Navigation compass',
          isMain: false
        }
      ],
      pricing: {
        dailyRate: 10000,
        weeklyRate: 55000,
        monthlyRate: 150000,
        deposit: { amount: 40000 }
      }
    }
  ]
};

async function seedProducts() {
  try {
    await mongoose.connect(
      process.env.DATABASE_URL ||
        'mongodb+srv://anhpham161223:I2zZINHGTkdKalRQ@vietstay.9g8adz1.mongodb.net/PIRA_System?retryWrites=true&w=majority&appName=vietstay'
    );
    console.log('✅ Connected to MongoDB');

    // Lấy tất cả subcategories
    const subcategories = await Category.find({ level: 1 }).lean();
    console.log(`📦 Found ${subcategories.length} subcategories`);

    const productsToCreate = [];
    let totalCount = 0;

    // Tạo products cho từng subcategory
    for (const subcat of subcategories) {
      const subcatSlug = subcat.slug;
      const templates = productTemplates[subcatSlug];

      if (!templates || templates.length === 0) {
        console.log(`⚠️  Skipping ${subcat.name} (${subcatSlug}) - no templates`);
        continue;
      }

      console.log(`✨ Creating products for: ${subcat.name} (${templates.length} templates)`);

      // Lấy parent category
      const parentCat = await Category.findById(subcat.parentCategory).lean();
      if (!parentCat) {
        console.log(`⚠️  Parent category not found for ${subcat.name}`);
        continue;
      }

      for (const template of templates) {
        const product = {
          title: template.title,
          description: template.description,
          category: parentCat._id,
          subCategory: subcat._id,
          owner: randomOwner(),
          condition: template.condition || randomCondition(),
          brand: template.brand,
          images: template.images || generateProductImages(template.title, subcatSlug),
          pricing: {
            ...template.pricing,
            currency: 'VND'
          },
          status: 'ACTIVE',
          availability: {
            isAvailable: true,
            quantity: randomInt(5, 10)
          },
          metrics: {
            viewCount: randomInt(50, 500),
            rentalCount: randomInt(0, 20),
            averageRating: randomInt(3, 5),
            reviewCount: randomInt(0, 10)
          },
          slug: createSlug(template.title),
          isPromoted: Math.random() > 0.7,
          videos: [],
          location: {
            deliveryOptions: {
              delivery: true,
              deliveryFee: randomInt(0, 50000),
              pickup: true
            }
          }
        };

        productsToCreate.push(product);
        totalCount++;
      }
    }

    console.log(`\n🚀 Creating ${productsToCreate.length} products...`);

    if (productsToCreate.length === 0) {
      console.log('❌ No products to create!');
      await mongoose.disconnect();
      return;
    }

    const createdProducts = await Product.insertMany(productsToCreate);

    console.log(`\n✅ Successfully created ${createdProducts.length} products!`);

    // Thống kê
    const stats = {};
    for (const product of createdProducts) {
      const ownerStr = product.owner.toString();
      stats[ownerStr] = (stats[ownerStr] || 0) + 1;
    }

    console.log('\n📊 Products per owner:');
    for (const [ownerId, count] of Object.entries(stats)) {
      console.log(`   Owner ${ownerId}: ${count} products`);
    }

    // Thống kê theo category
    const catStats = {};
    for (const product of createdProducts) {
      const subCatId = product.subCategory.toString();
      const subcat = subcategories.find((s) => s._id.toString() === subCatId);
      if (subcat) {
        catStats[subcat.name] = (catStats[subcat.name] || 0) + 1;
      }
    }

    console.log('\n📊 Products per subcategory:');
    for (const [catName, count] of Object.entries(catStats)) {
      console.log(`   ${catName}: ${count} products`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error seeding products:', error);
    process.exit(1);
  }
}

// Chạy seed
seedProducts();
