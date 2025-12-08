/**
 * Script to seed ONLY Orders, SubOrders, and Transactions
 * Uses existing Users and Products from database
 * Creates data for last 3 months (90 days)
 *
 * Run: node src/scripts/seed-orders-only.js
 */

const mongoose = require('mongoose');
const path = require('path');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Transaction = require('../models/Transaction');

// Load .env from root directory
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.DATABASE_URL;

    if (!mongoUri) {
      console.error('❌ MONGO_URI not found in .env file!');
      console.log('Please create .env file in PIRA-server root with:');
      console.log('MONGO_URI=mongodb://localhost:27017/pira_db');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Generate random date within last N days
const randomDate = (daysAgo) => {
  const now = new Date();
  const date = new Date(now.getTime() - Math.random() * daysAgo * 24 * 60 * 60 * 1000);
  return date;
};

// Generate random number in range
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Get random item from array
const randomItem = (arr) => arr[randomInt(0, arr.length - 1)];

// Main seeding function
const seedOrders = async () => {
  try {
    console.log('🌱 Starting order seeding...\n');

    await connectDB();

    // Fetch existing users
    console.log('📝 Fetching existing users...');
    const owners = await User.find({ role: 'OWNER', status: 'ACTIVE' });
    const renters = await User.find({ role: 'RENTER', status: 'ACTIVE' });

    if (owners.length === 0 || renters.length === 0) {
      console.error('❌ No owners or renters found! Please create users first.');
      process.exit(1);
    }

    console.log(`✅ Found ${owners.length} owners and ${renters.length} renters`);

    // Fetch existing products
    console.log('\n📦 Fetching existing products...');
    const products = await Product.find({ status: 'ACTIVE' }).populate('owner');

    // Filter out products without valid owners
    const validProducts = products.filter((product) => product.owner && product.owner._id);

    if (validProducts.length === 0) {
      console.error('❌ No products with valid owners found! Please ensure products have owners.');
      process.exit(1);
    }

    console.log(`✅ Found ${validProducts.length} products with valid owners`);

    // Group products by owner
    const productsByOwner = {};
    validProducts.forEach((product) => {
      const ownerId = product.owner._id.toString();
      if (!productsByOwner[ownerId]) {
        productsByOwner[ownerId] = [];
      }
      productsByOwner[ownerId].push(product);
    });

    // Clear existing sample orders (optional - comment out if you want to keep)
    console.log('\n🗑️  Clearing existing sample orders...');
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    await SubOrder.deleteMany({ createdAt: { $gte: threeMonthsAgo } });
    await Order.deleteMany({ createdAt: { $gte: threeMonthsAgo } });
    console.log('✅ Cleared existing orders from last 3 months');

    // Create orders
    console.log('\n🛒 Creating orders for last 90 days...');
    const ordersToCreate = 100; // Create 100 orders
    let orderCount = 0;
    let subOrderCount = 0;

    for (let i = 1; i <= ordersToCreate; i++) {
      const renter = randomItem(renters);
      const createdAt = randomDate(90); // Last 90 days

      // Select 1-3 random products from DIFFERENT owners
      const numProducts = randomInt(1, 3);
      const selectedOwnerIds = new Set();
      const selectedProducts = [];

      // Get random owners who have products
      const availableOwnerIds = Object.keys(productsByOwner);

      while (
        selectedProducts.length < numProducts &&
        selectedOwnerIds.size < availableOwnerIds.length
      ) {
        const ownerId = randomItem(availableOwnerIds);

        if (!selectedOwnerIds.has(ownerId) && productsByOwner[ownerId].length > 0) {
          selectedOwnerIds.add(ownerId);
          const product = randomItem(productsByOwner[ownerId]);
          selectedProducts.push(product);
        }
      }

      if (selectedProducts.length === 0) {
        console.warn(`⚠️  Skipping order ${i} - no products available`);
        continue;
      }

      // Create MasterOrder
      const orderNumber = `ORD${Date.now()}${String(i).padStart(4, '0')}`;
      const masterOrder = await Order.create({
        masterOrderNumber: orderNumber,
        deliveryMethod: 'DELIVERY',
        renter: renter._id,
        status: 'COMPLETED',
        totalAmount: 0,
        totalShippingFee: 0,
        deliveryAddress: {
          // ✅ Thêm deliveryAddress
          contactPhone: renter.phone || '0123456789', // Use renter's phone or default
          streetAddress: renter.address?.streetAddress || '123 Đường ABC, Quận 1, TP.HCM', // Use renter's address or default
          ward: renter.address?.ward || 'Phường Bến Nghé',
          district: renter.address?.district || 'Quận 1',
          city: renter.address?.city || 'TP.HCM',
          country: renter.address?.country || 'Việt Nam'
        },
        createdAt,
        updatedAt: createdAt
      });

      let masterTotalAmount = 0;
      let masterTotalShipping = 0;

      // Create SubOrders for each selected product (different owners)
      for (let j = 0; j < selectedProducts.length; j++) {
        const product = selectedProducts[j];
        const quantity = randomInt(1, 2);
        const duration = randomInt(3, 30); // 3-30 days rental

        // Get pricing from product - use dailyRate and deposit.amount
        const rentalRate = product.pricing?.dailyRate || 100000;
        const depositRate = product.pricing?.deposit?.amount || 200000;
        const subtotalRental = rentalRate * quantity * duration;
        const subtotalDeposit = depositRate * quantity;
        const shippingFee = randomInt(20000, 100000);

        const subOrderNumber = `${orderNumber}-${j + 1}`;

        const subOrder = await SubOrder.create({
          subOrderNumber,
          masterOrder: masterOrder._id,
          owner: product.owner._id,
          products: [
            {
              product: product._id,
              quantity,
              rentalRate,
              depositRate,
              rentalPeriod: {
                startDate: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
                endDate: new Date(createdAt.getTime() + (duration + 1) * 24 * 60 * 60 * 1000),
                duration: { value: duration, unit: 'DAY' }
              },
              productStatus: 'COMPLETED',
              totalRental: subtotalRental,
              totalDeposit: subtotalDeposit,
              totalShippingFee: shippingFee
            }
          ],
          pricing: {
            subtotalRental,
            subtotalDeposit,
            shippingFee,
            totalAmount: subtotalRental + subtotalDeposit + shippingFee
          },
          shipping: {
            method: 'DELIVERY',
            fee: {
              baseFee: 10000,
              pricePerKm: 5000,
              totalFee: shippingFee,
              discount: 0,
              finalFee: shippingFee
            },
            distance: randomInt(5, 50),
            estimatedTime: randomInt(30, 120)
          },
          status: 'COMPLETED',
          createdAt,
          updatedAt: createdAt
        });

        masterTotalAmount += subtotalRental;
        masterTotalShipping += shippingFee;
        subOrderCount++;
      }

      // Update master order totals
      masterOrder.totalAmount = masterTotalAmount;
      masterOrder.totalShippingFee = masterTotalShipping;
      await masterOrder.save();

      orderCount++;

      if (i % 10 === 0) {
        console.log(
          `   Created ${i}/${ordersToCreate} orders (${subOrderCount} suborders so far)...`
        );
      }
    }

    console.log(`✅ Created ${orderCount} master orders and ${subOrderCount} suborders`);

    // Create promotion revenue transactions
    console.log('\n💰 Creating promotion revenue transactions...');
    const promotionTxCount = randomInt(10, 20);

    for (let i = 0; i < promotionTxCount; i++) {
      const randomOwner = owners[randomInt(0, owners.length - 1)];
      await Transaction.create({
        user: randomOwner._id,
        type: 'PROMOTION_REVENUE',
        amount: randomInt(100000, 500000),
        status: 'success',
        description: 'Doanh thu từ quảng cáo và khuyến mãi',
        createdAt: randomDate(90)
      });
    }

    console.log(`✅ Created ${promotionTxCount} promotion transactions`);

    // Create refund transactions
    console.log('\n💸 Creating refund transactions...');
    const refundTxCount = randomInt(5, 15);

    for (let i = 0; i < refundTxCount; i++) {
      const randomRenter = renters[randomInt(0, renters.length - 1)];
      await Transaction.create({
        user: randomRenter._id,
        type: 'refund',
        amount: randomInt(50000, 300000),
        status: 'success',
        description: 'Hoàn tiền cho khách hàng',
        createdAt: randomDate(90)
      });
    }

    console.log(`✅ Created ${refundTxCount} refund transactions`);

    // Summary
    console.log('\n✨ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Existing Owners: ${owners.length}`);
    console.log(`   - Existing Renters: ${renters.length}`);
    console.log(`   - Existing Products: ${products.length}`);
    console.log(`   - New Master Orders: ${orderCount}`);
    console.log(`   - New SubOrders: ${subOrderCount}`);
    console.log(`   - Promotion Transactions: ${promotionTxCount}`);
    console.log(`   - Refund Transactions: ${refundTxCount}`);
    console.log('\n🎉 You can now view rich statistics in the admin dashboard!');
  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the seeder
seedOrders();
