const mongoose = require('mongoose');
const FrozenBalance = require('../models/FrozenBalance');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

class FrozenBalanceService {
  /**
   * Unlock frozen funds that have passed their unlock time
   * Called periodically (every minute or via scheduled job)
   */
  async unlockExpiredFrozenFunds() {
    try {
      
      // Find all frozen records that should be unlocked (unlocksAt <= now)
      const now = new Date();
      const expiredFrozenRecords = await FrozenBalance.find({
        status: 'FROZEN',
        unlocksAt: { $lte: now }
      }).populate('wallet').populate('user');


      if (expiredFrozenRecords.length === 0) {
        return { success: true, unlockedCount: 0, message: 'No frozen funds to unlock' };
      }

      let unlockedCount = 0;
      const unlockResults = [];

      for (const frozenRecord of expiredFrozenRecords) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
          const wallet = frozenRecord.wallet;
          const amount = frozenRecord.amount;
          const user = frozenRecord.user;


          // Move from frozen to available
          wallet.balance.frozen -= amount;
          wallet.balance.available += amount;
          await wallet.save({ session });

          // Update frozen record status
          frozenRecord.status = 'UNLOCKED';
          frozenRecord.unlockedAt = now;
          await frozenRecord.save({ session });

          // Create transaction record for the unlock
          const unlockTransaction = new Transaction({
            user: user._id,
            wallet: wallet._id,
            type: 'TRANSFER_IN', // or could be a new type like 'FROZEN_UNLOCK'
            amount: amount,
            status: 'success',
            paymentMethod: 'system_wallet',
            description: `Frozen fund unlocked: ${frozenRecord.reason} (${frozenRecord.subOrderNumber})`,
            metadata: {
              action: 'FROZEN_FUND_UNLOCK',
              reason: frozenRecord.reason,
              subOrderNumber: frozenRecord.subOrderNumber,
              frozenRecordId: frozenRecord._id,
              frozenDuration: '24 hours'
            }
          });
          await unlockTransaction.save({ session });

          await session.commitTransaction();

          unlockedCount++;
          unlockResults.push({
            userId: user._id,
            amount: amount,
            reason: frozenRecord.reason,
            subOrderNumber: frozenRecord.subOrderNumber,
            success: true
          });

          // Emit socket update to notify user
          if (global.chatGateway) {
            global.chatGateway.emitWalletUpdate(user._id.toString(), {
              type: 'FROZEN_FUND_UNLOCKED',
              amount: amount,
              newBalance: wallet.balance.available,
              frozenBalance: wallet.balance.frozen,
              timestamp: now.toISOString()
            });
          }

        } catch (error) {
          await session.abortTransaction();
          console.error(`      ❌ Error unlocking frozen fund for ${frozenRecord.user._id}:`, error.message);
          unlockResults.push({
            userId: frozenRecord.user._id,
            amount: frozenRecord.amount,
            reason: frozenRecord.reason,
            success: false,
            error: error.message
          });
        } finally {
          session.endSession();
        }
      }

      return {
        success: true,
        unlockedCount: unlockedCount,
        totalProcessed: expiredFrozenRecords.length,
        results: unlockResults,
        timestamp: now.toISOString()
      };
    } catch (error) {
      console.error('❌ [FrozenBalanceService] Error in unlockExpiredFrozenFunds:', error);
      throw error;
    }
  }

  /**
   * Get all frozen funds for a specific user
   */
  async getUserFrozenFunds(userId) {
    try {
      const frozenFunds = await FrozenBalance.find({
        user: userId,
        status: 'FROZEN'
      }).sort({ unlocksAt: 1 });

      const totalFrozen = frozenFunds.reduce((sum, fund) => sum + fund.amount, 0);

      return {
        success: true,
        total: totalFrozen,
        count: frozenFunds.length,
        funds: frozenFunds,
        now: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error getting frozen funds for user:', error);
      throw error;
    }
  }

  /**
   * Get wallet with both available and frozen balances
   */
  async getWalletWithBalances(userId) {
    try {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        return null;
      }

      const frozenFunds = await FrozenBalance.find({
        user: userId,
        status: 'FROZEN'
      }).sort({ unlocksAt: 1 });

      const totalFrozen = frozenFunds.reduce((sum, fund) => sum + fund.amount, 0);

      return {
        walletId: wallet._id,
        userId: wallet.user,
        balance: {
          available: wallet.balance.available,
          frozen: wallet.balance.frozen,
          total: wallet.balance.available + wallet.balance.frozen
        },
        frozenDetails: frozenFunds.map(fund => ({
          amount: fund.amount,
          reason: fund.reason,
          subOrderNumber: fund.subOrderNumber,
          unlocksAt: fund.unlocksAt,
          createdAt: fund.createdAt,
          unlocksIn: Math.max(0, Math.ceil((fund.unlocksAt - Date.now()) / 1000))
        })),
        currency: wallet.currency,
        status: wallet.status,
        createdAt: wallet.createdAt
      };
    } catch (error) {
      console.error('❌ Error getting wallet with balances:', error);
      throw error;
    }
  }
}

module.exports = new FrozenBalanceService();
