const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true
    },

    // Relationships
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },
    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    payee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Payment Details
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'VND'
    },

    // Payment Method
    method: {
      type: String,
      enum: ['WALLET', 'VNPAY', 'MOMO', 'ZALOPAY', 'BANK_TRANSFER', 'CASH'],
      required: true
    },

    // Payment Gateway
    gateway: {
      provider: String,
      transactionId: String,
      response: mongoose.Schema.Types.Mixed
    },

    // Status
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED'],
      default: 'PENDING'
    },

    // Payment Type
    type: {
      type: String,
      enum: ['RENTAL_PAYMENT', 'DEPOSIT', 'REFUND', 'PENALTY'],
      required: true
    },

    description: String,

    // Timestamps
    paidAt: Date,
    expiredAt: Date,

    // Refund Info
    refund: {
      refundedAt: Date,
      refundAmount: Number,
      refundReason: String,
      refundBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }
  },
  {
    timestamps: true,
    collection: 'payments'
  }
);

paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ order: 1 });
paymentSchema.index({ payer: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
