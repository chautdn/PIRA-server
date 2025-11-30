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
      // Check if we have a valid admin user to assign this transaction to
      let transactionUser = null;
      if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
        transactionUser = adminId;
      } else {
        // If no valid admin, skip transaction creation (system operation)
        // Or you could create a placeholder system user in your DB
        console.warn('⚠️ addFunds: No valid admin ObjectId provided, skipping transaction creation');
      }

      if (transactionUser) {
        const transaction = new Transaction({
          user: transactionUser,
          wallet: systemWallet._id,
          type: 'deposit',
          amount: amount,
          status: 'success',
          paymentMethod: 'wallet',
          description: description,
          metadata: {
            adminId: adminId,
            action: 'ADD_FUNDS',
            previousBalance: systemWallet.balance.available - amount,
            newBalance: systemWallet.balance.available
          }
        });
        await transaction.save({ session });
      }

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
      // Check if we have a valid admin user to assign this transaction to
      let transactionUser = null;
      if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
        transactionUser = adminId;
      } else {
        // If no valid admin, skip transaction creation (system operation)
        console.warn('⚠️ deductFunds: No valid admin ObjectId provided, skipping transaction creation');
      }

      if (transactionUser) {
        const transaction = new Transaction({
          user: transactionUser,
          wallet: systemWallet._id,
          type: 'withdrawal',
          amount: amount,
          status: 'success',
          paymentMethod: 'wallet',
          description: description,
          metadata: {
            adminId: adminId,
            action: 'DEDUCT_FUNDS',
            previousBalance: systemWallet.balance.available + amount,
            newBalance: systemWallet.balance.available
          }
        });
        await transaction.save({ session });
      }

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
      // Get or create system wallet within transaction session
      let systemWallet = await SystemWallet.findOne({}).session(session);
      if (!systemWallet) {
        // Create a system wallet record as part of this transaction
        systemWallet = new SystemWallet({
          name: 'PIRA Platform Wallet',
          balance: { available: 0, frozen: 0, pending: 0 },
          currency: 'VND',
          status: 'ACTIVE'
        });
        await systemWallet.save({ session });
        console.log('Created system wallet inside transferToUser transaction');
      }

      // Check sufficient balance
      if (systemWallet.balance.available < amount) {
        throw new Error(
          `Insufficient system wallet balance. Available: ${systemWallet.balance.available.toLocaleString()} VND`
        );
      }

      // Get user wallet, or create if not exists
      let userWallet = await Wallet.findOne({ user: userId }).session(session);
      if (!userWallet) {
        console.log(`📝 User wallet not found for ${userId}, creating new wallet...`);
        userWallet = new Wallet({
          user: userId,
          balance: { available: 0, frozen: 0, pending: 0 },
          currency: 'VND',
          status: 'ACTIVE'
        });
        await userWallet.save({ session });
        console.log(`✅ Created user wallet for ${userId}`);
      }

      // Deduct from system wallet
      systemWallet.balance.available -= amount;
      // Only set lastModifiedBy if adminId is a valid ObjectId
      if (adminId && adminId !== 'SYSTEM_AUTO_TRANSFER' && adminId !== null) {
        systemWallet.lastModifiedBy = adminId;
      }
      systemWallet.lastModifiedAt = new Date();
      await systemWallet.save({ session });

      // Add to user wallet
      userWallet.balance.available += amount;
      await userWallet.save({ session });

      // Create transaction records
      // Create transaction records compatible with Transaction schema
      const systemTransaction = new Transaction({
        user: adminId && adminId !== 'SYSTEM_AUTO_TRANSFER' ? adminId : userId, // audit: admin if available, else fallback to recipient
        wallet: systemWallet._id,
        type: 'TRANSFER_OUT',
        amount: amount,
        status: 'success',
        paymentMethod: 'system_wallet',
        description: `Transfer to user ${userId}: ${description}`,
        fromSystemWallet: true,
        toWallet: userWallet._id,
        systemWalletAction: 'transfer_out',
        metadata: {
          adminId: adminId,
          action: 'TRANSFER_TO_USER',
          recipientUserId: userId,
          recipientWalletId: userWallet._id
        }
      });

      const userTransaction = new Transaction({
        user: userId,
        wallet: userWallet._id,
        type: 'TRANSFER_IN',
        amount: amount,
        status: 'success',
        paymentMethod: 'system_wallet',
        description: `Received from system: ${description}`,
        fromSystemWallet: true,
        toWallet: userWallet._id,
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

      // Create transaction record
      // Only create system transaction if we have a valid admin ObjectId
      let systemTransaction = null;
      if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
        systemTransaction = new Transaction({
          user: adminId,  // Admin user for audit trail
          wallet: systemWallet._id,
          type: 'withdrawal',
          amount: amount,
          status: 'success',
          paymentMethod: 'wallet',
          description: `Transfer from user ${userId}: ${description}`,
          metadata: {
            adminId: adminId,
            action: 'TRANSFER_FROM_USER',
            sourceUserId: userId,
            sourceWalletId: userWallet._id
          }
        });
        await systemTransaction.save({ session });
      }

      const userTransaction = new Transaction({
        user: userId,
        wallet: userWallet._id,
        type: 'withdrawal',
        amount: amount,
        status: 'success',
        paymentMethod: 'wallet',
        description: `Transferred to system: ${description}`,
        metadata: {
          adminId: adminId,
          action: 'TRANSFERRED_TO_SYSTEM',
          destinationWallet: 'SYSTEM'
        }
      });
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

  /**
   * Transfer rental fee with platform fee tracking
   * Splits the amount: ownerShare (80%) to owner, platformFee (20%) stays in system
   * Creates separate transaction records for audit trail
   */
  async transferRentalFeeWithPlatformFee(adminId, ownerId, totalRentalAmount, subOrderNumber) {
    if (totalRentalAmount <= 0) {
      throw new Error('Rental amount must be positive');
    }

    const platformFeePercentage = 0.20; // 20% fee
    const ownerSharePercentage = 0.80;  // 80% to owner
    const platformFeeAmount = Math.round(totalRentalAmount * platformFeePercentage);
    const ownerShareAmount = Math.round(totalRentalAmount * ownerSharePercentage);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get or create system wallet
      let systemWallet = await SystemWallet.findOne({}).session(session);
      if (!systemWallet) {
        systemWallet = new SystemWallet({
          name: 'PIRA Platform Wallet',
          balance: { available: 0, frozen: 0, pending: 0 },
          currency: 'VND',
          status: 'ACTIVE'
        });
        await systemWallet.save({ session });
      }

      // Check sufficient balance
      if (systemWallet.balance.available < totalRentalAmount) {
        throw new Error(
          `Insufficient system wallet balance for rental fee transfer. Available: ${systemWallet.balance.available.toLocaleString()} VND, Required: ${totalRentalAmount.toLocaleString()} VND`
        );
      }

      // Get or create owner wallet
      let ownerWallet = await Wallet.findOne({ user: ownerId }).session(session);
      if (!ownerWallet) {
        ownerWallet = new Wallet({
          user: ownerId,
          balance: { available: 0, frozen: 0, pending: 0 },
          currency: 'VND',
          status: 'ACTIVE'
        });
        await ownerWallet.save({ session });
      }

      // Deduct total from system wallet
      systemWallet.balance.available -= totalRentalAmount;
      systemWallet.lastModifiedAt = new Date();
      if (adminId && adminId !== 'SYSTEM_AUTO_TRANSFER') {
        systemWallet.lastModifiedBy = adminId;
      }
      await systemWallet.save({ session });

      // Add owner share to owner wallet as FROZEN (will be unfrozen after 24h)
      ownerWallet.balance.frozen += ownerShareAmount;
      await ownerWallet.save({ session });
      
      // Create frozen record for automatic unlock in 24h
      const FrozenBalance = require('../models/FrozenBalance');
      const frozenRecord = new FrozenBalance({
        wallet: ownerWallet._id,
        user: ownerId,
        amount: ownerShareAmount,
        reason: 'RENTAL_FEE_TRANSFER',
        subOrderNumber: subOrderNumber,
        unlocksAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        status: 'FROZEN'
      });
      await frozenRecord.save({ session });

      // Create transaction records with platform fee tracking
      
      // System transaction: Total amount transferred out (80% to owner + 20% platform fee retained)
      const systemTransaction = new Transaction({
        user: adminId && adminId !== 'SYSTEM_AUTO_TRANSFER' ? adminId : ownerId,
        wallet: systemWallet._id,
        type: 'TRANSFER_OUT',
        amount: totalRentalAmount,
        status: 'success',
        paymentMethod: 'system_wallet',
        description: `Rental fee transfer for suborder ${subOrderNumber}`,
        fromSystemWallet: true,
        toWallet: ownerWallet._id,
        systemWalletAction: 'transfer_out',
        metadata: {
          subOrderNumber: subOrderNumber,
          totalRentalAmount: totalRentalAmount,
          ownerShare: ownerShareAmount,
          platformFee: platformFeeAmount,
          platformFeePercentage: 20,
          ownerSharePercentage: 80,
          recipientUserId: ownerId,
          action: 'RENTAL_FEE_WITH_PLATFORM_FEE'
        }
      });

      // Owner transaction: Amount received (80% only)
      const ownerTransaction = new Transaction({
        user: ownerId,
        wallet: ownerWallet._id,
        type: 'TRANSFER_IN',
        amount: ownerShareAmount,
        status: 'success',
        paymentMethod: 'system_wallet',
        description: `Received rental fee (80%) for suborder ${subOrderNumber}`,
        fromSystemWallet: true,
        toWallet: ownerWallet._id,
        metadata: {
          subOrderNumber: subOrderNumber,
          totalRentalAmount: totalRentalAmount,
          receivedAmount: ownerShareAmount,
          platformFeeDeducted: platformFeeAmount,
          platformFeePercentage: 20,
          action: 'RENTAL_FEE_RECEIVED'
        }
      });

      // Platform fee transaction: Platform retains 20%
      const platformFeeTransaction = new Transaction({
        user: adminId && adminId !== 'SYSTEM_AUTO_TRANSFER' ? adminId : null,
        wallet: systemWallet._id,
        type: 'PROMOTION_REVENUE',
        amount: platformFeeAmount,
        status: 'success',
        paymentMethod: 'system_wallet',
        description: `Platform fee (20%) from suborder ${subOrderNumber}`,
        toSystemWallet: true,
        systemWalletAction: 'fee_collection',
        metadata: {
          subOrderNumber: subOrderNumber,
          totalRentalAmount: totalRentalAmount,
          platformFeePercentage: 20,
          ownerSharePercentage: 80,
          ownerUserId: ownerId,
          action: 'PLATFORM_FEE_COLLECTION'
        }
      });

      await systemTransaction.save({ session });
      await ownerTransaction.save({ session });
      await platformFeeTransaction.save({ session });

      await session.commitTransaction();

      // Emit socket update for owner wallet
      if (global.chatGateway) {
        global.chatGateway.emitWalletUpdate(ownerId.toString(), {
          type: 'RENTAL_FEE_TRANSFER',
          amount: ownerShareAmount,
          newBalance: ownerWallet.balance.available
        });
      }

      return {
        success: true,
        systemWallet: await this.getBalance(),
        ownerWallet: {
          walletId: ownerWallet._id,
          userId: ownerId,
          availableBalance: ownerWallet.balance.available,
          frozenBalance: ownerWallet.balance.frozen,
          unlocksAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        transfer: {
          totalRentalAmount: totalRentalAmount,
          ownerShareAmount: ownerShareAmount,
          platformFeeAmount: platformFeeAmount,
          platformFeePercentage: 20,
          ownerSharePercentage: 80,
          status: 'FROZEN',
          unlocksAfter: '24 hours'
        },
        transactions: {
          system: systemTransaction,
          owner: ownerTransaction,
          platformFee: platformFeeTransaction
        },
        message: `Transferred ${ownerShareAmount.toLocaleString()} VND (80%) to owner (FROZEN for 24h). Platform fee ${platformFeeAmount.toLocaleString()} VND (20%) retained.`
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Transfer deposit refund with frozen status
   * Deposit is added as FROZEN and will unlock after 24 hours
   */
  async transferDepositRefundWithFrozen(adminId, renterId, depositAmount, subOrderNumber) {
    if (depositAmount <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get or create system wallet
      let systemWallet = await SystemWallet.findOne({}).session(session);
      if (!systemWallet) {
        systemWallet = new SystemWallet({
          name: 'PIRA Platform Wallet',
          balance: { available: 0, frozen: 0, pending: 0 },
          currency: 'VND',
          status: 'ACTIVE'
        });
        await systemWallet.save({ session });
      }

      // Check sufficient balance
      if (systemWallet.balance.available < depositAmount) {
        throw new Error(
          `Insufficient system wallet balance for deposit refund. Available: ${systemWallet.balance.available.toLocaleString()} VND, Required: ${depositAmount.toLocaleString()} VND`
        );
      }

      // Get or create renter wallet
      let renterWallet = await Wallet.findOne({ user: renterId }).session(session);
      if (!renterWallet) {
        renterWallet = new Wallet({
          user: renterId,
          balance: { available: 0, frozen: 0, pending: 0 },
          currency: 'VND',
          status: 'ACTIVE'
        });
        await renterWallet.save({ session });
      }

      // Deduct from system wallet
      systemWallet.balance.available -= depositAmount;
      systemWallet.lastModifiedAt = new Date();
      if (adminId && adminId !== 'SYSTEM_AUTO_TRANSFER') {
        systemWallet.lastModifiedBy = adminId;
      }
      await systemWallet.save({ session });

      // Add to renter wallet as FROZEN (will be unfrozen after 24h)
      renterWallet.balance.frozen += depositAmount;
      await renterWallet.save({ session });

      // Create frozen record for automatic unlock in 24h
      const FrozenBalance = require('../models/FrozenBalance');
      const frozenRecord = new FrozenBalance({
        wallet: renterWallet._id,
        user: renterId,
        amount: depositAmount,
        reason: 'DEPOSIT_REFUND',
        subOrderNumber: subOrderNumber,
        unlocksAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        status: 'FROZEN',
        metadata: {
          adminId: adminId,
          action: 'DEPOSIT_REFUND'
        }
      });
      await frozenRecord.save({ session });

      // Create transaction records

      // System transaction: Amount transferred out
      const systemTransaction = new Transaction({
        user: adminId && adminId !== 'SYSTEM_AUTO_TRANSFER' ? adminId : renterId,
        wallet: systemWallet._id,
        type: 'TRANSFER_OUT',
        amount: depositAmount,
        status: 'success',
        paymentMethod: 'system_wallet',
        description: `Deposit refund for suborder ${subOrderNumber}`,
        fromSystemWallet: true,
        toWallet: renterWallet._id,
        systemWalletAction: 'refund',
        metadata: {
          subOrderNumber: subOrderNumber,
          depositAmount: depositAmount,
          recipientUserId: renterId,
          action: 'DEPOSIT_REFUND_TRANSFER_OUT'
        }
      });

      // Renter transaction: Amount received (FROZEN)
      const renterTransaction = new Transaction({
        user: renterId,
        wallet: renterWallet._id,
        type: 'TRANSFER_IN',
        amount: depositAmount,
        status: 'success',
        paymentMethod: 'system_wallet',
        description: `Deposit refund for suborder ${subOrderNumber} (FROZEN for 24h)`,
        fromSystemWallet: true,
        toWallet: renterWallet._id,
        metadata: {
          subOrderNumber: subOrderNumber,
          depositAmount: depositAmount,
          status: 'FROZEN',
          unlocksAfter: '24 hours',
          action: 'DEPOSIT_REFUND_RECEIVED'
        }
      });

      await systemTransaction.save({ session });
      await renterTransaction.save({ session });

      await session.commitTransaction();

      // Emit socket update for renter wallet
      if (global.chatGateway) {
        global.chatGateway.emitWalletUpdate(renterId.toString(), {
          type: 'DEPOSIT_REFUND',
          amount: depositAmount,
          status: 'FROZEN',
          frozenBalance: renterWallet.balance.frozen,
          unlocksAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
      }

      return {
        success: true,
        systemWallet: await this.getBalance(),
        renterWallet: {
          walletId: renterWallet._id,
          userId: renterId,
          availableBalance: renterWallet.balance.available,
          frozenBalance: renterWallet.balance.frozen,
          unlocksAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        transfer: {
          depositAmount: depositAmount,
          status: 'FROZEN',
          unlocksAfter: '24 hours'
        },
        transactions: {
          system: systemTransaction,
          renter: renterTransaction
        },
        message: `Deposit refund ${depositAmount.toLocaleString()} VND returned to renter (FROZEN for 24h).`
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new SystemWalletService();
