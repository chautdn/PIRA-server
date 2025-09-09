const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true
    },

    // Relationships
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
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },

    // Rental Period
    rental: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: true
      },
      actualStartDate: Date,
      actualEndDate: Date,
      duration: {
        value: Number,
        unit: {
          type: String,
          enum: ['DAY', 'WEEK', 'MONTH']
        }
      }
    },

    // Pricing
    pricing: {
      rentalRate: {
        type: Number,
        required: true
      },
      subtotal: {
        type: Number,
        required: true
      },
      deposit: {
        type: Number,
        required: true
      },
      deliveryFee: {
        type: Number,
        default: 0
      },
      total: {
        type: Number,
        required: true
      }
    },

    // Delivery
    delivery: {
      method: {
        type: String,
        enum: ['PICKUP', 'DELIVERY'],
        required: true
      },
      address: {
        streetAddress: String,
        ward: String,
        district: String,
        city: String,
        province: String
      },
      contactPhone: String
    },

    // Status
    status: {
      type: String,
      enum: [
        'PENDING',
        'CONFIRMED',
        'PAID',
        'SHIPPED',
        'DELIVERED',
        'ACTIVE',
        'RETURNED',
        'COMPLETED',
        'CANCELLED'
      ],
      default: 'PENDING'
    },

    // Payment Status
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING'
    },

    notes: String,

    // Cancellation
    cancellation: {
      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      cancelledAt: Date,
      reason: String
    },

    confirmedAt: Date,
    completedAt: Date
  },
  {
    timestamps: true,
    collection: 'orders'
  }
);

orderSchema.index({ orderNumber: 1 });
orderSchema.index({ renter: 1, status: 1 });
orderSchema.index({ owner: 1, status: 1 });
orderSchema.index({ product: 1 });

module.exports = mongoose.model('Order', orderSchema);
