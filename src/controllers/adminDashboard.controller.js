const adminDashboardService = require('../services/adminDashboard.service');
const responseUtils = require('../utils/response');

class AdminDashboardController {
  /**
   * Get dashboard statistics
   * @route GET /api/admin/dashboard
   */
  async getDashboard(req, res) {
    try {
      const dashboard = await adminDashboardService.getDashboardStats();
      return responseUtils.success(res, dashboard, 'Lấy thống kê dashboard thành công');
    } catch (error) {
      console.error('Error in getDashboard:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }
}

module.exports = new AdminDashboardController();
