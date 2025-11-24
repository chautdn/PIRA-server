const mongoose = require('mongoose');

/**
 * SystemWallet - Platform-wide wallet managed by admins
 * Separate from user wallets - used for platform fees, refunds, etc.
 */
const systemWalletSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      default: 'PIRA Platform Wallet'
    },

    // Balance tracking
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

    // Track all admin actions for audit
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    lastModifiedAt: {
      type: Date
    },

    // Metadata
    description: {
      type: String,
      default: 'System wallet for platform operations - managed by administrators'
    }
  },
  {
    timestamps: true,
    collection: 'system_wallets'
  }
);

// Indexes
systemWalletSchema.index({ status: 1 });
systemWalletSchema.index({ name: 1 });

// Virtual for total balance
systemWalletSchema.virtual('totalBalance').get(function () {
  return this.balance.available + this.balance.frozen + this.balance.pending;
});

// Ensure only ONE system wallet exists
systemWalletSchema.pre('save', async function (next) {
  if (this.isNew) {
    const existingWallet = await mongoose.model('SystemWallet').findOne({});
    if (existingWallet) {
      throw new Error('System wallet already exists. Only one system wallet is allowed.');
    }
  }
  next();
});

module.exports = mongoose.model('SystemWallet', systemWalletSchema);
