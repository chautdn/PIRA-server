require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('./src/models/Transaction');
const Wallet = require('./src/models/Wallet');
const User = require('./src/models/User');

async function manualUnlock() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✅ Connected to database\n');

    const subOrderId = process.argv[2] || '693d89e81c5e7b8589130974';
    
    console.log('🔓 Manually unlocking frozen funds for order:', subOrderId);
    console.log('⚠️  This simulates what would happen after 24h delay\n');

    // Find frozen transactions for this order
    const frozenTransactions = await Transaction.find({
      type: 'TRANSFER_IN',
      status: 'success',
      'metadata.subOrderId': new mongoose.Types.ObjectId(subOrderId),
      'metadata.action': { $in: ['RECEIVED_FROM_SYSTEM_FROZEN', 'RECEIVED_EXTENSION_FEE'] }
    }).populate('wallet user');

    if (frozenTransactions.length === 0) {
      console.log('❌ No frozen transactions found');
      process.exit(1);
    }

    console.log(`Found ${frozenTransactions.length} frozen transaction(s):\n`);
    
    let totalAmount = 0;
    const wallet = frozenTransactions[0].wallet;
    
    console.log('💰 Wallet BEFORE unlock:');
    console.log(`   Available: ${wallet.balance.available.toLocaleString()} VND`);
    console.log(`   Frozen: ${wallet.balance.frozen.toLocaleString()} VND`);
    console.log(`   Pending: ${wallet.balance.pending.toLocaleString()} VND\n`);

    frozenTransactions.forEach((txn, idx) => {
      totalAmount += txn.amount;
      console.log(`${idx + 1}. Transaction ${txn._id}`);
      console.log(`   Amount: ${txn.amount.toLocaleString()} VND`);
      console.log(`   Action: ${txn.metadata?.action}`);
      console.log(`   User: ${txn.user?.username || txn.user?._id}\n`);
    });

    console.log(`📊 Total to unlock: ${totalAmount.toLocaleString()} VND\n`);

    // Move funds from frozen to available
    console.log('🔓 Moving funds from frozen → available...');
    
    wallet.balance.frozen -= totalAmount;
    wallet.balance.available += totalAmount;
    await wallet.save();

    console.log('✅ Wallet updated!\n');
    
    console.log('💰 Wallet AFTER unlock:');
    console.log(`   Available: ${wallet.balance.available.toLocaleString()} VND (+${totalAmount.toLocaleString()})`);
    console.log(`   Frozen: ${wallet.balance.frozen.toLocaleString()} VND (-${totalAmount.toLocaleString()})`);
    console.log(`   Pending: ${wallet.balance.pending.toLocaleString()} VND\n`);

    // Update transaction metadata
    console.log('📝 Updating transaction metadata...');
    await Transaction.updateMany(
      { _id: { $in: frozenTransactions.map(t => t._id) } },
      {
        $set: {
          'metadata.unlockedAt': new Date(),
          'metadata.unlockReason': 'MANUAL_TEST'
        }
      }
    );

    console.log('✅ SUCCESS! Frozen funds unlocked and moved to available balance!');
    console.log('💡 In production, this would happen automatically 24h after order completion via Bull queue.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from database');
    process.exit(0);
  }
}

manualUnlock();
