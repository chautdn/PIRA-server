require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

async function createWalletsForExistingUsers() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pira');
    console.log('✅ Connected to MongoDB');

    // Find all users without wallets
    const usersWithoutWallets = await User.find({ wallet: { $exists: false } });
    console.log(`📊 Found ${usersWithoutWallets.length} users without wallets`);

    if (usersWithoutWallets.length === 0) {
      console.log('✅ All users already have wallets!');
      return;
    }

    // Create wallets for users without them
    for (const user of usersWithoutWallets) {
      console.log(`Creating wallet for user: ${user.email}`);

      // Create new wallet
      const wallet = new Wallet({
        user: user._id,
        balance: {
          available: 0,
          frozen: 0,
          pending: 0
        },
        currency: 'VND',
        status: 'ACTIVE'
      });

      await wallet.save();

      // Update user with wallet reference
      await User.findByIdAndUpdate(user._id, { wallet: wallet._id }, { new: false });

      console.log(`✅ Created wallet ${wallet._id} for user ${user.email}`);
    }

    console.log(`🎉 Successfully created wallets for ${usersWithoutWallets.length} users!`);

    // Verify all users now have wallets
    const remainingUsers = await User.find({ wallet: { $exists: false } });
    console.log(`📊 Users still without wallets: ${remainingUsers.length}`);
  } catch (error) {
    console.error('❌ Error creating wallets:', error);
  } finally {
    await mongoose.disconnect();
    console.log('💤 Disconnected from MongoDB');
    process.exit(0);
  }
}

createWalletsForExistingUsers();



