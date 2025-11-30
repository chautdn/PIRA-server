const mongoose = require('mongoose');
require('dotenv').config();

const Shipment = require('./src/models/Shipment');

async function checkFees() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pira-db');
    console.log('Connected to MongoDB');

    const shipments = await Shipment.find({}).limit(10).select('shipmentId type fee').populate('subOrder', 'pricing');
    
    console.log('\nSample shipments with fees:');
    for (const s of shipments) {
      const subOrderFee = s.subOrder?.pricing?.shippingFee;
      console.log(`  ${s.shipmentId} (${s.type}): Shipment fee=${s.fee}, SubOrder shippingFee=${subOrderFee}`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkFees();
