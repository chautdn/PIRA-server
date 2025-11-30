const mongoose = require('mongoose');
require('dotenv').config();

const SubOrder = require('./src/models/SubOrder');
const Shipment = require('./src/models/Shipment');

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pira-db');
    console.log('Connected to MongoDB');

    const subOrders = await SubOrder.find({}).limit(5).select('subOrderNumber pricing');
    console.log(`\nFound ${subOrders.length} SubOrders:`);
    for (const so of subOrders) {
      console.log(`  ${so.subOrderNumber}: shippingFee=${so.pricing?.shippingFee}`);
    }

    const shipments = await Shipment.find({}).limit(5).select('shipmentId type fee');
    console.log(`\nFound ${shipments.length} Shipments:`);
    for (const s of shipments) {
      console.log(`  ${s.shipmentId} (${s.type}): fee=${s.fee}`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkData();
