const mongoose = require('mongoose');

const frozenBalanceSchema = new mongoose.Schema(
  {
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    reason: {
      type: String,
      enum: ['RENTAL_FEE_TRANSFER', 'DEPOSIT_REFUND', 'SYSTEM_HOLD'],
      required: true
    },
    subOrderNumber: {
      type: String,
      required: false
    },
    status: {
      type: String,
      enum: ['FROZEN', 'UNLOCKED', 'RELEASED', 'FORFEITED'],
      default: 'FROZEN',
      index: true
    },
    unlocksAt: {
      type: Date,
      required: true,
      index: true
    },
    unlockedAt: {
      type: Date,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'frozen_balances'
  }
);

// Index for automatic unlock job
frozenBalanceSchema.index({ status: 1, unlocksAt: 1 });
frozenBalanceSchema.index({ user: 1, status: 1 });
frozenBalanceSchema.index({ wallet: 1, status: 1 });

module.exports = mongoose.model('FrozenBalance', frozenBalanceSchema);
