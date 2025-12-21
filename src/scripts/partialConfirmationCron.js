const cron = require('node-cron');
const mongoose = require('mongoose');
const RentalOrderService = require('../services/rentalOrder.service');

/**
 * CRON JOB: Tự động reject các sản phẩm PENDING quá ownerConfirmationDeadline
 *
 * Chạy mỗi 10 phút để kiểm tra và xử lý các đơn hàng quá hạn
 * Khi quá hạn:
 * - Tất cả sản phẩm còn PENDING → tự động REJECTED
 * - Lý do: "Quá thời hạn xác nhận"
 * - Hoàn tiền ngay lập tức vào ví người thuê
 * - Cập nhật trạng thái MasterOrder
 */

// Cron expression: Chạy mỗi 10 phút
const CRON_SCHEDULE = '*/10 * * * *';

let cronJob = null;

/**
 * Khởi động cron job
 */
function startPartialConfirmationCron() {
  if (cronJob) {
    console.log('⚠️ Partial confirmation cron job is already running');
    return;
  }

  cronJob = cron.schedule(CRON_SCHEDULE, async () => {
    const startTime = Date.now();
    

    try {
      // Kiểm tra kết nối database
      if (mongoose.connection.readyState !== 1) {
        console.error('❌ Database is not connected. Skipping cron job execution.');
        return;
      }

      // Gọi service để xử lý các đơn hàng quá hạn
      await RentalOrderService.autoRejectExpiredPendingProducts();

      const duration = Date.now() - startTime;
    } catch (error) {
      console.error('\n❌ ============================================');
      console.error('❌ PARTIAL CONFIRMATION CRON JOB FAILED');
      console.error('❌ Error:', error.message);
      console.error('❌ Stack:', error.stack);
      console.error('❌ ============================================\n');
    }
  });

}

/**
 * Dừng cron job
 */
function stopPartialConfirmationCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  } else {
    console.log('⚠️ Partial confirmation cron job is not running');
  }
}

/**
 * Chạy thủ công (cho testing)
 */
async function runManually() {
  try {
    await RentalOrderService.autoRejectExpiredPendingProducts();
  } catch (error) {
    console.error('❌ Manual run failed:', error);
    throw error;
  }
}

module.exports = {
  startPartialConfirmationCron,
  stopPartialConfirmationCron,
  runManually
};
