const cron = require('node-cron');
const ShipmentService = require('../services/shipment.service');
const { shipperNotificationEmailJob } = require('../jobs/shipperNotificationEmail.job');
const mongoose = require('mongoose');

// Run every hour
const CRON_SCHEDULE = '0 * * * *';

let cronJob = null;
let notificationCronJob = null;

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

// Run notification email job every hour (01:00, 02:00, etc)
function startShipperNotificationEmailCronJob() {
  if (notificationCronJob) return;

  notificationCronJob = cron.schedule(CRON_SCHEDULE, async () => {
    console.log('\n🕐 SHIPPER NOTIFICATION EMAIL CRON STARTED', new Date().toLocaleString('vi-VN'));
    try {
      if (mongoose.connection.readyState !== 1) {
        console.error('DB not connected, skipping shipper notification cron');
        return;
      }

      const result = await shipperNotificationEmailJob();
      console.log('✅ Shipper notification email cron processed:', result);
    } catch (err) {
      console.error('❌ Shipper notification email cron failed:', err.message);
    }
  });

  console.log('✅ Shipper notification email cron scheduled:', CRON_SCHEDULE);
}

function stopShipmentCronJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}

function stopShipperNotificationEmailCronJob() {
  if (notificationCronJob) {
    notificationCronJob.stop();
    notificationCronJob = null;
  }
}

module.exports = { 
  startShipmentCronJob, 
  stopShipmentCronJob,
  startShipperNotificationEmailCronJob,
  stopShipperNotificationEmailCronJob
};
