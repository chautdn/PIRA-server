const SystemWallet = require('../models/SystemWallet');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const transactionMonitor = require('./transactionMonitor.service');

/**
 * SystemWalletService - Admin operations for the platform wallet
 * All methods require admin authorization (checked in controller/routes)
 */
class SystemWalletService {
  /**
   * Get or create the system wallet
   */
  async getSystemWallet() {
    let systemWallet = await SystemWallet.findOne({});

    if (!systemWallet) {
      systemWallet = new SystemWallet({
        name: 'PIRA Platform Wallet',
        balance: {
          available: 0,
          frozen: 0,
          pending: 0
        },
        currency: 'VND',
        status: 'ACTIVE'
      });
      await systemWallet.save();
      console.log('✅ System wallet created');
    }

    return systemWallet;
  }

  /**
   * Get system wallet balance and stats
   */
  async getBalance() {
    const systemWallet = await this.getSystemWallet();

    return {
      walletId: systemWallet._id,
      name: systemWallet.name,
      balance: systemWallet.balance,
      totalBalance:
        systemWallet.balance.available + systemWallet.balance.frozen + systemWallet.balance.pending,
      currency: systemWallet.currency,
      status: systemWallet.status,
      lastModifiedAt: systemWallet.lastModifiedAt,
      updatedAt: systemWallet.updatedAt
    };
  }

