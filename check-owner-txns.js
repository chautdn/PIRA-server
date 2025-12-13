require('dotenv').config();
const mongoose = require('mongoose');

async function simpleCheck() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✅ Connected to database\n');

    const Transaction = require('./src/models/Transaction');
    const ownerId = '693241bb8ad536adeb2f74f4';
    
    console.log('🔍 Checking transactions for owner:', ownerId);
    console.log('Looking for extension fee 40000 VND (90% = 36000 VND)\n');

    // Find recent transactions for this owner
    const txns = await Transaction.find({
      user: ownerId,
      type: 'TRANSFER_IN',
      createdAt: { $gte: new Date('2025-12-13T00:00:00Z') }
    }).sort({ createdAt: -1 }).lean();

    console.log(`Found ${txns.length} TRANSFER_IN transaction(s) today:\n`);
    
    txns.forEach((txn, idx) => {
      console.log(`${idx + 1}. Transaction ${txn._id}`);
      console.log(`   Amount: ${txn.amount.toLocaleString()} VND`);
      console.log(`   Status: ${txn.status}`);
      console.log(`   Description: ${txn.description}`);
      console.log(`   Metadata:`, JSON.stringify(txn.metadata, null, 2));
      console.log(`   Created: ${new Date(txn.createdAt).toLocaleString('vi-VN')}\n`);
    });

    // Check if extension payment exists
    const extensionPayment = txns.find(t => t.amount === 36000 || t.description.includes('Extension'));
    
    if (extensionPayment) {
      console.log('✅ Found extension payment!');
      console.log('   Transaction ID:', extensionPayment._id);
      console.log('   Has subOrderId in metadata?', !!extensionPayment.metadata?.subOrderId);
      
      if (!extensionPayment.metadata?.subOrderId) {
        console.log('\n❌ Problem: Transaction exists but missing subOrderId in metadata!');
        console.log('💡 This means the extension was approved BEFORE the code was updated.');
        console.log('💡 Solution: Manually update this transaction metadata or create a new test extension.');
      }
    } else {
      console.log('❌ No extension payment found (expected 36000 VND)');
      console.log('💡 The extension might not have been paid yet, or payment failed.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

simpleCheck();
