const mongoose = require('mongoose');

/**
 * Early Return Request Schema
 * Handles renter's request to return rental items before the original end date
 * Supports both system-shipped and self-pickup orders
 */
const earlyReturnRequestSchema = new mongoose.Schema(
  {
    requestNumber: {
      type: String,
      unique: true,
      index: true
    },

    // Relationships
    subOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubOrder',
      required: true,
      index: true
    },
    masterOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
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

    // Return shipment (for system-shipped orders only)
    returnShipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment'
    },

    // Original rental period (from SubOrder)
    originalPeriod: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: true
      }
    },

    // Requested early return details
    requestedReturnDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          // Must be at least 1 day before original end date
          const oneDayBeforeEnd = new Date(this.originalPeriod.endDate);
          oneDayBeforeEnd.setDate(oneDayBeforeEnd.getDate() - 1);
          oneDayBeforeEnd.setHours(0, 0, 0, 0);

          const requestDate = new Date(value);
          requestDate.setHours(0, 0, 0, 0);

          const startDate = new Date(this.originalPeriod.startDate);
          startDate.setHours(0, 0, 0, 0);

          // Must be between start date and at least 1 day before end date
          return requestDate >= startDate && requestDate <= oneDayBeforeEnd;
        },
        message:
          'Return date must be at least 1 day before original end date and not before rental start date'
      }
    },

    // Return address
    returnAddress: {
      streetAddress: {
        type: String,
        required: true
      },
      ward: String,
      district: String,
      city: String,
      province: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      },
      contactName: String,
      contactPhone: {
        type: String,
        required: true
      },
      isOriginalAddress: {
        type: Boolean,
        default: true // True if using renter's saved address
      }
    },

    // Delivery method (from original order)
    deliveryMethod: {
      type: String,
      enum: ['PICKUP', 'DELIVERY'],
      required: true
    },

    // Status
    status: {
      type: String,
      enum: [
        'PENDING', // Waiting for owner acknowledgment
        'ACKNOWLEDGED', // Owner acknowledged the request
        'RETURNED', // Items returned and confirmed by owner
        'COMPLETED', // Deposit refunded, order completed
        'AUTO_COMPLETED', // Auto-completed after 24h
        'CANCELLED' // Request cancelled by renter
      ],
      default: 'PENDING',
      index: true
    },

    // Owner confirmation
    ownerConfirmation: {
      acknowledgedAt: Date,
      returnedAt: Date, // When owner confirms receipt
      notes: String,
      qualityCheck: {
        condition: {
          type: String,
          enum: ['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED']
        },
        notes: String,
        photos: [String]
      }
    },

    // Deposit refund information
    depositRefund: {
      amount: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
        default: 'PENDING'
      },
      refundedAt: Date,
      transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
      }
    },

    // Auto-completion tracking
    autoCompletionScheduled: {
      type: Boolean,
      default: false
    },
    autoCompletionDate: {
      type: Date // Original end date + 24h
    },

    // Owner review tracking (can only review once per order)
    ownerReview: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review',
      default: null
    },
    canOwnerReview: {
      type: Boolean,
      default: true
    },

    // Notes
    renterNotes: String,

    // Cancellation
    cancellation: {
      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      cancelledAt: Date,
      reason: String
    }
  },
  {
    timestamps: true,
    collection: 'earlyreturnrequests'
  }
);

// Indexes for efficient queries
earlyReturnRequestSchema.index({ renter: 1, status: 1 });
earlyReturnRequestSchema.index({ owner: 1, status: 1 });
earlyReturnRequestSchema.index({ subOrder: 1 });
earlyReturnRequestSchema.index({ status: 1, autoCompletionDate: 1 }); // For scheduled jobs

// Pre-save middleware - generate request number
earlyReturnRequestSchema.pre('save', function (next) {
  if (this.isNew && !this.requestNumber) {
    this.requestNumber = `ERR${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  }

  // Set auto-completion date (original end date + 24h)
  if (this.isNew && !this.autoCompletionDate) {
    const completionDate = new Date(this.originalPeriod.endDate);
    completionDate.setHours(completionDate.getHours() + 24);
    this.autoCompletionDate = completionDate;
  }

  next();
});

module.exports = mongoose.model('EarlyReturnRequest', earlyReturnRequestSchema);