  /**
   * Admin: Add funds to system wallet
   * Use case: Manual top-up, external deposits, etc.
   */
  async addFunds(adminId, amount, description = 'Admin deposit') {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const systemWallet = await SystemWallet.findOne({}).session(session);
      if (!systemWallet) {
        throw new Error('System wallet not found');
      }

      // Update balance
      systemWallet.balance.available += amount;
      systemWallet.lastModifiedBy = adminId;
      systemWallet.lastModifiedAt = new Date();
      await systemWallet.save({ session });

      // Create transaction record
      const transaction = new Transaction({
        type: 'DEPOSIT',
        amount: amount,
        status: 'COMPLETED',
        method: 'ADMIN_ACTION',
        description: description,
        metadata: {
          adminId: adminId,
          action: 'ADD_FUNDS',
          previousBalance: systemWallet.balance.available - amount,
          newBalance: systemWallet.balance.available
        }
      });
      await transaction.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        systemWallet: await this.getBalance(),
        transaction: transaction,
        message: `Added ${amount.toLocaleString()} VND to system wallet`
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Admin: Deduct funds from system wallet
   * Use case: Manual withdrawals, refunds, corrections
   */
  async deductFunds(adminId, amount, description = 'Admin withdrawal') {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const systemWallet = await SystemWallet.findOne({}).session(session);
      if (!systemWallet) {
        throw new Error('System wallet not found');
      }

      // Check sufficient balance
      if (systemWallet.balance.available < amount) {
        throw new Error(
          `Insufficient balance. Available: ${systemWallet.balance.available.toLocaleString()} VND`
        );
      }

      // Update balance
      systemWallet.balance.available -= amount;
      systemWallet.lastModifiedBy = adminId;
      systemWallet.lastModifiedAt = new Date();
      await systemWallet.save({ session });

      // Create transaction record
      const transaction = new Transaction({
        type: 'WITHDRAWAL',
        amount: amount,
        status: 'COMPLETED',
        method: 'ADMIN_ACTION',
        description: description,
        metadata: {
          adminId: adminId,
          action: 'DEDUCT_FUNDS',
          previousBalance: systemWallet.balance.available + amount,
          newBalance: systemWallet.balance.available
        }
      });
      await transaction.save({ session });

      await session.commitTransaction();

      return {
        success: true,
        systemWallet: await this.getBalance(),
        transaction: transaction,
        message: `Deducted ${amount.toLocaleString()} VND from system wallet`
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Admin: Transfer from system wallet to user wallet
   * Use case: Refunds, compensations, rewards
   */
  async transferToUser(adminId, userId, amount, description = 'Admin transfer to user') {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get system wallet
      const systemWallet = await SystemWallet.findOne({}).session(session);
      if (!systemWallet) {
        throw new Error('System wallet not found');
      }

      // Check sufficient balance
      if (systemWallet.balance.available < amount) {
        throw new Error(
          `Insufficient system wallet balance. Available: ${systemWallet.balance.available.toLocaleString()} VND`
        );
      }

      // Get user wallet
      const userWallet = await Wallet.findOne({ user: userId }).session(session);
      if (!userWallet) {
        throw new Error('User wallet not found');
      }

      // Deduct from system wallet
      systemWallet.balance.available -= amount;
      systemWallet.lastModifiedBy = adminId;
      systemWallet.lastModifiedAt = new Date();
      await systemWallet.save({ session });

      // Add to user wallet
      userWallet.balance.available += amount;
      await userWallet.save({ session });

      // Create transaction records
      const systemTransaction = new Transaction({
        type: 'TRANSFER_OUT',
        amount: amount,
        status: 'COMPLETED',
        method: 'ADMIN_ACTION',
        description: `Transfer to user ${userId}: ${description}`,
        metadata: {
          adminId: adminId,
          action: 'TRANSFER_TO_USER',
          recipientUserId: userId,
          recipientWalletId: userWallet._id
        }
      });

      const userTransaction = new Transaction({
        wallet: userWallet._id,
        type: 'TRANSFER_IN',
        amount: amount,
        status: 'COMPLETED',
        method: 'ADMIN_ACTION',
        description: `Received from system: ${description}`,
        metadata: {
          adminId: adminId,
          action: 'RECEIVED_FROM_SYSTEM',
          sourceWallet: 'SYSTEM'
        }
      });

      await systemTransaction.save({ session });
      await userTransaction.save({ session });

      await session.commitTransaction();

      // Emit socket update for user wallet
      if (global.chatGateway) {
        global.chatGateway.emitWalletUpdate(userId.toString(), {
          type: 'ADMIN_TRANSFER',
          amount: amount,
          newBalance: userWallet.balance.available
        });
      }

      return {
        success: true,
        systemWallet: await this.getBalance(),
        userWallet: {
          walletId: userWallet._id,
          userId: userId,
          newBalance: userWallet.balance.available
        },
        transactions: {
          system: systemTransaction,
          user: userTransaction
        },
        message: `Transferred ${amount.toLocaleString()} VND to user ${userId}`
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Add funds to system wallet from promotion payments (system operation)
   * Use case: Revenue from product promotions
   */
  async addPromotionRevenue(amount, description = 'Promotion payment revenue', userId = null, metadata = {}) {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const systemWallet = await SystemWallet.findOne({}).session(session);
      if (!systemWallet) {
        throw new Error('System wallet not found');
      }

      // Update balance
      const previousBalance = systemWallet.balance.available;
      systemWallet.balance.available += amount;
      systemWallet.lastModifiedAt = new Date();
      await systemWallet.save({ session });

      // Record transaction with enhanced tracking
      const transactionData = {
        user: userId || new mongoose.Types.ObjectId('000000000000000000000000'),
        type: 'PROMOTION_REVENUE',
        amount: amount,
        status: 'success',
        paymentMethod: 'system_wallet',
        description: description,
        toSystemWallet: true,
        systemWalletAction: 'revenue',
        metadata: {
          action: 'PROMOTION_REVENUE',
          previousBalance: previousBalance,
          newBalance: systemWallet.balance.available,
          isSystemTransaction: true,
          ...metadata
        }
      };

      const transaction = await transactionMonitor.recordSystemWalletTransaction(transactionData);

      await session.commitTransaction();

      return {
        success: true,
        systemWallet: await this.getBalance(),
        transaction: transaction,
        message: `Added ${amount.toLocaleString()} VND from promotion to system wallet`
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Admin: Transfer from user wallet to system wallet
   * Use case: Collect fees, penalties, etc.
   */
  async transferFromUser(adminId, userId, amount, description = 'Admin transfer from user') {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get system wallet
      const systemWallet = await SystemWallet.findOne({}).session(session);
      if (!systemWallet) {
        throw new Error('System wallet not found');
      }

      // Get user wallet
      const userWallet = await Wallet.findOne({ user: userId }).session(session);
      if (!userWallet) {
        throw new Error('User wallet not found');
      }

      // Check user has sufficient balance
      if (userWallet.balance.available < amount) {
        throw new Error(
          `User has insufficient balance. Available: ${userWallet.balance.available.toLocaleString()} VND`
        );
      }

      // Deduct from user wallet
      userWallet.balance.available -= amount;
      await userWallet.save({ session });

      // Add to system wallet
      systemWallet.balance.available += amount;
      systemWallet.lastModifiedBy = adminId;
      systemWallet.lastModifiedAt = new Date();
      await systemWallet.save({ session });

      // Create transaction records
      const systemTransaction = new Transaction({
        type: 'TRANSFER_IN',
        amount: amount,
        status: 'COMPLETED',
        method: 'ADMIN_ACTION',
        description: `Transfer from user ${userId}: ${description}`,
        metadata: {
          adminId: adminId,
          action: 'TRANSFER_FROM_USER',
          sourceUserId: userId,
          sourceWalletId: userWallet._id
        }
      });

      const userTransaction = new Transaction({
        wallet: userWallet._id,
        type: 'TRANSFER_OUT',
        amount: amount,
        status: 'COMPLETED',
        method: 'ADMIN_ACTION',
        description: `Transferred to system: ${description}`,
        metadata: {
          adminId: adminId,
          action: 'TRANSFERRED_TO_SYSTEM',
          destinationWallet: 'SYSTEM'
        }
      });

      await systemTransaction.save({ session });
      await userTransaction.save({ session });

      await session.commitTransaction();

      // Emit socket update for user wallet
      if (global.chatGateway) {
        global.chatGateway.emitWalletUpdate(userId.toString(), {
          type: 'ADMIN_DEDUCTION',
          amount: amount,
          newBalance: userWallet.balance.available
        });
      }

      return {
        success: true,
        systemWallet: await this.getBalance(),
        userWallet: {
          walletId: userWallet._id,
          userId: userId,
          newBalance: userWallet.balance.available
        },
        transactions: {
          system: systemTransaction,
          user: userTransaction
        },
        message: `Transferred ${amount.toLocaleString()} VND from user ${userId} to system wallet`
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Get system wallet transaction history
   * Includes all transactions involving system wallet operations
   */
  async getTransactionHistory(limit = 50, page = 1) {
    const skip = (page - 1) * limit;

    // Query for system wallet related transactions
    const query = {
      $or: [
        // Direct system wallet operations (admin actions)
        {
          'metadata.action': {
            $in: [
              'ADD_FUNDS',
              'DEDUCT_FUNDS',
              'TRANSFER_TO_USER',
              'TRANSFER_FROM_USER',
              'RECEIVED_FROM_SYSTEM',
              'TRANSFERRED_TO_SYSTEM'
            ]
          }
        },
        // System revenue transactions (promotions, fees, etc.)
        {
          'metadata.action': 'PROMOTION_REVENUE'
        },
        // System transactions by type
        {
          type: {
            $in: ['PROMOTION_REVENUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'DEPOSIT', 'WITHDRAWAL']
          }
        },
        // System placeholder user transactions
        {
          user: new mongoose.Types.ObjectId('000000000000000000000000')
        }
      ]
    };

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('user', 'email profile.firstName profile.lastName')
      .populate('wallet', 'balance.available')
      .lean();

    const total = await Transaction.countDocuments(query);

    // Add transaction type labels for admin UI
    const processedTransactions = transactions.map(transaction => ({
      ...transaction,
      typeLabel: this.getTransactionTypeLabel(transaction),
      isSystemTransaction: transaction.metadata?.isSystemTransaction || 
                          transaction.user?.toString() === '000000000000000000000000'
    }));

    return {
      transactions: processedTransactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get human-readable transaction type labels for admin interface
   */
  getTransactionTypeLabel(transaction) {
    const { type, metadata } = transaction;
    
    switch (type) {
      case 'PROMOTION_REVENUE':
        return 'Revenue from Product Promotion';
      case 'DEPOSIT':
        return metadata?.action === 'ADD_FUNDS' ? 'Admin Fund Addition' : 'Deposit';
      case 'WITHDRAWAL':
        return metadata?.action === 'DEDUCT_FUNDS' ? 'Admin Fund Deduction' : 'Withdrawal';
      case 'TRANSFER_IN':
        return 'Transfer from User to System';
      case 'TRANSFER_OUT':
        return 'Transfer from System to User';
      default:
        return metadata?.action ? metadata.action.replace(/_/g, ' ').toLowerCase() : type;
    }
  }

  /**
   * Get system wallet transaction statistics
   * Useful for admin dashboard analytics
   */
  async getTransactionStats(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          $or: [
            { 'metadata.action': 'PROMOTION_REVENUE' },
            { 'metadata.isSystemTransaction': true },
            { user: new mongoose.Types.ObjectId('000000000000000000000000') }
          ]
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgAmount: { $avg: '$amount' }
        }
      },
      {
        $sort: { totalAmount: -1 }
      }
    ]);

    const totalRevenue = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          type: 'PROMOTION_REVENUE',
          status: 'success'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    return {
      period: `Last ${days} days`,
      summary: stats,
      promotionRevenue: totalRevenue[0] || { totalRevenue: 0, transactionCount: 0 },
      startDate,
      endDate: new Date()
    };
  }

  /**
   * Update system wallet status
   */
  async updateStatus(adminId, newStatus) {
    const validStatuses = ['ACTIVE', 'SUSPENDED', 'FROZEN'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const systemWallet = await SystemWallet.findOne({});
    if (!systemWallet) {
      throw new Error('System wallet not found');
    }

    systemWallet.status = newStatus;
    systemWallet.lastModifiedBy = adminId;
    systemWallet.lastModifiedAt = new Date();
    await systemWallet.save();

    return {
      success: true,
      systemWallet: await this.getBalance(),
      message: `System wallet status updated to ${newStatus}`
    };
  }

  // ========== COMPREHENSIVE TRANSACTION MONITORING ==========

  /**
   * Get ALL transactions involving system wallet (in/out)
   */
  async getAllSystemTransactions(filters = {}, limit = 50, page = 1) {
    return await transactionMonitor.getAllSystemWalletTransactions(filters, limit, page);
  }

  /**
   * Get transaction flow analytics for system wallet
   */
  async getTransactionFlowAnalytics(filters = {}) {
    return await transactionMonitor.getTransactionFlowAnalytics(filters);
  }

  /**
   * Get recent system wallet activity
   */
  async getRecentActivity(hours = 24) {
    return await transactionMonitor.getRecentActivity(hours);
  }

  /**
   * Record a manual transaction for system wallet
   */
  async recordManualTransaction(transactionData) {
    return await transactionMonitor.recordSystemWalletTransaction({
      ...transactionData,
      systemWalletAction: transactionData.systemWalletAction || 'manual_adjustment'
    });
  }

  /**
   * Get system wallet dashboard data
   */
  async getDashboardData(period = '30d') {
    try {
      // Get basic balance info
      const balance = await this.getBalance();
      
      // Get transaction flow analytics
      const periodMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      const days = periodMap[period] || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const flowAnalytics = await this.getTransactionFlowAnalytics({ startDate });
      const recentActivity = await this.getRecentActivity(24);
      
      // Get transaction breakdown by type
      const typeBreakdown = await Transaction.aggregate([
        {
          $match: {
            $or: [
              { fromSystemWallet: true },
              { toSystemWallet: true }
            ],
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        {
          $sort: { totalAmount: -1 }
        }
      ]);

      return {
        period,
        balance,
        flowAnalytics,
        recentActivity: recentActivity.summary,
        typeBreakdown,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('❌ Error getting dashboard data:', error);
      throw error;
    }
  }
}

module.exports = new SystemWalletService();
