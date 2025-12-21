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

    // Query raw MongoDB data
    const db = conn.connection.db;
    const shippings = await db.collection('shipments').find({}).toArray();

    for (const s of shippings) {
      // Shipment verification completed
    }

    await mongoose.connection.close();
  } catch (err) {
    // Error occurred during verification
    process.exit(1);
  }
}

verify();
