/**
 * Verify shipments were fixed
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function verify() {
  try {
    const uri = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.DB_NAME || process.env.MONGO_DB_NAME || 'PIRA_System';

    if (!uri) throw new Error('Missing MONGODB_URI');

    const conn = await mongoose.connect(uri, { dbName });
    console.log('✅ Connected\n');

    // Query raw MongoDB data
    const db = conn.connection.db;
    const shippings = await db.collection('shipments').find({}).toArray();

    console.log(`Found ${shippings.length} shipments\n`);

    for (const s of shippings) {
      console.log(`✅ Shipment: ${s.shipmentId}`);
      console.log(`   Type: ${s.type}`);
      console.log(`   Status: ${s.status}`);
      console.log(
        `   scheduledAt: ${s.scheduledAt ? new Date(s.scheduledAt).toLocaleDateString('vi-VN') : 'MISSING'}`
      );
      console.log('');
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

verify();
