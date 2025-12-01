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

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Extension details - linh hoạt
    extensionDays: {
      type: Number,
      required: true,
      min: 1,
      max: 365
    },

    extensionFee: {
      type: Number,
      required: true,
      min: 0
    },

    notes: String,

    // Dates
    currentEndDate: {
      type: Date,
      required: true
    },

    newEndDate: {
      type: Date,
      required: true
    },

    requestedAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    // Payment info (optional, linh hoạt)
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

    // Status - đơn giản
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING',
      index: true
    },

    // Owner response - tùy chọn
    rejectionReason: String,

    // Timestamps
    approvedAt: Date,
    rejectedAt: Date,
    cancelledAt: Date,
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
