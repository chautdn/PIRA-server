const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    // Balance
    balance: {
      available: {
        type: Number,
        default: 0,
        min: 0
      },
      frozen: {
        type: Number,
        default: 0,
        min: 0
      },
      pending: {
        type: Number,
        default: 0,
        min: 0
      }
    },

    currency: {
      type: String,
      default: 'VND'
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'FROZEN'],
      default: 'ACTIVE'
    },

    // Limits
    limits: {
      dailyWithdraw: {
        type: Number,
        default: 10000000
      },
      monthlyWithdraw: {
        type: Number,
        default: 100000000
      }
    }
  },
  {
    timestamps: true,
    collection: 'wallets'
  }
);

walletSchema.index({ user: 1 });
walletSchema.index({ status: 1 });

module.exports = mongoose.model('Wallet', walletSchema);
