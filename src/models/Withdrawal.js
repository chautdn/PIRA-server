const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
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
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 10000, // 10,000 VND minimum
      max: 50000000 // 50,000,000 VND maximum per transaction
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'rejected', 'cancelled'],
      default: 'pending',
      index: true
    },
    // Bank details (snapshot at time of request)
    bankDetails: {
      bankCode: String,
      bankName: String,
      accountNumber: String,
      accountHolderName: String
    },
    note: {
      type: String,
      maxlength: 200
    },
    // Admin fields
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    processedAt: Date,
    adminNote: {
      type: String,
      maxlength: 500
    },
    rejectionReason: {
      type: String,
      maxlength: 500
    },
    // Processing lock (prevent concurrent processing)
    processingLock: {
      lockedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      lockedAt: Date,
      lockExpiry: Date
    },
    // Transaction reference
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    completedAt: Date
  },
  {
    timestamps: true,
    collection: 'withdrawals'
  }
);

// Indexes for efficient queries
withdrawalSchema.index({ user: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });
withdrawalSchema.index({ user: 1, status: 1 });

// Virtual for processing time in days
withdrawalSchema.virtual('processingDays').get(function () {
  if (!this.completedAt) return null;
  const diff = this.completedAt - this.createdAt;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
