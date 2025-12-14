const mongoose = require('mongoose');

const extensionSchema = new mongoose.Schema(
  {
    // References
    masterOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
      required: true,
      index: true
    },

    subOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubOrder',
      required: true
    },

    renter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Selected products with their owners
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true
        },
        owner: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        productName: String,
        currentEndDate: {
          type: Date,
          required: true
        },
        newEndDate: {
          type: Date,
          required: true
        },
        extensionDays: {
          type: Number,
          required: true,
          min: 1,
          max: 365
        },
        dailyRentalPrice: {
          type: Number,
          required: true,
          min: 0
        },
        extensionFee: {
          type: Number,
          required: true,
          min: 0
        },
        status: {
          type: String,
          enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
          default: 'PENDING'
        },
        approvedAt: Date,
        rejectedAt: Date,
        rejectionReason: String
      }
    ],

    // Total extension info
    extensionDays: {
      type: Number,
      required: true,
      min: 1,
      max: 365
    },

    totalExtensionFee: {
      type: Number,
      required: true,
      min: 0
    },

    notes: String,

    // Payment info
    paymentMethod: {
      type: String,
      enum: ['WALLET', 'PAYOS', 'COD'],
      default: 'WALLET'
    },

    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED'],
      default: 'PENDING'
    },

    paymentInfo: mongoose.Schema.Types.Mixed,

    // Overall status
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARTIALLY_APPROVED', 'EXPIRED'],
      default: 'PENDING',
      index: true
    },

    // Timestamps
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    approvedAt: Date,
    rejectedAt: Date,
    cancelledAt: Date,
    expiredAt: Date,
    deletedAt: Date
  },
  {
    timestamps: true
  }
);

// Indexes
extensionSchema.index({ masterOrder: 1, renter: 1 });
extensionSchema.index({ owner: 1, status: 1 });
extensionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Extension', extensionSchema);
