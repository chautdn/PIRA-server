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
        if (global.chatGateway) {
          // Emit to user
          if (typeof global.chatGateway.emitToUser === 'function') {
            global.chatGateway.emitToUser(userId.toString(), {
              type: 'withdrawal-requested',
              withdrawal: {
                _id: withdrawal._id,
                amount: withdrawal.amount,
                status: withdrawal.status
              }
            });
          }

          // Broadcast to all admins (for admin panel)
          if (global.chatGateway.io) {
            global.chatGateway.io.emit('withdrawal-requested', {
              withdrawal: {
                _id: withdrawal._id,
                amount: withdrawal.amount,
                status: withdrawal.status,
                user: {
                  _id: req.user._id,
                  email: req.user.email,
                  profile: req.user.profile
                }
              },
              timestamp: new Date().toISOString()
            });
            console.log('📢 Broadcast withdrawal-requested to all admins');
          }
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

          // Emit notification update - fetch and send the latest notification
          if (typeof global.chatGateway.emitNotificationCount === 'function') {
            const notificationService = require('../services/notification.service');
            const Notification = require('../models/Notification');

            // Get the latest notification for this withdrawal
            const latestNotification = await Notification.findOne({
              recipient: withdrawal.user._id,
              relatedWithdrawal: withdrawal._id
            }).sort({ createdAt: -1 });

            // Emit the notification
            if (latestNotification && typeof global.chatGateway.emitNotification === 'function') {
              global.chatGateway.emitNotification(
                withdrawal.user._id.toString(),
                latestNotification
              );
            }

            // Emit unread count
            const unreadCount = await notificationService.getUnreadCount(withdrawal.user._id);
            global.chatGateway.emitNotificationCount(withdrawal.user._id.toString(), unreadCount);

            // Emit system wallet update for completed/rejected withdrawals
            if (
              ['completed', 'rejected'].includes(withdrawal.status) &&
              typeof global.chatGateway.emitSystemWalletUpdate === 'function'
            ) {
              const SystemWallet = require('../models/SystemWallet');
              const systemWallet = await SystemWallet.findOne({});
              if (systemWallet) {
                global.chatGateway.emitSystemWalletUpdate({
                  available: systemWallet.balance.available,
                  frozen: systemWallet.balance.frozen,
                  pending: systemWallet.balance.pending,
                  total:
                    systemWallet.balance.available +
                    systemWallet.balance.frozen +
                    systemWallet.balance.pending
                });
              }
            }
          }

          // Broadcast withdrawal update to all admins
          if (global.chatGateway.io) {
            global.chatGateway.io.emit('withdrawal-updated', {
              withdrawal: {
                _id: withdrawal._id,
                status: withdrawal.status,
                amount: withdrawal.amount,
                processedAt: withdrawal.processedAt,
                rejectionReason: withdrawal.rejectionReason,
                adminNote: withdrawal.adminNote,
                user: {
                  _id: withdrawal.user._id,
                  email: withdrawal.user.email
                }
              },
              timestamp: new Date().toISOString()
            });
            console.log('📢 Broadcast withdrawal-updated to all admins');
          }
        }
      } catch (socketError) {
        console.error('Failed to emit socket event:', socketError);
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
