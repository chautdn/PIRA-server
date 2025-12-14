require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('./src/models/Transaction');

async function fixMetadata() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✅ Connected to database\n');

    const txnId = '693d8e344340deb9898eaa5d'; // Extension payment
    const subOrderId = '693d89e81c5e7b8589130974';
    
    console.log('🔧 Updating transaction metadata...');
    console.log(`   Transaction: ${txnId}`);
    console.log(`   SubOrder: ${subOrderId}\n`);

    const result = await Transaction.updateOne(
      { _id: txnId },
      {
        $set: {
          'metadata.subOrderId': new mongoose.Types.ObjectId(subOrderId),
          'metadata.action': 'RECEIVED_EXTENSION_FEE',
          'metadata.extensionDays': 2
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log('✅ Metadata updated successfully!\n');
      
      // Verify
      const txn = await Transaction.findById(txnId).lean();
      console.log('Updated metadata:', JSON.stringify(txn.metadata, null, 2));
      
      console.log('\n💡 Now you can run:');
      console.log(`   node test-unlock-frozen.js ${subOrderId} 10`);
    } else {
      console.log('❌ No changes made. Transaction might not exist.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

fixMetadata();
