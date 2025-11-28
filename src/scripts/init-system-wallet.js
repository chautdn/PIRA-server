const mongoose = require('mongoose');
const SystemWallet = require('../models/SystemWallet');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const initializeSystemWallet = async () => {
  try {
    // Connect to database
    const mongoUri = process.env.DATABASE_URL || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('DATABASE_URL or MONGODB_URI is not defined in .env file');
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if system wallet exists
    const existingWallet = await SystemWallet.findOne();
    
    if (existingWallet) {
      console.log('ℹ️  System wallet already exists:');
      console.log({
        name: existingWallet.name,
        available: existingWallet.balance.available,
        frozen: existingWallet.balance.frozen,
        pending: existingWallet.balance.pending,
        total: existingWallet.totalBalance,
        status: existingWallet.status
      });
      return;
    }

    // Create system wallet with initial balance
    const systemWallet = new SystemWallet({
      name: 'PIRA Platform Wallet',
      balance: {
        available: 100000000, // 100 million VND initial balance
        frozen: 0,
        pending: 0
      },
      currency: 'VND',
      status: 'ACTIVE',
      description: 'System wallet for platform operations - managed by administrators'
    });

    await systemWallet.save();

    console.log('✅ System wallet created successfully:');
    console.log({
      name: systemWallet.name,
      available: systemWallet.balance.available,
      frozen: systemWallet.balance.frozen,
      pending: systemWallet.balance.pending,
      total: systemWallet.totalBalance,
      status: systemWallet.status
    });

  } catch (error) {
    console.error('❌ Error initializing system wallet:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
};

// Run if called directly
if (require.main === module) {
  initializeSystemWallet()
    .then(() => {
      console.log('🎉 System wallet initialization complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 System wallet initialization failed:', error);
      process.exit(1);
    });
}

module.exports = initializeSystemWallet;
