/* Seed products into MongoDB without exposing a create product API */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
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

  const cameraCat = await ensureCategory('Máy ảnh & Quay phim');
  const campingCat = await ensureCategory('Thiết bị cắm trại');
  const luggageCat = await ensureCategory('Vali & Túi xách');

  const owner = await ensureOwner('seed-owner@pira.vn');

  const docs = [
    {
      title: 'Canon EOS R5 - Máy ảnh chuyên nghiệp',
      description: 'Máy ảnh mirrorless chuyên nghiệp với cảm biến 45MP, quay video 8K, chống rung in-body.',
      category: cameraCat._id,
      owner: owner._id,
      brand: { name: 'Canon', model: 'EOS R5' },
      condition: 'LIKE_NEW',
      images: [{ url: '/images/camera.png', isMain: true }],
      pricing: { dailyRate: 500000, deposit: { amount: 3000000 }, currency: 'VND' },
      location: { address: { city: 'Đà Nẵng', province: 'Đà Nẵng' } },
      status: 'ACTIVE'
    },
    {
      title: 'DJI Mavic Air 2 - Drone quay phim 4K',
      description: 'Flycam 4K với cảm biến 1 inch, thời gian bay 31 phút.',
      category: cameraCat._id,
      owner: owner._id,
      brand: { name: 'DJI', model: 'Mavic Air 2' },
      condition: 'GOOD',
      images: [{ url: '/images/flycam.png', isMain: true }],
      pricing: { dailyRate: 800000, deposit: { amount: 3000000 }, currency: 'VND' },
      location: { address: { city: 'Đà Nẵng', province: 'Đà Nẵng' } },
      status: 'ACTIVE'
    },
    {
      title: 'Lều cắm trại 4 người Coleman',
      description: 'Lều 4 người chống mưa tốt, dựng nhanh, phù hợp gia đình.',
      category: campingCat._id,
      owner: owner._id,
      brand: { name: 'Coleman' },
      condition: 'GOOD',
      images: [{ url: '/images/lều.png', isMain: true }],
      pricing: { dailyRate: 300000, deposit: { amount: 500000 }, currency: 'VND' },
      location: { address: { city: 'Đà Nẵng', province: 'Đà Nẵng' } },
      status: 'ACTIVE'
    },
    {
      title: 'Vali Samsonite 28 inch',
      description: 'Vali cỡ lớn 28 inch, vỏ polycarbonate bền, khóa TSA.',
      category: luggageCat._id,
      owner: owner._id,
      brand: { name: 'Samsonite' },
      condition: 'GOOD',
      images: [{ url: '/images/vali.png', isMain: true }],
      pricing: { dailyRate: 200000, deposit: { amount: 500000 }, currency: 'VND' },
      location: { address: { city: 'Đà Nẵng', province: 'Đà Nẵng' } },
      status: 'ACTIVE'
    },
    {
      title: 'GoPro Hero 11 Black',
      description: 'Action cam chống nước, quay 5.3K, ổn định HyperSmooth.',
      category: cameraCat._id,
      owner: owner._id,
      brand: { name: 'GoPro', model: 'Hero 11 Black' },
      condition: 'LIKE_NEW',
      images: [{ url: '/images/gopro.png', isMain: true }],
      pricing: { dailyRate: 400000, deposit: { amount: 1500000 }, currency: 'VND' },
      location: { address: { city: 'Đà Nẵng', province: 'Đà Nẵng' } },
      status: 'ACTIVE'
    },
    {
      title: 'Balo leo núi Osprey 65L',
      description: 'Balo trekking 65L, đệm lưng thoáng, khung trợ lực.',
      category: campingCat._id,
      owner: owner._id,
      brand: { name: 'Osprey' },
      condition: 'GOOD',
      images: [{ url: '/images/balo.png', isMain: true }],
      pricing: { dailyRate: 250000, deposit: { amount: 500000 }, currency: 'VND' },
      location: { address: { city: 'Đà Nẵng', province: 'Đà Nẵng' } },
      status: 'ACTIVE'
    }
  ];

  // Upsert by title to avoid duplicates when rerunning
  for (const doc of docs) {
    await Product.findOneAndUpdate({ title: doc.title }, doc, { upsert: true, new: true });
  }

  console.log(`Seeded ${docs.length} products successfully.`);
  await mongoose.connection.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});


