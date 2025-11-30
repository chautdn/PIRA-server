/**
 * Migration script to update all wallet display fields
 * Run: node update-wallet-display.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Wallet = require('./src/models/Wallet');

async function updateAllWalletDisplays() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pira');
    console.log('✅ Connected to database');

    // Find all wallets
    const wallets = await Wallet.find({});
    console.log(`📊 Found ${wallets.length} wallets to update`);

    let updatedCount = 0;

    for (const wallet of wallets) {
      // Calculate display
      const newDisplay = (wallet.balance.available || 0) + (wallet.balance.frozen || 0);
      
      // Check if different
      if (wallet.balance.display !== newDisplay) {
        wallet.balance.display = newDisplay;
        await wallet.save();
        updatedCount++;
        
        console.log(`✅ Updated wallet ${wallet._id}: display = ${newDisplay} (available: ${wallet.balance.available}, frozen: ${wallet.balance.frozen})`);
      }
    }

    console.log(`\n✅ Migration complete! Updated ${updatedCount} wallets`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateAllWalletDisplays();
