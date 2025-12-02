const adminTransactionService = require('../services/adminTransaction.service');
const responseUtils = require('../utils/response');

class AdminTransactionController {
  /**
   * Get all transactions with filters
   * GET /api/admin/transactions
   */
  async getAllTransactions(req, res) {
    try {
      const filters = {
        page: req.query.page || 1,
        limit: req.query.limit || 10,
        search: req.query.search,
        type: req.query.type,
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        minAmount: req.query.minAmount,
        maxAmount: req.query.maxAmount,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc'
      };

      const result = await adminTransactionService.getAllTransactions(filters);
      return responseUtils.success(res, result, 'Lấy danh sách giao dịch thành công');
    } catch (error) {
      console.error('Error in getAllTransactions:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * Get transaction by ID
   * GET /api/admin/transactions/:transactionId
   */
  async getTransactionById(req, res) {
    try {
      const { transactionId } = req.params;
      const result = await adminTransactionService.getTransactionById(transactionId);
      return responseUtils.success(res, result, 'Lấy thông tin giao dịch thành công');
    } catch (error) {
      console.error('Error in getTransactionById:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * Get transaction statistics
   * GET /api/admin/transactions/stats
   */
  async getTransactionStats(req, res) {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        period: req.query.period || 'day'
      };

      const result = await adminTransactionService.getTransactionStats(filters);
      return responseUtils.success(res, result, 'Lấy thống kê giao dịch thành công');
    } catch (error) {
      console.error('Error in getTransactionStats:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * Export transactions to CSV or JSON
   * GET /api/admin/transactions/export
   */
  async exportTransactions(req, res) {
    try {
      const filters = {
        type: req.query.type,
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };

      const format = req.query.format || 'csv';
      const result = await adminTransactionService.exportTransactions(filters, format);

      // Set appropriate headers for file download
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=transactions_${Date.now()}.csv`);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=transactions_${Date.now()}.json`);
      }

      return res.send(result);
    } catch (error) {
      console.error('Error in exportTransactions:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }
}

module.exports = new AdminTransactionController();
