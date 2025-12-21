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
    // Shipment cron started
    try {
      if (mongoose.connection.readyState !== 1) {
        // DB not connected, skipping shipment cron
        return;
      }

      const result = await ShipmentService.autoConfirmDelivered(24);
      // Shipment cron processed
    } catch (err) {
      // Shipment cron failed
    }
  });

  // Shipment cron scheduled

}

// Run notification email job every hour (01:00, 02:00, etc)
function startShipperNotificationEmailCronJob() {
  if (notificationCronJob) return;

  notificationCronJob = cron.schedule(CRON_SCHEDULE, async () => {
    // Shipper notification email cron started
    try {
      if (mongoose.connection.readyState !== 1) {
        // DB not connected, skipping shipper notification cron
        return;
      }

      const result = await shipperNotificationEmailJob();
      // Shipper notification email cron processed
    } catch (err) {
      // Shipper notification email cron failed
    }
  });

  // Shipper notification email cron scheduled
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
