const FrozenBalanceService = require('../services/frozenBalance.service');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const FrozenBalance = require('../models/FrozenBalance');

const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('📥 GET /api/wallets/balance');
    console.log('👤 User ID:', userId);

    const walletData = await FrozenBalanceService.getWalletWithBalances(userId);

    if (!walletData) {
      // Create new wallet if doesn't exist
      const wallet = new Wallet({
        user: userId,
        balance: { available: 0, frozen: 0, pending: 0 },
        currency: 'VND',
        status: 'ACTIVE'
      });
      await wallet.save();

      return res.json({
        status: 'success',
        data: {
          walletId: wallet._id,
          userId: wallet.user,
          balance: {
            available: 0,
            frozen: 0,
            total: 0
          },
          frozenDetails: [],
          currency: 'VND',
          status: 'ACTIVE',
          createdAt: wallet.createdAt
        }
      });
    }

    return res.json({
      status: 'success',
      data: walletData
    });
  } catch (error) {
    console.error('❌ Error getting wallet balance:', error);
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Failed to get wallet balance'
    });
  }
};

/**
 * Get all frozen funds for the user
 */
const getFrozenFunds = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('📥 GET /api/wallets/frozen-funds');
    console.log('👤 User ID:', userId);

    const result = await FrozenBalanceService.getUserFrozenFunds(userId);

    return res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('❌ Error getting frozen funds:', error);
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Failed to get frozen funds'
    });
  }
};

/**
 * Debug endpoint: Get wallet with all transaction details
 */
const getWalletDebugInfo = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('📥 GET /api/wallets/debug');
    console.log('👤 User ID:', userId);

    // Get wallet
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({
        status: 'error',
        message: 'Wallet not found'
      });
    }

    // Get all transactions
    const transactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(20);

    // Get all frozen balance records
    const frozenRecords = await FrozenBalance.find({ user: userId }).sort({ createdAt: -1 });

    // Calculate frozen balance from records
    const totalFrozen = frozenRecords
      .filter((r) => r.status === 'FROZEN')
      .reduce((sum, r) => sum + r.amount, 0);

    const debugInfo = {
      wallet: {
        _id: wallet._id,
        user: wallet.user,
        balance: wallet.balance,
        currency: wallet.currency,
        status: wallet.status,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
      },
      balanceSummary: {
        available: wallet.balance.available,
        frozen: wallet.balance.frozen,
        pending: wallet.balance.pending,
        total: wallet.balance.available + wallet.balance.frozen + wallet.balance.pending,
        calculatedFrozen: totalFrozen,
        discrepancy: wallet.balance.frozen !== totalFrozen ? 'MISMATCH' : 'OK'
      },
      frozenRecords: frozenRecords.map((r) => ({
        _id: r._id,
        amount: r.amount,
        reason: r.reason,
        subOrderNumber: r.subOrderNumber,
        status: r.status,
        unlocksAt: r.unlocksAt,
        unlockedAt: r.unlockedAt,
        createdAt: r.createdAt,
        timeUntilUnlock:
          r.status === 'FROZEN' ? Math.max(0, Math.ceil((r.unlocksAt - Date.now()) / 1000)) : null
      })),
      recentTransactions: transactions.map((t) => ({
        _id: t._id,
        type: t.type,
        amount: t.amount,
        status: t.status,
        description: t.description,
        paymentMethod: t.paymentMethod,
        fromSystemWallet: t.fromSystemWallet,
        toSystemWallet: t.toSystemWallet,
        metadata: t.metadata,
        createdAt: t.createdAt
      }))
    };

    return res.json({
      status: 'success',
      data: debugInfo
    });
  } catch (error) {
    console.error('❌ Error getting wallet debug info:', error);
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Failed to get wallet debug info'
    });
  }
};

module.exports = {
  getWalletBalance,
  getFrozenFunds,
  getWalletDebugInfo
};
