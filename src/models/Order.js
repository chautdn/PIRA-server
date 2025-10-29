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

    paymentMethod: {
      type: String,
      enum: ['WALLET', 'BANK_TRANSFER', 'CASH_ON_DELIVERY'],
      required: true
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
      contactPhone: String,
      deliveredAt: Date,
      deliveryProof: String
    },

    // Status
    status: {
      type: String,
      enum: [
        'PENDING', // Chờ xác nhận
        'CONFIRMED', // Đã xác nhận
        'CONTRACT_PENDING', // Chờ ký hợp đồng
        'CONTRACT_SIGNED', // Đã ký hợp đồng
        'PAID', // Đã thanh toán
        'SHIPPED', // Đã giao hàng
        'DELIVERED', // Đã nhận hàng
        'ACTIVE', // Đang thuê
        'RETURNED', // Đã trả
        'COMPLETED', // Hoàn thành
        'CANCELLED' // Đã hủy
      ],
      default: 'PENDING'
    },

    // Payment Status
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING'
    },

    // Contract
    contract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract'
    },

    // Additional charges (overtime, damages, etc.)
    additionalCharges: {
      overtime: {
        days: { type: Number, default: 0 },
        amount: { type: Number, default: 0 }
      },
      damages: {
        description: String,
        amount: { type: Number, default: 0 }
      },
      total: { type: Number, default: 0 }
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

// Indexes
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ renter: 1, status: 1 });
orderSchema.index({ owner: 1, status: 1 });
orderSchema.index({ product: 1 });
orderSchema.index({ 'rental.startDate': 1, 'rental.endDate': 1 });

// Virtual for rental duration in days
orderSchema.virtual('rentalDays').get(function () {
  if (this.rental.startDate && this.rental.endDate) {
    return Math.ceil((this.rental.endDate - this.rental.startDate) / (1000 * 60 * 60 * 24));
  }
  return 0;
});

// Method to check if order is overdue
orderSchema.methods.isOverdue = function () {
  if (this.status === 'ACTIVE' && this.rental.endDate) {
    return new Date() > this.rental.endDate;
  }
  return false;
};

// Static method to generate order number
orderSchema.statics.generateOrderNumber = async function () {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  const todayStart = new Date(year, now.getMonth(), now.getDate());
  const todayEnd = new Date(year, now.getMonth(), now.getDate() + 1);

  const count = await this.countDocuments({
    createdAt: { $gte: todayStart, $lt: todayEnd }
  });

  const sequence = (count + 1).toString().padStart(4, '0');
  return `ORD${year}${month}${day}${sequence}`;
};

module.exports = mongoose.model('Order', orderSchema);
