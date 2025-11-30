const mongoose = require('mongoose');

const extensionSchema = new mongoose.Schema(
  {
    // References
    masterOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
      required: true
    },

    subOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubOrder',
      required: true
    },

    renter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Extension details
    extendDays: {
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

    notes: {
      type: String,
      default: null
    },

    // Dates
    currentEndDate: {
      type: Date,
      required: true
    },

    newEndDate: {
      type: Date,
      required: true
    },

    // Status tracking
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING'
    },

    approvedAt: Date,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    rejectedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    rejectionReason: String,

    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes
extensionSchema.index({ masterOrder: 1, renter: 1 });
extensionSchema.index({ owner: 1, status: 1 });
extensionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Extension', extensionSchema);
