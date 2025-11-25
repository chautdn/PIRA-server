const mongoose = require('mongoose');

// Master Order Schema - Đơn hàng chính từ người thuê
const masterOrderSchema = new mongoose.Schema(
  {
    masterOrderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // Người thuê
    renter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Danh sách SubOrders (một cho mỗi chủ)
    subOrders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubOrder'
      }
    ],

    // Địa chỉ giao hàng
    deliveryAddress: {
      streetAddress: String,
      ward: String,
      district: String,
      city: String,
      province: String,
      latitude: Number,
      longitude: Number,
      contactPhone: String
    },

    // Phương thức giao hàng
    deliveryMethod: {
      type: String,
      enum: ['PICKUP', 'DELIVERY', 'OWNER_DELIVERY'],
      required: true
    },

    // Trạng thái đơn hàng
    status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING_CONFIRMATION',
        'CONFIRMED',
        'PAYMENT_REQUIRED',
        'PAID',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'REFUNDED'
      ],
      default: 'DRAFT',
      index: true
    },

    // Thông tin thanh toán
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'PARTIAL', 'FAILED', 'REFUNDED'],
      default: 'PENDING'
    },

    paymentMethod: {
      type: String,
      enum: ['WALLET', 'BANK_TRANSFER', 'PAYOS', 'COD'],
      default: null
    },

    // Tổng tiền
    totalAmount: {
      type: Number,
      default: 0
    },

    totalDepositAmount: {
      type: Number,
      default: 0
    },

    totalShippingFee: {
      type: Number,
      default: 0
    },

    totalAmountWithShipping: {
      type: Number,
      default: 0
    },

    // Lịch sử trạng thái
    statusHistory: [
      {
        status: String,
        changedAt: Date,
        changedBy: String,
        reason: String
      }
    ],

    // Hợp đồng
    contracts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Contract'
      }
    ],

    // Ghi chú
    notes: String,

    // Thông tin hủy đơn
    cancellationReason: String,
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    collection: 'masterorders'
  }
);

// Index for queries
masterOrderSchema.index({ renter: 1, createdAt: -1 });
masterOrderSchema.index({ status: 1, createdAt: -1 });
masterOrderSchema.index({ masterOrderNumber: 1 });

module.exports = mongoose.model('MasterOrder', masterOrderSchema);
