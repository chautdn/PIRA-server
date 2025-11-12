/* Seed products into MongoDB without exposing a create product API */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');

async function ensureCategory(name) {
  let cat = await Category.findOne({ name });
  if (!cat) {
    cat = await Category.create({ name, slug: name.toLowerCase().replace(/\s+/g, '-') });
  }
  return cat;
}

async function ensureOwner(email) {
  const phone = '0900000000';
  const filter = { $or: [{ email }, { phone }] };
  const update = {
    $setOnInsert: {
      email,
      phone,
      password: 'Temp#1234',
      role: 'OWNER',
      status: 'ACTIVE',
      profile: { firstName: 'Seed', lastName: 'Owner' }
    }
  };
  const options = { upsert: true, new: true }; // return the found or inserted doc
  const owner = await User.findOneAndUpdate(filter, update, options);
  return owner;
}

async function run() {
  await connectDB();


  // Tạo đủ các category như UI filter
  const catNames = [
    'Máy ảnh & Quay phim',
    'Thiết bị cắm trại',
    'Vali & Túi xách',
    'Thiết bị thể thao',
    'Đồ điện tử',
    'Phụ kiện du lịch'
  ];
  const categories = [];
  for (const name of catNames) {
    categories.push(await ensureCategory(name));
  }

  // Chủ sản phẩm
  const owner = await ensureOwner('seed-owner@pira.vn');

  // Quận Đà Nẵng
  const districts = [
    'Hải Châu', 'Thanh Khê', 'Sơn Trà', 'Ngũ Hành Sơn', 'Liên Chiểu', 'Cẩm Lệ'
  ];

  // Tình trạng sản phẩm
  const conditions = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'];

  // Trạng thái sản phẩm
  const statusArr = ['ACTIVE', 'RENTED', 'INACTIVE', 'DRAFT', 'LOCKED'];

  // Giá/ngày đa dạng
  const priceRanges = [50000, 100000, 200000, 300000, 500000, 1000000];

  // Brands
  const brands = [
    { name: 'Canon', model: 'EOS R5' },
    { name: 'DJI', model: 'Mavic Air 2' },
    { name: 'GoPro', model: 'Hero 11 Black' },
    { name: 'Samsonite' },
    { name: 'Coleman' },
    { name: 'Osprey' },
    { name: 'Sony', model: 'A7 IV' },
    { name: 'Nikon', model: 'Z6 II' },
    { name: 'Fjallraven' },
    { name: 'North Face' },
  ];

  const images = [
    '/images/camera.png',
    '/images/flycam.png',
    '/images/lều.png',
    '/images/vali.png',
    '/images/gopro.png',
    '/images/balo.png',
  ];

  // Tạo sản phẩm test cho từng filter
  const docs = [];
  // Chỉ seed khoảng 30 sản phẩm duy nhất
  const selectedCategories = categories.slice(0, 5); // 5 category
  const selectedDistricts = districts.slice(0, 2); // 2 quận
  const selectedConditions = conditions.slice(0, 3); // 3 tình trạng
  const selectedStatusArr = statusArr.slice(0, 2); // 2 trạng thái
  const selectedPrices = priceRanges.slice(0, 3); // 3 mức giá

  let idx = 1;
  for (let i = 0; i < 30; i++) {
    const cat = selectedCategories[i % selectedCategories.length];
    const district = selectedDistricts[i % selectedDistricts.length];
    const cond = selectedConditions[i % selectedConditions.length];
    const status = selectedStatusArr[i % selectedStatusArr.length];
    const price = selectedPrices[i % selectedPrices.length];
    const brand = brands[i % brands.length];
    const img = images[i % images.length];
    docs.push({
      title: `SP Test ${idx} - ${cat.name} - ${district} - ${cond} - ${status}`,
      description: `Sản phẩm test cho filter: ${cat.name}, ${district}, ${cond}, ${status}, giá ${price}`,
      category: cat._id,
      owner: owner._id,
      brand,
      condition: cond,
      images: [{ url: img, isMain: true }],
      pricing: {
        dailyRate: price,
        deposit: { amount: price * 5 },
        currency: 'VND',
        weeklyRate: price * 6,
        monthlyRate: price * 25
      },
      location: { address: { city: 'Đà Nẵng', district, province: 'Đà Nẵng' } },
      status,
      metrics: {
        viewCount: Math.floor(Math.random() * 1000),
        averageRating: (Math.random() * 5).toFixed(1),
        reviewCount: Math.floor(Math.random() * 50)
      }
    });
    idx++;
  }

  // Upsert by title để tránh trùng khi seed lại
  for (const doc of docs) {
    await Product.findOneAndUpdate({ title: doc.title }, doc, { upsert: true, new: true });
  }

  console.log(`Seeded ${docs.length} products for filter testing.`);
  await mongoose.connection.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});


