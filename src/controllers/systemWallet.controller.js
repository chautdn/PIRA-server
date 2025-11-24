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
   * Get system wallet transaction history
   * Query: ?limit=50&page=1
   */
  async getTransactions(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const page = parseInt(req.query.page) || 1;

      const result = await systemWalletService.getTransactionHistory(limit, page);

      return responseUtils.success(res, result, 'Transaction history retrieved successfully');
    } catch (error) {
      console.error('❌ Error getting system wallet transactions:', error);
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
}

module.exports = new SystemWalletController();
