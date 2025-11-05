const mongoose = require('mongoose');

// Sub Order Schema - Đơn con cho từng chủ thuê
const subOrderSchema = new mongoose.Schema(
  {
    subOrderNumber: {
      type: String,
      required: true,
      unique: true
    },

    // Liên kết với MasterOrder
    masterOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
      required: true
    },

    // Chủ cho thuê
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Địa chỉ của chủ thuê (để tính phí ship)
    ownerAddress: {
      streetAddress: String,
      ward: String,
      district: String,
      city: String,
      province: String,
      latitude: Number,
      longitude: Number
    },

    // Danh sách sản phẩm thuê từ chủ này
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        quantity: {
          type: Number,
          required: true,
          min: 1
        },
        rentalRate: {
          type: Number,
          required: true
        },
        depositRate: {
          type: Number,
          required: true
        },
        totalRental: Number,
        totalDeposit: Number
      }
    ],

    // Thời gian thuê
    rentalPeriod: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: true
      },
      duration: {
        value: Number,
        unit: {
          type: String,
          enum: ['DAY', 'WEEK', 'MONTH']
        }
      }
    },

    // Tính toán giá
    pricing: {
      subtotalRental: {
        type: Number,
        required: true,
        default: 0
      },
      subtotalDeposit: {
        type: Number,
        required: true,
        default: 0
      },
      shippingFee: {
        type: Number,
        default: 0
      },
      shippingDistance: {
        type: Number, // km
        default: 0
      },
      totalAmount: {
        type: Number,
        required: true,
        default: 0
      }
    },

    // Thông tin vận chuyển
    shipping: {
      method: {
        type: String,
        enum: ['PICKUP', 'DELIVERY'],
        required: true
      },
      fee: {
        baseFee: {
          type: Number,
          default: 10000 // 10,000 VND cố định
        },
        pricePerKm: {
          type: Number,
          default: 5000 // 5,000 VND/km
        },
        totalFee: {
          type: Number,
          default: 0
        }
      },
      distance: {
        type: Number, // km
        default: 0
      },
      estimatedTime: Number, // minutes
      vietmapResponse: mongoose.Schema.Types.Mixed // Lưu response từ VietMap API
    },

    // Trạng thái của SubOrder
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING_OWNER_CONFIRMATION',
        'OWNER_CONFIRMED',
        'OWNER_REJECTED',
        'READY_FOR_CONTRACT',
        'CONTRACT_SIGNED',
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
        'ACTIVE',
        'RETURNED',
        'COMPLETED',
        'CANCELLED'
      ],
      default: 'DRAFT'
    },

    // Xác nhận từ chủ
    ownerConfirmation: {
      status: {
        type: String,
        enum: ['PENDING', 'CONFIRMED', 'REJECTED'],
        default: 'PENDING'
      },
      confirmedAt: Date,
      rejectedAt: Date,
      rejectionReason: String,
      notes: String
    },

    // Hợp đồng
    contract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract'
    },

    // Ghi chú
    notes: String,

    // Thông tin giao hàng
    delivery: {
      trackingNumber: String,
      shippedAt: Date,
      deliveredAt: Date,
      deliveryProof: [String], // URLs to delivery proof images
      shipper: {
        name: String,
        phone: String,
        vehicleInfo: String
      }
    },

    // Đánh giá từ người thuê về chủ và sản phẩm
    review: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtuals
subOrderSchema.virtual('totalProductValue').get(function () {
  return this.pricing.subtotalRental + this.pricing.subtotalDeposit;
});

subOrderSchema.virtual('grandTotal').get(function () {
  return this.pricing.subtotalRental + this.pricing.subtotalDeposit + this.pricing.shippingFee;
});

// Indexes
subOrderSchema.index({ masterOrder: 1, owner: 1 });
subOrderSchema.index({ subOrderNumber: 1 });
subOrderSchema.index({ owner: 1, status: 1 });
subOrderSchema.index({ 'rentalPeriod.startDate': 1, 'rentalPeriod.endDate': 1 });

// Pre-save middleware
subOrderSchema.pre('save', function (next) {
  if (this.isNew && !this.subOrderNumber) {
    this.subOrderNumber = `SO${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  }

  // Tính tổng tiền từ sản phẩm
  if (this.products && this.products.length > 0) {
    this.pricing.subtotalRental = this.products.reduce(
      (sum, item) => sum + (item.totalRental || 0),
      0
    );
    this.pricing.subtotalDeposit = this.products.reduce(
      (sum, item) => sum + (item.totalDeposit || 0),
      0
    );
  }

  // Tính tổng amount
  this.pricing.totalAmount =
    this.pricing.subtotalRental + this.pricing.subtotalDeposit + this.pricing.shippingFee;

  next();
});

module.exports = mongoose.model('SubOrder', subOrderSchema);
