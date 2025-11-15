require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../src/models/Category');

async function seedCategories() {
  try {
    console.log('🔧 Connecting to database...');
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✅ Connected to database');

    // Clear existing categories
    await Category.deleteMany({});
    console.log('🗑️ Cleared existing categories');

    // Parent categories
    const parentCategories = [
      {
        name: 'Máy ảnh & Quay phim',
        slug: 'may-anh-quay-phim',
        level: 0,
        priority: 10,
        status: 'ACTIVE'
      },
      {
        name: 'Thiết bị cắm trại',
        slug: 'thiet-bi-cam-trai',
        level: 0,
        priority: 9,
        status: 'ACTIVE'
      },
      {
        name: 'Vali & Túi xách',
        slug: 'vali-tui-xach',
        level: 0,
        priority: 8,
        status: 'ACTIVE'
      },
      {
        name: 'Thiết bị thể thao',
        slug: 'thiet-bi-the-thao',
        level: 0,
        priority: 7,
        status: 'ACTIVE'
      },
      {
        name: 'Phụ kiện du lịch',
        slug: 'phu-kien-du-lich',
        level: 0,
        priority: 6,
        status: 'ACTIVE'
      }
    ];

    // Create parent categories
    const createdParents = await Category.insertMany(parentCategories);
    console.log('✅ Created parent categories');

    // Subcategories for each parent
    const subcategories = [
      // Máy ảnh & Quay phim
      {
        name: 'Máy ảnh DSLR',
        slug: 'may-anh-dslr',
        parentCategory: createdParents[0]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      },
      {
        name: 'Máy ảnh mirrorless',
        slug: 'may-anh-mirrorless',
        parentCategory: createdParents[0]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      },
      {
        name: 'Action Camera',
        slug: 'action-camera',
        parentCategory: createdParents[0]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      },
      // Thiết bị cắm trại
      {
        name: 'Lều trại',
        slug: 'leu-trai',
        parentCategory: createdParents[1]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      },
      {
        name: 'Túi ngủ',
        slug: 'tui-ngu',
        parentCategory: createdParents[1]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      },
      {
        name: 'Bếp gas mini',
        slug: 'bep-gas-mini',
        parentCategory: createdParents[1]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      },
      // Vali & Túi xách
      {
        name: 'Vali kéo',
        slug: 'vali-keo',
        parentCategory: createdParents[2]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      },
      {
        name: 'Balo du lịch',
        slug: 'balo-du-lich',
        parentCategory: createdParents[2]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      },
      // Thiết bị thể thao
      {
        name: 'Xe đạp',
        slug: 'xe-dap',
        parentCategory: createdParents[3]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      },
      {
        name: 'Ván trượt',
        slug: 'van-truot',
        parentCategory: createdParents[3]._id,
        level: 1,
        priority: 5,
        status: 'ACTIVE'
      }
    ];

    await Category.insertMany(subcategories);
    console.log('✅ Created subcategories');

    console.log('🎉 Category seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    process.exit(1);
  }
}

seedCategories();
