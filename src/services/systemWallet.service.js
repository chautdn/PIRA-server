const SystemWallet = require('../models/SystemWallet');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

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

      // Get user wallet
      const userWallet = await Wallet.findOne({ user: userId }).session(session);
      if (!userWallet) {
        throw new Error('User wallet not found');
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
        type: 'order_payment',
        amount: amount,
        status: 'success',
        paymentMethod: 'wallet',
        description: `Transfer to user ${userId}: ${description}`,
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
        type: 'order_payment',
        amount: amount,
        status: 'success',
        paymentMethod: 'wallet',
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
   */
  async getTransactionHistory(limit = 50, page = 1) {
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({
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
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('metadata.adminId', 'email profile.firstName profile.lastName');

    const total = await Transaction.countDocuments({
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
    });

    return {
      transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
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
}

module.exports = new SystemWalletService();
