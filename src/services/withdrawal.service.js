const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { BadRequest, NotFoundError } = require('../core/error');

const WITHDRAWAL_LIMITS = {
  MIN_AMOUNT: 10000,
  MAX_AMOUNT: 50000000,
  DAILY_LIMIT: 100000000
};

const VIETNAMESE_BANKS = {
  VCB: { name: 'Vietcombank', accountLength: [13, 14] },
  TCB: { name: 'Techcombank', accountLength: [12, 19] },
  BIDV: { name: 'BIDV', accountLength: [12, 14] },
  VTB: { name: 'Vietinbank', accountLength: [12, 13] },
  ACB: { name: 'ACB', accountLength: [9, 14] },
  MB: { name: 'MB Bank', accountLength: [12, 13] },
  TPB: { name: 'TPBank', accountLength: [10, 12] },
  STB: { name: 'Sacombank', accountLength: [13, 16] },
  VPB: { name: 'VPBank', accountLength: [12, 13] },
  AGR: { name: 'Agribank', accountLength: [13, 14] },
  EIB: { name: 'Eximbank', accountLength: [12, 16] },
  MSB: { name: 'MSB', accountLength: [12, 13] },
  SCB: { name: 'SCB', accountLength: [12, 13] },
  SHB: { name: 'SHB', accountLength: [12, 13] },
  OCB: { name: 'OCB', accountLength: [12, 14] }
};

