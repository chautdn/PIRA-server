const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    disputeId: {
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
    complainant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    respondent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Dispute Details
    type: {
      type: String,
      enum: [
        'PRODUCT_DAMAGE',
        'LATE_RETURN',
        'NOT_AS_DESCRIBED',
        'PAYMENT_ISSUE',
        'DELIVERY_ISSUE',
        'OTHER'
      ],
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },

    // Evidence
    evidence: {
      photos: [String],
      documents: [String],
      additionalInfo: String
    },

    // Status
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED'],
      default: 'OPEN'
    },

    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM'
    },

    // Resolution
    resolution: {
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      resolvedAt: Date,
      resolution: String,
      compensationAmount: Number,
      compensationTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    },

    // Communication
    messages: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        message: String,
        timestamp: {
          type: Date,
          default: Date.now
        },
        attachments: [String]
      }
    ]
  },
  {
    timestamps: true,
    collection: 'disputes'
  }
);

disputeSchema.index({ disputeId: 1 });
disputeSchema.index({ order: 1 });
disputeSchema.index({ complainant: 1 });
disputeSchema.index({ status: 1, priority: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);
