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
    console.log('\n🕐 ============================================');
    console.log('🕐 PARTIAL CONFIRMATION CRON JOB STARTED');
    console.log(`🕐 Time: ${new Date().toLocaleString('vi-VN')}`);
    console.log('🕐 ============================================\n');

    try {
      // Kiểm tra kết nối database
      if (mongoose.connection.readyState !== 1) {
        console.error('❌ Database is not connected. Skipping cron job execution.');
        return;
      }

      // Gọi service để xử lý các đơn hàng quá hạn
      await RentalOrderService.autoRejectExpiredPendingProducts();

      const duration = Date.now() - startTime;
      console.log('\n✅ ============================================');
      console.log('✅ PARTIAL CONFIRMATION CRON JOB COMPLETED');
      console.log(`✅ Duration: ${duration}ms`);
      console.log('✅ ============================================\n');
    } catch (error) {
      console.error('\n❌ ============================================');
      console.error('❌ PARTIAL CONFIRMATION CRON JOB FAILED');
      console.error('❌ Error:', error.message);
      console.error('❌ Stack:', error.stack);
      console.error('❌ ============================================\n');
    }
  });

  console.log('✅ Partial confirmation cron job started successfully');
  console.log(`📅 Schedule: ${CRON_SCHEDULE} (every 10 minutes)`);
}

/**
 * Dừng cron job
 */
function stopPartialConfirmationCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('⏹️ Partial confirmation cron job stopped');
  } else {
    console.log('⚠️ Partial confirmation cron job is not running');
  }
}

/**
 * Chạy thủ công (cho testing)
 */
async function runManually() {
  console.log('🔧 Running partial confirmation cron job manually...');
  try {
    await RentalOrderService.autoRejectExpiredPendingProducts();
    console.log('✅ Manual run completed successfully');
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
