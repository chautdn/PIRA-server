const mongoose = require('mongoose');

// Master Order Schema - Chứa toàn bộ giao dịch của người thuê
const masterOrderSchema = new mongoose.Schema(
  {
    masterOrderNumber: {
      type: String,
      required: true,
      unique: true
    },

    // Người thuê
    renter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Danh sách SubOrder
    subOrders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubOrder'
      }
    ],

    // Tổng thanh toán
    totalAmount: {
      type: Number,
      required: true,
      default: 0
    },

    totalDepositAmount: {
      type: Number,
      required: true,
      default: 0
    },

    totalShippingFee: {
      type: Number,
      default: 0
    },

    // Thời gian thuê chung
    rentalPeriod: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: true
      }
    },

    // Địa chỉ giao hàng
    deliveryAddress: {
      streetAddress: {
        type: String,
        required: function () {
          return this.deliveryMethod === 'DELIVERY';
        }
      },
      ward: String,
      district: String,
      city: String,
      province: String,
      latitude: Number,
      longitude: Number,
      contactPhone: {
        type: String,
        required: function () {
          return this.deliveryMethod === 'DELIVERY';
        }
      },
      contactName: String
    },

    // Hình thức nhận hàng
    deliveryMethod: {
      type: String,
      enum: ['PICKUP', 'DELIVERY'],
      required: true
    },

    // Trạng thái tổng thể
    status: {
      type: String,
      enum: [
        'DRAFT', // Đơn tạm
        'PENDING_PAYMENT', // Chờ thanh toán
        'PAYMENT_COMPLETED', // Đã thanh toán
        'PENDING_CONFIRMATION', // Chờ xác nhận từ chủ
        'READY_FOR_CONTRACT', // Sẵn sàng ký hợp đồng
        'CONTRACT_SIGNED', // Đã ký hợp đồng
        'PROCESSING', // Đang xử lý
        'DELIVERED', // Đã giao hàng
        'ACTIVE', // Đang thuê
        'COMPLETED', // Hoàn thành
        'CANCELLED' // Đã hủy
      ],
      default: 'DRAFT'
    },

    // Trạng thái thanh toán
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING'
    },

    paymentMethod: {
      type: String,
      enum: ['WALLET', 'BANK_TRANSFER', 'PAYOS', 'COD']
    },

    // Thông tin thanh toán
    paymentInfo: {
      transactionId: String,
      paymentDate: Date,
      paymentDetails: mongoose.Schema.Types.Mixed
    },

    notes: String,

    // Thông tin hủy đơn
    cancellation: {
      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      cancelledAt: Date,
      reason: String,
      refundAmount: Number,
      refundStatus: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']
      }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtuals
masterOrderSchema.virtual('totalRentalAmount').get(function () {
  return this.totalAmount - this.totalShippingFee;
});

masterOrderSchema.virtual('grandTotal').get(function () {
  return this.totalAmount + this.totalDepositAmount + this.totalShippingFee;
});

// Indexes
masterOrderSchema.index({ renter: 1, status: 1 });
masterOrderSchema.index({ masterOrderNumber: 1 });
masterOrderSchema.index({ 'rentalPeriod.startDate': 1, 'rentalPeriod.endDate': 1 });

// Pre-save middleware
masterOrderSchema.pre('save', function (next) {
  if (this.isNew && !this.masterOrderNumber) {
    this.masterOrderNumber = `MO${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.model('MasterOrder', masterOrderSchema);
