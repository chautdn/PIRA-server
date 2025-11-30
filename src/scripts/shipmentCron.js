const cron = require('node-cron');
const ShipmentService = require('../services/shipment.service');
const mongoose = require('mongoose');

// Run every hour
const CRON_SCHEDULE = '0 * * * *';

let cronJob = null;

function startShipmentCronJob() {
  if (cronJob) return;

  cronJob = cron.schedule(CRON_SCHEDULE, async () => {
    console.log('\n🕐 SHIPMENT CRON STARTED', new Date().toLocaleString('vi-VN'));
    try {
      if (mongoose.connection.readyState !== 1) {
        console.error('DB not connected, skipping shipment cron');
        return;
      }

      const result = await ShipmentService.autoConfirmDelivered(24);
      console.log('✅ Shipment cron processed:', result);
    } catch (err) {
      console.error('❌ Shipment cron failed:', err.message);
    }
  });

  console.log('✅ Shipment cron scheduled:', CRON_SCHEDULE);
}

function stopShipmentCronJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}

module.exports = { startShipmentCronJob, stopShipmentCronJob };
