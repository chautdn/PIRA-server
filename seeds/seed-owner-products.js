const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const SubOrder = require('../src/models/SubOrder');
const MasterOrder = require('../src/models/MasterOrder');
const User = require('../src/models/User');
const Category = require('../src/models/Category');

// Owner ID from your data
const OWNER_ID = '6916e26eee73c5ebcb2f2f14';

// Sample product data with different scenarios
const createProducts = (categoryId) => [
  // Active product with no rental requests - can hide/delete
  {
    title: 'Canon EOS R6 Mark II',
    description:
      'Professional mirrorless camera with 24.2MP full-frame sensor. Perfect for photography and videography. Excellent condition, rarely used.',
    category: categoryId,
    brand: {
      name: 'Canon',
      model: 'EOS R6 Mark II'
    },
    condition: 'LIKE_NEW',
    images: [
      {
        url: 'https://res.cloudinary.com/dkq5xprqm/image/upload/v1/products/canon-r6',
        alt: 'Canon EOS R6 Mark II',
        isMain: true
      }
    ],
    pricing: {
      dailyRate: 150000,
      weeklyRate: 900000,
      monthlyRate: 3000000,
      deposit: {
        amount: 5000000,
        description: 'Full deposit refunded upon return in original condition'
      },
      currency: 'VND'
    },
    availability: {
      totalStock: 1,
      availableStock: 1
    },
    owner: OWNER_ID,
    status: 'ACTIVE',
    location: {
      address: {
        province: 'Thành Phố Đà Nẵng',
        district: 'Quận Hải Châu',
        streetAddress: '14 Nguyễn Trác'
      },
      coordinates: {
        type: 'Point',
        coordinates: [108.20845105000006, 16.043000772000028]
      }
    }
  },

  // Active product with pending rental request - cannot hide/delete
  {
    title: 'Sony A7 IV Camera Body',
    description:
      'Latest Sony full-frame mirrorless camera with 33MP sensor and advanced autofocus. Includes battery and charger.',
    category: categoryId,
    brand: {
      name: 'Sony',
      model: 'A7 IV'
    },
    condition: 'LIKE_NEW',
    images: [
      {
        url: 'https://res.cloudinary.com/dkq5xprqm/image/upload/v1/products/sony-a7iv',
        alt: 'Sony A7 IV',
        isMain: true
      }
    ],
    pricing: {
      dailyRate: 180000,
      weeklyRate: 1100000,
      monthlyRate: 3800000,
      deposit: {
        amount: 6000000,
        description: 'Full deposit refunded upon return'
      },
      currency: 'VND'
    },
    availability: {
      totalStock: 1,
      availableStock: 1
    },
    owner: OWNER_ID,
    status: 'ACTIVE',
    location: {
      address: {
        province: 'Thành Phố Đà Nẵng',
        district: 'Quận Hải Châu',
        streetAddress: '14 Nguyễn Trác'
      },
      coordinates: {
        type: 'Point',
        coordinates: [108.20845105000006, 16.043000772000028]
      }
    }
  },

  // Product with multiple quantities, some rented - can hide (won't affect rented items)
  {
    title: 'GoPro Hero 12 Black',
    description:
      'Latest action camera with 5.3K video recording. Waterproof up to 10m. Multiple units available for rent.',
    category: categoryId,
    brand: {
      name: 'GoPro',
      model: 'Hero 12 Black'
    },
    condition: 'GOOD',
    images: [
      {
        url: 'https://res.cloudinary.com/dkq5xprqm/image/upload/v1/products/gopro-12',
        alt: 'GoPro Hero 12',
        isMain: true
      }
    ],
    pricing: {
      dailyRate: 50000,
      weeklyRate: 300000,
      monthlyRate: 1000000,
      deposit: {
        amount: 1500000,
        description: 'Deposit for camera protection'
      },
      currency: 'VND'
    },
    availability: {
      totalStock: 3,
      availableStock: 1
    },
    owner: OWNER_ID,
    status: 'ACTIVE',
    location: {
      address: {
        province: 'Thành Phố Đà Nẵng',
        district: 'Quận Hải Châu',
        streetAddress: '14 Nguyễn Trác'
      },
      coordinates: {
        type: 'Point',
        coordinates: [108.20845105000006, 16.043000772000028]
      }
    }
  },

  // Hidden product (OWNER_HIDDEN) - visible to owner only
  {
    title: 'DJI Mavic 3 Pro Drone',
    description:
      'Professional drone with triple camera system. Currently hidden from public listing.',
    category: categoryId,
    brand: {
      name: 'DJI',
      model: 'Mavic 3 Pro'
    },
    condition: 'LIKE_NEW',
    images: [
      {
        url: 'https://res.cloudinary.com/dkq5xprqm/image/upload/v1/products/dji-mavic3',
        alt: 'DJI Mavic 3 Pro',
        isMain: true
      }
    ],
    pricing: {
      dailyRate: 200000,
      weeklyRate: 1200000,
      monthlyRate: 4200000,
      deposit: {
        amount: 8000000,
        description: 'High-value equipment protection deposit'
      },
      currency: 'VND'
    },
    availability: {
      totalStock: 1,
      availableStock: 1
    },
    owner: OWNER_ID,
    status: 'OWNER_HIDDEN',
    location: {
      address: {
        province: 'Thành Phố Đà Nẵng',
        district: 'Quận Hải Châu',
        streetAddress: '14 Nguyễn Trác'
      },
      coordinates: {
        type: 'Point',
        coordinates: [108.20845105000006, 16.043000772000028]
      }
    }
  },

  // Draft product
  {
    title: 'Nikon Z9 Flagship Camera',
    description: 'Professional flagship mirrorless camera. Still preparing listing details.',
    category: categoryId,
    brand: {
      name: 'Nikon',
      model: 'Z9'
    },
    condition: 'LIKE_NEW',
    images: [
      {
        url: 'https://res.cloudinary.com/dkq5xprqm/image/upload/v1/products/nikon-z9',
        alt: 'Nikon Z9',
        isMain: true
      }
    ],
    pricing: {
      dailyRate: 250000,
      weeklyRate: 1500000,
      monthlyRate: 5000000,
      deposit: {
        amount: 10000000,
        description: 'Premium flagship camera deposit'
      },
      currency: 'VND'
    },
    availability: {
      totalStock: 1,
      availableStock: 1
    },
    owner: OWNER_ID,
    status: 'DRAFT',
    location: {
      address: {
        province: 'Thành Phố Đà Nẵng',
        district: 'Quận Hải Châu',
        streetAddress: '14 Nguyễn Trác'
      },
      coordinates: {
        type: 'Point',
        coordinates: [108.20845105000006, 16.043000772000028]
      }
    }
  },

  // Active product with active rental - absolutely cannot delete
  {
    title: 'MacBook Pro 16" M3 Max',
    description:
      'Latest MacBook Pro with M3 Max chip, 64GB RAM, 2TB SSD. Perfect for video editing and development.',
    category: categoryId,
    brand: {
      name: 'Apple',
      model: 'MacBook Pro 16"'
    },
    condition: 'LIKE_NEW',
    images: [
      {
        url: 'https://res.cloudinary.com/dkq5xprqm/image/upload/v1/products/macbook-m3',
        alt: 'MacBook Pro M3',
        isMain: true
      }
    ],
    pricing: {
      dailyRate: 300000,
      weeklyRate: 1800000,
      monthlyRate: 6000000,
      deposit: {
        amount: 15000000,
        description: 'High-value laptop protection deposit'
      },
      currency: 'VND'
    },
    availability: {
      totalStock: 1,
      availableStock: 0
    },
    owner: OWNER_ID,
    status: 'RENTED',
    location: {
      address: {
        province: 'Thành Phố Đà Nẵng',
        district: 'Quận Hải Châu',
        streetAddress: '14 Nguyễn Trác'
      },
      coordinates: {
        type: 'Point',
        coordinates: [108.20845105000006, 16.043000772000028]
      }
    }
  }
];

