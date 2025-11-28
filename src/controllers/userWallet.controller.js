const FrozenBalanceService = require('../services/frozenBalance.service');
const Wallet = require('../models/Wallet');

class UserWalletController {
  /**
   * Get user's wallet with available, frozen, and total balances
   * Also shows details of frozen funds and unlock times
   */
  async getWalletBalance(req, res) {
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
  }

  /**
   * Get all frozen funds for the user
   */
  async getFrozenFunds(req, res) {
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
  }
}

module.exports = new UserWalletController();