const withdrawalService = {
  // Request withdrawal (without transactions for development)
  requestWithdrawal: async (userId, withdrawalData) => {
    try {
      const { amount, note } = withdrawalData;

      // 1. Get user and check KYC
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!user.cccd?.isVerified) {
        throw new BadRequest(
          'KYC verification required. Please complete KYC verification before requesting withdrawal.'
        );
      }

      // 2. Check if user has bank account
      if (!user.bankAccount?.accountNumber) {
        throw new BadRequest(
          'Bank account required. Please add your bank account details in your profile.'
        );
      }

      // 3. Validate amount
      if (amount < WITHDRAWAL_LIMITS.MIN_AMOUNT) {
        throw new BadRequest(
          `Minimum withdrawal is ${WITHDRAWAL_LIMITS.MIN_AMOUNT.toLocaleString('vi-VN')} VND`
        );
      }

      if (amount > WITHDRAWAL_LIMITS.MAX_AMOUNT) {
        throw new BadRequest(
          `Maximum withdrawal is ${WITHDRAWAL_LIMITS.MAX_AMOUNT.toLocaleString('vi-VN')} VND per transaction`
        );
      }

      // 4. Check daily limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dailyTotal = await Withdrawal.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            createdAt: { $gte: today },
            status: { $in: ['pending', 'processing', 'completed'] }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]);

      const totalToday = dailyTotal.length > 0 ? dailyTotal[0].total : 0;

      if (totalToday + amount > WITHDRAWAL_LIMITS.DAILY_LIMIT) {
        const remaining = WITHDRAWAL_LIMITS.DAILY_LIMIT - totalToday;
        throw new BadRequest(
          `Daily limit exceeded. You can withdraw up to ${remaining.toLocaleString('vi-VN')} VND more today`
        );
      }

      // 5. Get wallet
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        throw new NotFoundError('Wallet not found');
      }

      console.log('💰 Wallet balance check:', {
        userId,
        requestedAmount: amount,
        availableBalance: wallet.balance.available,
        frozenBalance: wallet.balance.frozen,
        pendingBalance: wallet.balance.pending
      });

      // 6. Check available balance
      if (wallet.balance.available < amount) {
        throw new BadRequest(`Insufficient balance. Available: ${wallet.balance.available}, Requested: ${amount}`);
      }

      // 7. Freeze amount in wallet (move from available to frozen)
      wallet.balance.available -= amount;
      wallet.balance.frozen += amount;
      await wallet.save();

      // 8. Create transaction record
      const transaction = new Transaction({
        user: userId,
        wallet: wallet._id,
        type: 'withdrawal',
        amount: amount,
        status: 'pending',
        description: `Withdrawal to ${user.bankAccount.bankName} ${user.bankAccount.accountNumber}`
      });
      await transaction.save();

      // 9. Create withdrawal request (snapshot bank details)
      const withdrawal = new Withdrawal({
        user: userId,
        wallet: wallet._id,
        amount,
        note,
        transaction: transaction._id,
        status: 'pending',
        bankDetails: {
          bankCode: user.bankAccount.bankCode,
          bankName: user.bankAccount.bankName,
          accountNumber: user.bankAccount.accountNumber,
          accountHolderName: user.bankAccount.accountHolderName
        }
      });
      await withdrawal.save();

      return withdrawal;
    } catch (error) {
      throw error;
    }
  },

  // Get user withdrawals
  getUserWithdrawals: async (userId, options = {}) => {
    const { page = 1, limit = 20, status } = options;

    const query = { user: userId };
    if (status) query.status = status;

    const withdrawals = await Withdrawal.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await Withdrawal.countDocuments(query);

    return {
      withdrawals,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    };
  },

  // Cancel withdrawal (user can only cancel pending)
  cancelWithdrawal: async (withdrawalId, userId) => {
    try {
      const withdrawal = await Withdrawal.findOne({
        _id: withdrawalId,
        user: userId
      });

      if (!withdrawal) {
        throw new NotFoundError('Withdrawal not found');
      }

      if (withdrawal.status !== 'pending') {
        throw new BadRequest('Only pending withdrawals can be cancelled');
      }

      // Unfreeze amount (move from frozen back to available)
      const wallet = await Wallet.findById(withdrawal.wallet);
      wallet.balance.available += withdrawal.amount;
      wallet.balance.frozen -= withdrawal.amount;
      await wallet.save();

      // Update withdrawal status
      withdrawal.status = 'cancelled';
      await withdrawal.save();

      // Update transaction
      await Transaction.findByIdAndUpdate(
        withdrawal.transaction,
        { status: 'cancelled' }
      );

      return withdrawal;
    } catch (error) {
      throw error;
    }
  },

  // Get daily withdrawal total
  getDailyTotal: async (userId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await Withdrawal.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: today },
          status: { $in: ['pending', 'processing', 'completed'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    return result.length > 0 ? result[0].total : 0;
  },

  // ADMIN: Update withdrawal status
  updateWithdrawalStatus: async (withdrawalId, adminId, statusData) => {
    try {
      const { status, adminNote, rejectionReason } = statusData;

      const withdrawal = await Withdrawal.findById(withdrawalId);

      if (!withdrawal) {
        throw new NotFoundError('Withdrawal not found');
      }

      const wallet = await Wallet.findById(withdrawal.wallet);

      // Handle status transitions
      if (status === 'processing') {
        if (withdrawal.status !== 'pending') {
          throw new BadRequest('Can only process pending withdrawals');
        }

        withdrawal.status = 'processing';
        withdrawal.processedBy = adminId;
        withdrawal.processedAt = new Date();
        withdrawal.adminNote = adminNote;
      } else if (status === 'completed') {
        if (withdrawal.status !== 'processing') {
          throw new BadRequest('Can only complete processing withdrawals');
        }

        // Remove from frozen (money already left the system)
        wallet.balance.frozen -= withdrawal.amount;
        await wallet.save();

        withdrawal.status = 'completed';
        withdrawal.completedAt = new Date();
        withdrawal.adminNote = adminNote;

        // Update transaction
        await Transaction.findByIdAndUpdate(
          withdrawal.transaction,
          { status: 'success', processedAt: new Date() }
        );
      } else if (status === 'rejected') {
        if (!['pending', 'processing'].includes(withdrawal.status)) {
          throw new BadRequest('Can only reject pending/processing withdrawals');
        }

        // Unfreeze and return to available
        wallet.balance.available += withdrawal.amount;
        wallet.balance.frozen -= withdrawal.amount;
        await wallet.save();

        withdrawal.status = 'rejected';
        withdrawal.processedBy = adminId;
        withdrawal.processedAt = new Date();
        withdrawal.rejectionReason = rejectionReason;

        // Update transaction
        await Transaction.findByIdAndUpdate(
          withdrawal.transaction,
          { status: 'failed', processedAt: new Date() }
        );
      }

      await withdrawal.save();

      // Populate for response
      await withdrawal.populate('user', 'email profile.firstName profile.lastName');

      return withdrawal;
    } catch (error) {
      throw error;
    }
  },

  // ADMIN: Get all withdrawals with filters
  getAllWithdrawals: async (options = {}) => {
    const { page = 1, limit = 20, status, userId } = options;

    const query = {};
    if (status) query.status = status;
    if (userId) query.user = userId;

    const withdrawals = await Withdrawal.find(query)
      .populate('user', 'email profile.firstName profile.lastName')
      .populate('processedBy', 'email profile.firstName profile.lastName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await Withdrawal.countDocuments(query);

    return {
      withdrawals,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    };
  }
};

module.exports = withdrawalService;