async function seedOwnerProducts() {
  try {
    console.log('🌱 Starting owner product seeding...');

    // Connect to MongoDB
    await mongoose.connect(process.env.DATABASE_URL || 'mongodb://localhost:27017/PIRA_System');
    console.log('✅ Connected to MongoDB');

    // Verify owner exists
    const owner = await User.findById(OWNER_ID);
    if (!owner) {
      throw new Error(`Owner with ID ${OWNER_ID} not found`);
    }
    console.log(`✅ Found owner: ${owner.profile.firstName} ${owner.profile.lastName}`);

    // Get a category to use for all products
    const category = await Category.findOne({}); // Get any category
    if (!category) {
      throw new Error('No categories found. Please run category seeder first.');
    }
    console.log(`✅ Using category: ${category.name} (${category._id})`);

    // Create products with the category ID
    const products = createProducts(category._id);

    // Clear existing products for this owner
    const deletedProducts = await Product.deleteMany({ owner: OWNER_ID });
    console.log(`🗑️  Deleted ${deletedProducts.deletedCount} existing products`);

    // Clear existing orders for this owner
    await SubOrder.deleteMany({ owner: OWNER_ID });
    await MasterOrder.deleteMany({});
    console.log(`🗑️  Deleted existing orders`);

    // Insert products
    const insertedProducts = await Product.insertMany(products);
    console.log(`✅ Created ${insertedProducts.length} products`);

    // Create a test renter user if not exists
    let renter = await User.findOne({ email: 'renter@test.com' });
    if (!renter) {
      renter = await User.create({
        email: 'renter@test.com',
        password: '$2b$10$4u4L9L.0WzHzNK9TfP/u..xHmz.QVl6JqNarAYwk8otwfHXSXeanK',
        role: 'RENTER',
        status: 'ACTIVE',
        profile: {
          firstName: 'Test',
          lastName: 'Renter',
          gender: 'MALE'
        },
        address: {
          streetAddress: '123 Test Street',
          district: 'Quận 1',
          city: 'Thành Phố Hồ Chí Minh',
          province: 'Thành Phố Hồ Chí Minh',
          country: 'VN'
        },
        verification: {
          emailVerified: true,
          phoneVerified: false,
          identityVerified: false
        }
      });
      console.log('✅ Created test renter user');
    } else {
      console.log('✅ Found existing test renter');
    }

    // Create rental scenarios
    const now = Date.now();

    // Scenario 1: PENDING rental request for Sony A7 IV (index 1) - CANNOT hide/delete
    const sonyProduct = insertedProducts[1];
    const masterOrder1 = await MasterOrder.create({
      masterOrderNumber: `MO-${now}-1`,
      renter: renter._id,
      status: 'PENDING_CONFIRMATION',
      totalAmount: sonyProduct.pricing.dailyRate * 7 + sonyProduct.pricing.deposit.amount,
      totalDepositAmount: sonyProduct.pricing.deposit.amount,
      totalShippingFee: 0,
      paymentMethod: 'WALLET',
      deliveryMethod: 'PICKUP',
      paymentStatus: 'PAID'
    });

    const subOrder1 = await SubOrder.create({
      subOrderNumber: `SO-${now}-1`,
      masterOrder: masterOrder1._id,
      owner: OWNER_ID,
      products: [
        {
          product: sonyProduct._id,
          quantity: 1,
          rentalRate: sonyProduct.pricing.dailyRate,
          depositRate: sonyProduct.pricing.deposit.amount,
          rentalPeriod: {
            startDate: new Date(now + 2 * 24 * 60 * 60 * 1000),
            endDate: new Date(now + 9 * 24 * 60 * 60 * 1000),
            duration: { value: 7, unit: 'DAY' }
          },
          shipping: {
            method: 'PICKUP',
            fee: { totalFee: 0 }
          },
          confirmationStatus: 'PENDING',
          totalRental: sonyProduct.pricing.dailyRate * 7,
          totalDeposit: sonyProduct.pricing.deposit.amount,
          totalShippingFee: 0
        }
      ],
      pricing: {
        subtotalRental: sonyProduct.pricing.dailyRate * 7,
        subtotalDeposit: sonyProduct.pricing.deposit.amount,
        shippingFee: 0,
        totalAmount: sonyProduct.pricing.dailyRate * 7 + sonyProduct.pricing.deposit.amount
      },
      shipping: {
        method: 'PICKUP',
        fee: { totalFee: 0 }
      },
      status: 'PENDING_OWNER_CONFIRMATION',
      ownerConfirmation: {
        status: 'PENDING'
      }
    });

    masterOrder1.subOrders.push(subOrder1._id);
    await masterOrder1.save();
    console.log('✅ Created PENDING rental for Sony A7 IV');

    // Scenario 2: ACTIVE rental for MacBook (index 5) - CANNOT hide/delete
    const macbookProduct = insertedProducts[5];
    const masterOrder2 = await MasterOrder.create({
      masterOrderNumber: `MO-${now}-2`,
      renter: renter._id,
      status: 'ACTIVE',
      totalAmount: macbookProduct.pricing.dailyRate * 14 + macbookProduct.pricing.deposit.amount,
      totalDepositAmount: macbookProduct.pricing.deposit.amount,
      totalShippingFee: 0,
      paymentMethod: 'WALLET',
      deliveryMethod: 'PICKUP',
      paymentStatus: 'PAID'
    });

    const subOrder2 = await SubOrder.create({
      subOrderNumber: `SO-${now}-2`,
      masterOrder: masterOrder2._id,
      owner: OWNER_ID,
      products: [
        {
          product: macbookProduct._id,
          quantity: 1,
          rentalRate: macbookProduct.pricing.dailyRate,
          depositRate: macbookProduct.pricing.deposit.amount,
          rentalPeriod: {
            startDate: new Date(now - 3 * 24 * 60 * 60 * 1000),
            endDate: new Date(now + 11 * 24 * 60 * 60 * 1000),
            duration: { value: 14, unit: 'DAY' }
          },
          shipping: {
            method: 'PICKUP',
            fee: { totalFee: 0 }
          },
          confirmationStatus: 'CONFIRMED',
          confirmedAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
          totalRental: macbookProduct.pricing.dailyRate * 14,
          totalDeposit: macbookProduct.pricing.deposit.amount,
          totalShippingFee: 0
        }
      ],
      pricing: {
        subtotalRental: macbookProduct.pricing.dailyRate * 14,
        subtotalDeposit: macbookProduct.pricing.deposit.amount,
        shippingFee: 0,
        totalAmount: macbookProduct.pricing.dailyRate * 14 + macbookProduct.pricing.deposit.amount
      },
      shipping: {
        method: 'PICKUP',
        fee: { totalFee: 0 }
      },
      status: 'ACTIVE',
      ownerConfirmation: {
        status: 'CONFIRMED',
        confirmedAt: new Date(now - 4 * 24 * 60 * 60 * 1000)
      }
    });

    masterOrder2.subOrders.push(subOrder2._id);
    await masterOrder2.save();
    console.log('✅ Created ACTIVE rental for MacBook Pro');

    // Scenario 3: 2 ACTIVE rentals for GoPro (index 2) - can hide but CANNOT delete
    const goProProduct = insertedProducts[2];

    // First GoPro rental
    const masterOrder3 = await MasterOrder.create({
      masterOrderNumber: `MO-${now}-3`,
      renter: renter._id,
      status: 'ACTIVE',
      totalAmount: goProProduct.pricing.dailyRate * 5 + goProProduct.pricing.deposit.amount,
      totalDepositAmount: goProProduct.pricing.deposit.amount,
      totalShippingFee: 0,
      paymentMethod: 'WALLET',
      deliveryMethod: 'PICKUP',
      paymentStatus: 'PAID'
    });

    const subOrder3 = await SubOrder.create({
      subOrderNumber: `SO-${now}-3`,
      masterOrder: masterOrder3._id,
      owner: OWNER_ID,
      products: [
        {
          product: goProProduct._id,
          quantity: 1,
          rentalRate: goProProduct.pricing.dailyRate,
          depositRate: goProProduct.pricing.deposit.amount,
          rentalPeriod: {
            startDate: new Date(now - 1 * 24 * 60 * 60 * 1000),
            endDate: new Date(now + 4 * 24 * 60 * 60 * 1000),
            duration: { value: 5, unit: 'DAY' }
          },
          shipping: {
            method: 'PICKUP',
            fee: { totalFee: 0 }
          },
          confirmationStatus: 'CONFIRMED',
          confirmedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
          totalRental: goProProduct.pricing.dailyRate * 5,
          totalDeposit: goProProduct.pricing.deposit.amount,
          totalShippingFee: 0
        }
      ],
      pricing: {
        subtotalRental: goProProduct.pricing.dailyRate * 5,
        subtotalDeposit: goProProduct.pricing.deposit.amount,
        shippingFee: 0,
        totalAmount: goProProduct.pricing.dailyRate * 5 + goProProduct.pricing.deposit.amount
      },
      shipping: {
        method: 'PICKUP',
        fee: { totalFee: 0 }
      },
      status: 'ACTIVE',
      ownerConfirmation: {
        status: 'CONFIRMED',
        confirmedAt: new Date(now - 2 * 24 * 60 * 60 * 1000)
      }
    });

    masterOrder3.subOrders.push(subOrder3._id);
    await masterOrder3.save();

    // Second GoPro rental
    const masterOrder4 = await MasterOrder.create({
      masterOrderNumber: `MO-${now}-4`,
      renter: renter._id,
      status: 'ACTIVE',
      totalAmount: goProProduct.pricing.dailyRate * 3 + goProProduct.pricing.deposit.amount,
      totalDepositAmount: goProProduct.pricing.deposit.amount,
      totalShippingFee: 0,
      paymentMethod: 'WALLET',
      deliveryMethod: 'PICKUP',
      paymentStatus: 'PAID'
    });

    const subOrder4 = await SubOrder.create({
      subOrderNumber: `SO-${now}-4`,
      masterOrder: masterOrder4._id,
      owner: OWNER_ID,
      products: [
        {
          product: goProProduct._id,
          quantity: 1,
          rentalRate: goProProduct.pricing.dailyRate,
          depositRate: goProProduct.pricing.deposit.amount,
          rentalPeriod: {
            startDate: new Date(now),
            endDate: new Date(now + 3 * 24 * 60 * 60 * 1000),
            duration: { value: 3, unit: 'DAY' }
          },
          shipping: {
            method: 'PICKUP',
            fee: { totalFee: 0 }
          },
          confirmationStatus: 'CONFIRMED',
          confirmedAt: new Date(now - 1 * 24 * 60 * 60 * 1000),
          totalRental: goProProduct.pricing.dailyRate * 3,
          totalDeposit: goProProduct.pricing.deposit.amount,
          totalShippingFee: 0
        }
      ],
      pricing: {
        subtotalRental: goProProduct.pricing.dailyRate * 3,
        subtotalDeposit: goProProduct.pricing.deposit.amount,
        shippingFee: 0,
        totalAmount: goProProduct.pricing.dailyRate * 3 + goProProduct.pricing.deposit.amount
      },
      shipping: {
        method: 'PICKUP',
        fee: { totalFee: 0 }
      },
      status: 'ACTIVE',
      ownerConfirmation: {
        status: 'CONFIRMED',
        confirmedAt: new Date(now - 1 * 24 * 60 * 60 * 1000)
      }
    });

    masterOrder4.subOrders.push(subOrder4._id);
    await masterOrder4.save();
    console.log('✅ Created 2 ACTIVE rentals for GoPro (2/3 units)');

    // Update product availability
    await Product.findByIdAndUpdate(goProProduct._id, {
      'availability.availableStock': 1 // 3 total - 2 rented = 1 available
    });

    await Product.findByIdAndUpdate(macbookProduct._id, {
      'availability.availableStock': 0 // All rented
    });

    // Print summary
    console.log('\n📊 SEEDING SUMMARY:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Owner: ${owner.profile.firstName} ${owner.profile.lastName} (${owner.email})`);
    console.log(`Renter: ${renter.profile.firstName} ${renter.profile.lastName} (${renter.email})`);
    console.log('\n📦 PRODUCTS & RENTAL STATUS:');
    console.log('1. Canon EOS R6 Mark II - ACTIVE');
    console.log('   ✅ NO rentals → Can hide & delete');
    console.log('');
    console.log('2. Sony A7 IV - ACTIVE');
    console.log('   ⚠️  1 PENDING rental request');
    console.log('   ❌ CANNOT hide/delete until approved or rejected');
    console.log('');
    console.log('3. GoPro Hero 12 Black - ACTIVE (3 units)');
    console.log('   ⚠️  2 ACTIVE rentals (1 available)');
    console.log("   ⚠️  Can hide (won't affect active rentals)");
    console.log('   ❌ CANNOT delete (has active rentals)');
    console.log('');
    console.log('4. DJI Mavic 3 Pro - OWNER_HIDDEN');
    console.log('   🔒 Hidden from public, visible to owner');
    console.log('   ✅ Can unhide or delete (no rentals)');
    console.log('');
    console.log('5. Nikon Z9 - DRAFT');
    console.log('   📝 Not published yet');
    console.log('   ✅ Can delete or activate');
    console.log('');
    console.log('6. MacBook Pro M3 - RENTED');
    console.log('   🔴 1 ACTIVE rental (all units rented)');
    console.log('   ❌ CANNOT hide/delete (has active rental)');
    console.log('\n🔄 RENTAL ORDERS CREATED:');
    console.log(`- ${subOrder1.subOrderNumber}: Sony A7 IV (PENDING_OWNER_CONFIRMATION)`);
    console.log(`- ${subOrder2.subOrderNumber}: MacBook Pro (ACTIVE - in use)`);
    console.log(`- ${subOrder3.subOrderNumber}: GoPro #1 (ACTIVE - in use)`);
    console.log(`- ${subOrder4.subOrderNumber}: GoPro #2 (ACTIVE - in use)`);
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('✅ Full seeding completed with rental scenarios!');
    console.log('\n🧪 TEST SCENARIOS:');
    console.log('1. Try to hide Sony A7 IV → Should fail (pending request)');
    console.log('2. Try to delete MacBook → Should fail (active rental)');
    console.log('3. Try to delete GoPro → Should fail (has active rentals)');
    console.log('4. Try to hide GoPro → Should succeed (multi-unit product)');
    console.log('5. Try to hide/delete Canon → Should succeed (no rentals)');
    console.log('6. Try to unhide DJI Mavic → Should succeed');

    // Print summary
    console.log('\n📊 SEEDING SUMMARY:');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the seed function
seedOwnerProducts()
  .then(() => {
    console.log('🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
