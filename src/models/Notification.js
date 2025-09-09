const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // Recipient
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Notification Details
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },

    // Type & Category
    type: {
      type: String,
      enum: [
        'ORDER',
        'PAYMENT',
        'SHIPMENT',
        'REVIEW',
        'DISPUTE',
        'PROMOTION',
        'SYSTEM',
        'REMINDER'
      ],
      required: true
    },
    category: {
      type: String,
      enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR'],
      default: 'INFO'
    },

    // Related Entities
    relatedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    relatedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    relatedDispute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dispute'
    },



    // Status
    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'],
      default: 'PENDING'
    },

    // Actions
    actions: [
      {
        label: String,
        url: String,
        action: String
      }
    ],

    // Tracking
    readAt: Date,
    sentAt: Date,

    // Metadata
    data: mongoose.Schema.Types.Mixed,

    // Expiry
    expiresAt: Date
  },
  {
    timestamps: true,
    collection: 'notifications'
  }
);

notificationSchema.index({ recipient: 1, status: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
