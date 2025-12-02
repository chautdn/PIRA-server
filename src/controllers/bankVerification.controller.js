const bankVerificationService = require('../services/bankVerification.service');
const responseUtils = require('../utils/response');

class BankVerificationController {
  /**
   * Get all bank accounts with filters
   * GET /api/admin/bank-accounts
   */
  async getAllBankAccounts(req, res) {
    try {
      const filters = {
        page: req.query.page || 1,
        limit: req.query.limit || 10,
        search: req.query.search,
        status: req.query.status,
        bankCode: req.query.bankCode
      };

      const result = await bankVerificationService.getAllBankAccounts(filters);
      return responseUtils.success(res, result, 'Lấy danh sách tài khoản ngân hàng thành công');
    } catch (error) {
      console.error('Error in getAllBankAccounts:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * Get bank account detail by user ID
   * GET /api/admin/bank-accounts/:userId
   */
  async getBankAccountById(req, res) {
    try {
      const { userId } = req.params;
      const result = await bankVerificationService.getBankAccountById(userId);
      return responseUtils.success(res, result, 'Lấy chi tiết tài khoản ngân hàng thành công');
    } catch (error) {
      console.error('Error in getBankAccountById:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * Verify bank account
   * PATCH /api/admin/bank-accounts/:userId/verify
   */
  async verifyBankAccount(req, res) {
    try {
      const { userId } = req.params;
      const { adminNote } = req.body;

      console.log('verifyBankAccount controller called');
      console.log('userId:', userId);
      console.log('adminNote:', adminNote);

      const result = await bankVerificationService.verifyBankAccount(userId, adminNote);
      return responseUtils.success(res, result, 'Xác minh tài khoản ngân hàng thành công');
    } catch (error) {
      console.error('Error in verifyBankAccount controller:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * Reject bank account verification
   * PATCH /api/admin/bank-accounts/:userId/reject
   */
  async rejectBankAccount(req, res) {
    try {
      const { userId } = req.params;
      const { rejectionReason } = req.body;

      if (!rejectionReason) {
        return responseUtils.error(res, 'Vui lòng nhập lý do từ chối', 400);
      }

      const result = await bankVerificationService.rejectBankAccount(userId, rejectionReason);
      return responseUtils.success(res, result, 'Từ chối xác minh tài khoản ngân hàng thành công');
    } catch (error) {
      console.error('Error in rejectBankAccount:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * Update bank account status
   * PATCH /api/admin/bank-accounts/:userId/status
   */
  async updateBankAccountStatus(req, res) {
    try {
      const { userId } = req.params;
      const { status, note } = req.body;

      if (!status) {
        return responseUtils.error(res, 'Trạng thái là bắt buộc', 400);
      }

      const result = await bankVerificationService.updateBankAccountStatus(userId, status, note);
      return responseUtils.success(res, result, 'Cập nhật trạng thái tài khoản ngân hàng thành công');
    } catch (error) {
      console.error('Error in updateBankAccountStatus:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }
}

module.exports = new BankVerificationController();
