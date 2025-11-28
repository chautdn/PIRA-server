#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

const Shipment = require('./src/models/Shipment');
const SubOrder = require('./src/models/SubOrder');

async function migrateShippingFees() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pira-db');
    console.log('✅ Connected to MongoDB');

    // Find all shipments, prioritizing those with missing or zero fees
    const allShipments = await Shipment.find({}).populate({
      path: 'subOrder',
      select: 'pricing'
    });

    console.log(`\n📦 Found ${allShipments.length} total shipments`);

    let updated = 0;
    let alreadySet = 0;
    let skipped = 0;

    for (const shipment of allShipments) {
      if (!shipment.subOrder) {
        console.log(`⏭️  Skipping ${shipment.shipmentId}: SubOrder not found`);
        skipped++;
        continue;
      }

      const currentFee = shipment.fee || 0;
      // Use finalFee (after discount) if available, otherwise fall back to shippingFee
      const shippingFee = shipment.subOrder.shipping?.fee?.finalFee || shipment.subOrder.pricing?.shippingFee || 0;
      
      // If fee is already set and matches, skip
      if (currentFee > 0 && currentFee === shippingFee) {
        console.log(`✓ ${shipment.shipmentId} (${shipment.type}): fee already set = ${currentFee}đ`);
        alreadySet++;
        continue;
      }

      // If there's no shipping fee in SubOrder, skip
      if (shippingFee === 0) {
        console.log(`⏭️  Skipping ${shipment.shipmentId}: No shipping fee in SubOrder`);
        skipped++;
        continue;
      }

      // Update the shipment if fee is 0 or different
      if (currentFee !== shippingFee) {
        shipment.fee = shippingFee;
        await shipment.save();
        console.log(`✅ Updated ${shipment.shipmentId} (${shipment.type}): fee ${currentFee}đ → ${shippingFee}đ`);
        updated++;
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ✓ Already correct: ${alreadySet}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   Total: ${updated + alreadySet + skipped}`);

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

migrateShippingFees();
