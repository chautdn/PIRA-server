const withdrawalService = require('../services/withdrawal.service');
const { SUCCESS, CREATED } = require('../core/success');

const withdrawalController = {
  // Request withdrawal
  requestWithdrawal: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const withdrawal = await withdrawalService.requestWithdrawal(userId, req.body);

      // Emit socket event for real-time update
      try {
        if (global.chatGateway && typeof global.chatGateway.emitToUser === 'function') {
          global.chatGateway.emitToUser(userId.toString(), {
            type: 'withdrawal-requested',
            withdrawal: {
              _id: withdrawal._id,
              amount: withdrawal.amount,
              status: withdrawal.status
            }
          });
        }
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError.message);
      }

      new CREATED({
        message: 'Withdrawal request submitted successfully',
        metadata: { withdrawal }
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Get user withdrawals
  getUserWithdrawals: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        status: req.query.status
      };

      const result = await withdrawalService.getUserWithdrawals(userId, options);

      new SUCCESS({
        message: 'Withdrawals retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Cancel withdrawal
  cancelWithdrawal: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const { id } = req.params;

      const withdrawal = await withdrawalService.cancelWithdrawal(id, userId);

      // Emit socket event
      try {
        if (global.chatGateway && typeof global.chatGateway.emitToUser === 'function') {
          global.chatGateway.emitToUser(userId.toString(), {
            type: 'withdrawal-cancelled',
            withdrawal: {
              _id: withdrawal._id,
              amount: withdrawal.amount,
              status: withdrawal.status
            }
          });
        }
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError.message);
      }

      new SUCCESS({
        message: 'Withdrawal cancelled successfully',
        metadata: { withdrawal }
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // Get daily total
  getDailyTotal: async (req, res, next) => {
    try {
      const userId = req.user._id;
      const total = await withdrawalService.getDailyTotal(userId);

      new SUCCESS({
        message: 'Daily total retrieved',
        metadata: { total }
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // ADMIN: Get all withdrawals
  getAllWithdrawals: async (req, res, next) => {
    try {
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        status: req.query.status,
        userId: req.query.userId
      };

      const result = await withdrawalService.getAllWithdrawals(options);

      new SUCCESS({
        message: 'Withdrawals retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  // ADMIN: Update withdrawal status
  updateWithdrawalStatus: async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminId = req.user._id;

      const withdrawal = await withdrawalService.updateWithdrawalStatus(id, adminId, req.body);

      // Emit socket event to user
      try {
        if (global.chatGateway && typeof global.chatGateway.emitToUser === 'function') {
          global.chatGateway.emitToUser(withdrawal.user._id.toString(), {
            type: 'withdrawal-updated',
            withdrawal: {
              _id: withdrawal._id,
              status: withdrawal.status,
              amount: withdrawal.amount,
              processedAt: withdrawal.processedAt,
              rejectionReason: withdrawal.rejectionReason
            }
          });
        }
      } catch (socketError) {
        console.warn('Failed to emit socket event:', socketError.message);
      }

      new SUCCESS({
        message: 'Withdrawal status updated successfully',
        metadata: { withdrawal }
      }).send(res);
    } catch (error) {
      next(error);
    }
  }
};

module.exports = withdrawalController;
