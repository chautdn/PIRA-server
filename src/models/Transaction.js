const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: false // Not required for order payments
    },
    type: {
      type: String,
      enum: [
        'deposit',
        'withdrawal',
        'payment',
        'refund',
        'penalty',
        'order_payment',
        'PROMOTION_REVENUE',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'DEPOSIT',
        'WITHDRAWAL'
      ],
      required: true,
      index: true
    },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'processing', 'success', 'failed', 'cancelled'],
      default: 'pending',
      index: true
    },

    // PayOS Integration
    provider: { type: String, default: 'payos' },
    externalId: { type: String, index: true }, // PayOS orderCode
    paymentUrl: String,

    // Enhanced tracking
    description: { type: String, required: true },
    reference: String, // Internal reference
    paymentMethod: {
      type: String,
      enum: ['wallet', 'payos', 'cod', 'system_wallet'],
      default: 'payos'
    },
    orderCode: String, // For PayOS orders
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
      // metadata có thể chứa:
      // - feeBreakdown: { deposit, rental, shipping }
      // - orderInfo, subOrderInfo
      // - refundBreakdown: { depositRefund, rentalRefund, shippingRefund }
    },

    // System wallet interaction tracking
    fromWallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: false
    },
    toWallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: false
    },
    fromSystemWallet: {
      type: Boolean,
      default: false
    },
    toSystemWallet: {
      type: Boolean,
      default: false
    },
    systemWalletAction: {
      type: String,
      enum: [
        'revenue',
        'refund',
        'fee_collection',
        'penalty',
        'transfer_in',
        'transfer_out',
        'manual_adjustment'
      ],
      required: false
    },

    // Retry and error handling
    retryCount: { type: Number, default: 0 },
    lastError: String,
    processedAt: Date,
    expiredAt: Date,

    // Audit trail
    ipAddress: String,
    userAgent: String,

    createdAt: { type: Date, default: Date.now, index: true }
  },
  {
    timestamps: true,
    collection: 'transactions'
  }
);

// INDEXES for performance
transactionSchema.index({ user: 1, status: 1, createdAt: -1 });
transactionSchema.index({ externalId: 1 }, { sparse: true });
transactionSchema.index({ status: 1, expiredAt: 1 });

// System wallet specific indexes
transactionSchema.index({ fromSystemWallet: 1, createdAt: -1 });
transactionSchema.index({ toSystemWallet: 1, createdAt: -1 });
transactionSchema.index({ systemWalletAction: 1, createdAt: -1 });
transactionSchema.index({ fromWallet: 1, toWallet: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
