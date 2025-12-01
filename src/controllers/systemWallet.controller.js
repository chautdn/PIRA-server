const systemWalletService = require('../services/systemWallet.service');
const responseUtils = require('../utils/response');

/**
 * SystemWalletController - Admin endpoints for managing platform wallet
 * All routes protected by requireRole('ADMIN')
 */
class SystemWalletController {
  /**
   * GET /api/admin/system-wallet/balance
   * Get system wallet balance and info
   */
  async getBalance(req, res) {
    try {
      const result = await systemWalletService.getBalance();
      return responseUtils.success(res, result, 'System wallet retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting system wallet balance:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * POST /api/admin/system-wallet/add-funds
   * Add funds to system wallet
   * Body: { amount: number, description?: string }
   */
  async addFunds(req, res) {
    try {
      const { amount, description } = req.body;

      if (!amount || amount <= 0) {
        return responseUtils.error(res, 'Amount must be a positive number', 400);
      }

      const result = await systemWalletService.addFunds(req.user._id, amount, description);

      return responseUtils.success(res, result, result.message);
    } catch (error) {
      console.error('❌ Error adding funds to system wallet:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * POST /api/admin/system-wallet/deduct-funds
   * Deduct funds from system wallet
   * Body: { amount: number, description?: string }
   */
  async deductFunds(req, res) {
    try {
      const { amount, description } = req.body;

      if (!amount || amount <= 0) {
        return responseUtils.error(res, 'Amount must be a positive number', 400);
      }

      const result = await systemWalletService.deductFunds(req.user._id, amount, description);

      return responseUtils.success(res, result, result.message);
    } catch (error) {
      console.error('❌ Error deducting funds from system wallet:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * POST /api/admin/system-wallet/transfer-to-user
   * Transfer from system wallet to user wallet
   * Body: { userId: string, amount: number, description?: string }
   */
  async transferToUser(req, res) {
    try {
      const { userId, amount, description } = req.body;

      if (!userId) {
        return responseUtils.error(res, 'userId is required', 400);
      }

      if (!amount || amount <= 0) {
        return responseUtils.error(res, 'Amount must be a positive number', 400);
      }

      const result = await systemWalletService.transferToUser(
        req.user._id,
        userId,
        amount,
        description
      );

      return responseUtils.success(res, result, result.message);
    } catch (error) {
      console.error('❌ Error transferring to user:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * POST /api/admin/system-wallet/transfer-from-user
   * Transfer from user wallet to system wallet
   * Body: { userId: string, amount: number, description?: string }
   */
  async transferFromUser(req, res) {
    try {
      const { userId, amount, description } = req.body;

      if (!userId) {
        return responseUtils.error(res, 'userId is required', 400);
      }

      if (!amount || amount <= 0) {
        return responseUtils.error(res, 'Amount must be a positive number', 400);
      }

      const result = await systemWalletService.transferFromUser(
        req.user._id,
        userId,
        amount,
        description
      );

      return responseUtils.success(res, result, result.message);
    } catch (error) {
      console.error('❌ Error transferring from user:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * GET /api/admin/system-wallet/transactions
   * Get system wallet transaction history with filtering
   * Query: ?limit=50&page=1&type=PROMOTION_REVENUE&startDate=2024-01-01&endDate=2024-12-31
   */
  async getTransactions(req, res) {
    try {
      const {
        limit = 50,
        page = 1,
        type,
        startDate,
        endDate
      } = req.query;

      const filters = {};
      if (type) filters.type = type;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);

      const result = await systemWalletService.getTransactionHistory(
        parseInt(limit),
        parseInt(page),
        filters
      );

      return responseUtils.success(res, result, 'Transaction history retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting system wallet transactions:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * GET /api/admin/system-wallet/statistics
   * Get system wallet transaction statistics
   * Query: ?period=30d&type=PROMOTION_REVENUE
   */
  async getStatistics(req, res) {
    try {
      const {
        period = '30d',
        type
      } = req.query;

      // Parse period (30d, 7d, 1y, etc.)
      const periodMap = {
        '7d': 7,
        '30d': 30,
        '90d': 90,
        '1y': 365
      };

      const days = periodMap[period] || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const filters = { startDate };
      if (type) filters.type = type;

      const result = await systemWalletService.getTransactionStats(filters);

      return responseUtils.success(res, {
        ...result,
        period,
        startDate
      }, 'Transaction statistics retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting system wallet statistics:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * PATCH /api/admin/system-wallet/status
   * Update system wallet status
   * Body: { status: 'ACTIVE' | 'SUSPENDED' | 'FROZEN' }
   */
  async updateStatus(req, res) {
    try {
      const { status } = req.body;

      if (!status) {
        return responseUtils.error(res, 'Status is required', 400);
      }

      const result = await systemWalletService.updateStatus(req.user._id, status);

      return responseUtils.success(res, result, result.message);
    } catch (error) {
      console.error('❌ Error updating system wallet status:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== COMPREHENSIVE TRANSACTION MONITORING ==========

  /**
   * GET /api/admin/system-wallet/all-transactions
   * Get ALL transactions involving system wallet
   * Query: ?limit=50&page=1&type=PROMOTION_REVENUE&systemWalletAction=revenue&startDate=2024-01-01&endDate=2024-12-31
   */
  async getAllTransactions(req, res) {
    try {
      const {
        limit = 50,
        page = 1,
        type,
        systemWalletAction,
        status,
        startDate,
        endDate,
        user
      } = req.query;

      const filters = {};
      if (type) filters.type = type;
      if (systemWalletAction) filters.systemWalletAction = systemWalletAction;
      if (status) filters.status = status;
      if (user) filters.user = user;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);

      const result = await systemWalletService.getAllSystemTransactions(
        filters,
        parseInt(limit),
        parseInt(page)
      );

      return responseUtils.success(res, result, 'All system wallet transactions retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting all system wallet transactions:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * GET /api/admin/system-wallet/flow-analytics
   * Get transaction flow analytics
   * Query: ?startDate=2024-01-01&endDate=2024-12-31
   */
  async getFlowAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const filters = {};
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);

      const result = await systemWalletService.getTransactionFlowAnalytics(filters);

      return responseUtils.success(res, result, 'Transaction flow analytics retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting flow analytics:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * GET /api/admin/system-wallet/recent-activity
   * Get recent system wallet activity
   * Query: ?hours=24
   */
  async getRecentActivity(req, res) {
    try {
      const hours = parseInt(req.query.hours) || 24;

      const result = await systemWalletService.getRecentActivity(hours);

      return responseUtils.success(res, result, 'Recent activity retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting recent activity:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * GET /api/admin/system-wallet/dashboard
   * Get comprehensive dashboard data
   * Query: ?period=30d
   */
  async getDashboard(req, res) {
    try {
      const period = req.query.period || '30d';

      const result = await systemWalletService.getDashboardData(period);

      return responseUtils.success(res, result, 'Dashboard data retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting dashboard data:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }
}

module.exports = new SystemWalletController();
