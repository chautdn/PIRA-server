/**
 * Migration script to fix shipments without scheduledAt
 * 
 * Problem: Shipments created before the fix don't have scheduledAt value set
 * This script will:
 * 1. Find all shipments without scheduledAt
 * 2. Populate from the rental period of their subOrder
 * 3. Update the database
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Shipment = require('./src/models/Shipment');
const SubOrder = require('./src/models/SubOrder');

async function fixShipments() {
  try {
    // Connect to database
    const uri = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.DB_NAME || process.env.MONGO_DB_NAME || 'PIRA_System';
    
    if (!uri) {
      throw new Error('Missing MONGODB_URI in environment variables');
    }

    await mongoose.connect(uri, { dbName });
    console.log('✅ Connected to MongoDB');

    // Find all shipments without scheduledAt
    const shipmentsWithoutDate = await Shipment.find({
      scheduledAt: { $exists: false }
    }).populate('subOrder');

    console.log(`\n📦 Found ${shipmentsWithoutDate.length} shipments without scheduledAt`);

    if (shipmentsWithoutDate.length === 0) {
      console.log('✅ All shipments already have scheduledAt set!');
      await mongoose.connection.close();
      return;
    }

    let updated = 0;
    let failed = 0;

    for (const shipment of shipmentsWithoutDate) {
      try {
        let scheduledDate = null;

        // Get the rental period from subOrder
        // The rental period is nested in products[productIndex].rentalPeriod
        if (shipment.subOrder && shipment.productIndex !== undefined) {
          const product = shipment.subOrder.products?.[shipment.productIndex];
          const rentalPeriod = product?.rentalPeriod;
          
          if (rentalPeriod) {
            if (shipment.type === 'DELIVERY') {
              // DELIVERY: use startDate
              scheduledDate = rentalPeriod.startDate;
            } else if (shipment.type === 'RETURN') {
              // RETURN: use endDate
              scheduledDate = rentalPeriod.endDate;
            }
          }
        }

        if (!scheduledDate) {
          console.warn(`⚠️  [${shipment.shipmentId}] No rental period found (productIndex: ${shipment.productIndex}, products: ${shipment.subOrder?.products?.length || 0}) - skipping`);
          failed++;
          continue;
        }

        // Update the shipment
        shipment.scheduledAt = scheduledDate;
        await shipment.save();

        updated++;
        console.log(`✅ [${shipment.shipmentId}] Updated scheduledAt to ${new Date(scheduledDate).toLocaleDateString('vi-VN')} (Type: ${shipment.type})`);
      } catch (err) {
        failed++;
        console.error(`❌ [${shipment.shipmentId}] Error updating: ${err.message}`);
      }
    }

    console.log(`\n📊 Migration Complete:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total: ${updated + failed}`);

    // Verify the fix
    const stillMissing = await Shipment.find({
      scheduledAt: { $exists: false }
    }).countDocuments();

    if (stillMissing === 0) {
      console.log('\n✅ SUCCESS: All shipments now have scheduledAt!');
    } else {
      console.log(`\n⚠️  WARNING: ${stillMissing} shipments still missing scheduledAt`);
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

// Run the migration
fixShipments();
