/**
 * Migration script để cập nhật database cho luồng nghiệp vụ thuê mới
 * Chạy: node src/scripts/migrate-rental-system.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Contract = require('../models/Contract');
const User = require('../models/User');

async function connectDB() {
  try {
    await mongoose.connect(process.env.DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Kết nối MongoDB thành công');
  } catch (error) {
    console.error('❌ Lỗi kết nối MongoDB:', error.message);
    process.exit(1);
  }
}

async function migrateUserAddresses() {
  console.log('🔄 Cập nhật địa chỉ người dùng...');

  try {
    // Thêm trường latitude, longitude vào địa chỉ người dùng nếu chưa có
    await User.updateMany(
      { 'profile.address.latitude': { $exists: false } },
      {
        $set: {
          'profile.address.latitude': null,
          'profile.address.longitude': null
        }
      }
    );

    console.log('✅ Cập nhật địa chỉ người dùng thành công');
  } catch (error) {
    console.error('❌ Lỗi cập nhật địa chỉ:', error.message);
  }
}

async function createIndexes() {
  console.log('🔄 Tạo indexes cho hiệu suất...');

  try {
    // Indexes cho MasterOrder
    await MasterOrder.collection.createIndex({ renter: 1, status: 1 });
    await MasterOrder.collection.createIndex({ masterOrderNumber: 1 });
    await MasterOrder.collection.createIndex({
      'rentalPeriod.startDate': 1,
      'rentalPeriod.endDate': 1
    });

    // Indexes cho SubOrder
    await SubOrder.collection.createIndex({ masterOrder: 1, owner: 1 });
    await SubOrder.collection.createIndex({ subOrderNumber: 1 });
    await SubOrder.collection.createIndex({ owner: 1, status: 1 });

    // Indexes cho Contract
    await Contract.collection.createIndex({ contractNumber: 1 });
    await Contract.collection.createIndex({ order: 1 });

    console.log('✅ Tạo indexes thành công');
  } catch (error) {
    console.error('❌ Lỗi tạo indexes:', error.message);
  }
}

async function seedTestData() {
  console.log('🔄 Tạo dữ liệu test...');

  try {
    // Kiểm tra xem đã có dữ liệu test chưa
    const existingMasterOrder = await MasterOrder.findOne();
    if (existingMasterOrder) {
      console.log('⏭️ Đã có dữ liệu, bỏ qua seed');
      return;
    }

    // Tạo một số MasterOrder và SubOrder mẫu cho test
    console.log('💡 Tạo dữ liệu mẫu sẽ được thực hiện khi có users thật');
  } catch (error) {
    console.error('❌ Lỗi tạo dữ liệu test:', error.message);
  }
}

async function validateCollections() {
  console.log('🔄 Kiểm tra tính toàn vẹn dữ liệu...');

  try {
    // Kiểm tra các collection có tồn tại không
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map((col) => col.name);

    const requiredCollections = ['users', 'products', 'carts', 'contracts'];
    const missingCollections = requiredCollections.filter(
      (name) => !collectionNames.includes(name)
    );

    if (missingCollections.length > 0) {
      console.log('⚠️ Thiếu collections:', missingCollections.join(', '));
    } else {
      console.log('✅ Tất cả collections cần thiết đều tồn tại');
    }

    // Kiểm tra số lượng dữ liệu
    const userCount = await User.countDocuments();
    console.log(`📊 Số lượng users: ${userCount}`);

    const masterOrderCount = await MasterOrder.countDocuments();
    const subOrderCount = await SubOrder.countDocuments();
    const contractCount = await Contract.countDocuments();

    console.log(
      `📊 MasterOrders: ${masterOrderCount}, SubOrders: ${subOrderCount}, Contracts: ${contractCount}`
    );
  } catch (error) {
    console.error('❌ Lỗi kiểm tra dữ liệu:', error.message);
  }
}

async function runMigration() {
  console.log('🚀 Bắt đầu migration hệ thống thuê...\n');

  await connectDB();

  try {
    await migrateUserAddresses();
    await createIndexes();
    await seedTestData();
    await validateCollections();

    console.log('\n🎉 Migration hoàn tất thành công!');
    console.log('📋 Các tính năng mới:');
    console.log('  - Tạo đơn thuê từ giỏ hàng');
    console.log('  - Tính phí ship tự động với VietMap API');
    console.log('  - Hợp đồng điện tử 3 bên');
    console.log('  - Quản lý SubOrder theo chủ cho thuê');
    console.log('  - Ký hợp đồng với chữ ký số');
  } catch (error) {
    console.error('❌ Migration thất bại:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Ngắt kết nối database');
  }
}

// Chạy migration nếu được gọi trực tiếp
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
