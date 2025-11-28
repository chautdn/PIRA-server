const Transaction = require('../models/Transaction');
const SystemWallet = require('../models/SystemWallet');
const Wallet = require('../models/Wallet');

/**
 * Comprehensive transaction monitoring service
 * Tracks all transactions involving system wallet and provides analytics
 */
class TransactionMonitorService {
  
  /**
   * Record a transaction involving system wallet
   * @param {Object} transactionData - Transaction details
   * @param {String} transactionData.type - Transaction type
   * @param {Number} transactionData.amount - Transaction amount
   * @param {String} transactionData.description - Description
   * @param {ObjectId} transactionData.user - User ID
   * @param {Boolean} transactionData.fromSystemWallet - From system wallet
   * @param {Boolean} transactionData.toSystemWallet - To system wallet
   * @param {String} transactionData.systemWalletAction - System wallet action type
   * @param {ObjectId} transactionData.fromWallet - Source wallet ID
   * @param {ObjectId} transactionData.toWallet - Destination wallet ID
   * @param {Object} transactionData.metadata - Additional metadata
   */
  async recordSystemWalletTransaction(transactionData) {
    try {
      const transaction = new Transaction({
        user: transactionData.user,
        type: transactionData.type,
        amount: transactionData.amount,
        description: transactionData.description,
        status: transactionData.status || 'success',
        paymentMethod: transactionData.paymentMethod || 'system_wallet',
        
        // System wallet specific fields
        fromSystemWallet: transactionData.fromSystemWallet || false,
        toSystemWallet: transactionData.toSystemWallet || false,
        systemWalletAction: transactionData.systemWalletAction,
        fromWallet: transactionData.fromWallet,
        toWallet: transactionData.toWallet,
        
        // Additional data
        metadata: transactionData.metadata || {},
        reference: transactionData.reference,
        processedAt: new Date()
      });

      await transaction.save();
      return transaction;
    } catch (error) {
      console.error('❌ Error recording system wallet transaction:', error);
      throw error;
    }
  }

  /**
   * Get all transactions involving system wallet
   * @param {Object} filters - Filter options
   * @param {Number} limit - Results limit
   * @param {Number} page - Page number
   */
  async getAllSystemWalletTransactions(filters = {}, limit = 50, page = 1) {
    try {
      const skip = (page - 1) * limit;
      
      // Build query for transactions involving system wallet
      const query = {
        $or: [
          { fromSystemWallet: true },
          { toSystemWallet: true },
          { systemWalletAction: { $exists: true } }
        ]
      };

      // Apply additional filters
      if (filters.type) {
        query.type = filters.type;
      }
      
      if (filters.systemWalletAction) {
        query.systemWalletAction = filters.systemWalletAction;
      }
      
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = filters.startDate;
        if (filters.endDate) query.createdAt.$lte = filters.endDate;
      }

      if (filters.user) {
        query.user = filters.user;
      }

      // Execute query with population
      const transactions = await Transaction.find(query)
        .populate('user', 'email name phone')
        .populate('fromWallet', 'user balance.available')
        .populate('toWallet', 'user balance.available')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Transaction.countDocuments(query);
      const totalPages = Math.ceil(total / limit);

      // Enhance transactions with readable labels
      const enhancedTransactions = transactions.map(transaction => ({
        ...transaction,
        direction: this.getTransactionDirection(transaction),
        actionLabel: this.getSystemWalletActionLabel(transaction),
        typeLabel: this.getTransactionTypeLabel(transaction.type)
      }));

      return {
        transactions: enhancedTransactions,
        pagination: {
          total,
          page,
          limit,
          pages: totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('❌ Error getting system wallet transactions:', error);
      throw error;
    }
  }

  /**
   * Get transaction flow analytics
   * @param {Object} filters - Filter options
   */
  async getTransactionFlowAnalytics(filters = {}) {
    try {
      const matchStage = {
        $or: [
          { fromSystemWallet: true },
          { toSystemWallet: true }
        ]
      };

      if (filters.startDate || filters.endDate) {
        matchStage.createdAt = {};
        if (filters.startDate) matchStage.createdAt.$gte = filters.startDate;
        if (filters.endDate) matchStage.createdAt.$lte = filters.endDate;
      }

      const analytics = await Transaction.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            
            // Money flow
            totalInflow: {
              $sum: {
                $cond: [{ $eq: ['$toSystemWallet', true] }, '$amount', 0]
              }
            },
            totalOutflow: {
              $sum: {
                $cond: [{ $eq: ['$fromSystemWallet', true] }, '$amount', 0]
              }
            },
            
            // Transaction counts
            inflowCount: {
              $sum: {
                $cond: [{ $eq: ['$toSystemWallet', true] }, 1, 0]
              }
            },
            outflowCount: {
              $sum: {
                $cond: [{ $eq: ['$fromSystemWallet', true] }, 1, 0]
              }
            },
            
            // By action type
            actionBreakdown: {
              $push: {
                action: '$systemWalletAction',
                amount: '$amount',
                direction: {
                  $cond: [{ $eq: ['$toSystemWallet', true] }, 'inflow', 'outflow']
                }
              }
            }
          }
        },
        {
          $project: {
            totalInflow: 1,
            totalOutflow: 1,
            netFlow: { $subtract: ['$totalInflow', '$totalOutflow'] },
            inflowCount: 1,
            outflowCount: 1,
            totalTransactions: { $add: ['$inflowCount', '$outflowCount'] },
            actionBreakdown: 1
          }
        }
      ]);

      // Get action breakdown
      const actionStats = await Transaction.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              action: '$systemWalletAction',
              direction: {
                $cond: [{ $eq: ['$toSystemWallet', true] }, 'inflow', 'outflow']
              }
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            averageAmount: { $avg: '$amount' }
          }
        },
        {
          $group: {
            _id: '$_id.action',
            inflow: {
              $sum: {
                $cond: [{ $eq: ['$_id.direction', 'inflow'] }, '$totalAmount', 0]
              }
            },
            outflow: {
              $sum: {
                $cond: [{ $eq: ['$_id.direction', 'outflow'] }, '$totalAmount', 0]
              }
            },
            inflowCount: {
              $sum: {
                $cond: [{ $eq: ['$_id.direction', 'inflow'] }, '$count', 0]
              }
            },
            outflowCount: {
              $sum: {
                $cond: [{ $eq: ['$_id.direction', 'outflow'] }, '$count', 0]
              }
            }
          }
        }
      ]);

      const result = analytics[0] || {
        totalInflow: 0,
        totalOutflow: 0,
        netFlow: 0,
        inflowCount: 0,
        outflowCount: 0,
        totalTransactions: 0
      };

      return {
        ...result,
        actionBreakdown: actionStats,
        calculatedAt: new Date()
      };
    } catch (error) {
      console.error('❌ Error getting transaction flow analytics:', error);
      throw error;
    }
  }

  /**
   * Get recent system wallet activity summary
   * @param {Number} hours - Hours to look back (default: 24)
   */
  async getRecentActivity(hours = 24) {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);

      const recentTransactions = await Transaction.find({
        $or: [
          { fromSystemWallet: true },
          { toSystemWallet: true }
        ],
        createdAt: { $gte: startTime }
      })
        .populate('user', 'email name')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const summary = await Transaction.aggregate([
        {
          $match: {
            $or: [
              { fromSystemWallet: true },
              { toSystemWallet: true }
            ],
            createdAt: { $gte: startTime }
          }
        },
        {
          $group: {
            _id: null,
            totalInflow: {
              $sum: {
                $cond: [{ $eq: ['$toSystemWallet', true] }, '$amount', 0]
              }
            },
            totalOutflow: {
              $sum: {
                $cond: [{ $eq: ['$fromSystemWallet', true] }, '$amount', 0]
              }
            },
            transactionCount: { $sum: 1 }
          }
        }
      ]);

      const enhancedTransactions = recentTransactions.map(transaction => ({
        ...transaction,
        direction: this.getTransactionDirection(transaction),
        actionLabel: this.getSystemWalletActionLabel(transaction),
        typeLabel: this.getTransactionTypeLabel(transaction.type)
      }));

      return {
        period: `${hours} hours`,
        summary: summary[0] || { totalInflow: 0, totalOutflow: 0, transactionCount: 0 },
        recentTransactions: enhancedTransactions,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('❌ Error getting recent activity:', error);
      throw error;
    }
  }

  // Helper methods
  getTransactionDirection(transaction) {
    if (transaction.fromSystemWallet && transaction.toSystemWallet) {
      return 'internal';
    } else if (transaction.fromSystemWallet) {
      return 'outgoing';
    } else if (transaction.toSystemWallet) {
      return 'incoming';
    }
    return 'unknown';
  }

  getSystemWalletActionLabel(transaction) {
    const labels = {
      'revenue': 'Revenue Collection',
      'refund': 'User Refund',
      'fee_collection': 'Fee Collection',
      'penalty': 'Penalty Collection',
      'transfer_in': 'Transfer In',
      'transfer_out': 'Transfer Out',
      'manual_adjustment': 'Manual Adjustment'
    };
    return labels[transaction.systemWalletAction] || 'Unknown Action';
  }

  getTransactionTypeLabel(type) {
    const labels = {
      'deposit': 'Deposit',
      'withdrawal': 'Withdrawal',
      'payment': 'Payment',
      'refund': 'Refund',
      'penalty': 'Penalty',
      'order_payment': 'Order Payment',
      'PROMOTION_REVENUE': 'Promotion Revenue',
      'TRANSFER_IN': 'Transfer In',
      'TRANSFER_OUT': 'Transfer Out',
      'DEPOSIT': 'System Deposit',
      'WITHDRAWAL': 'System Withdrawal'
    };
    return labels[type] || type;
  }
}

module.exports = new TransactionMonitorService();