const mongoose = require('mongoose');

// Extension Request Schema - Yêu cầu gia hạn thuê
const extensionRequestSchema = new mongoose.Schema(
  {
    // Liên kết với SubOrder
    subOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubOrder',
      required: true
    },

    // Liên kết với MasterOrder
    masterOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
      required: true
    },

    // Người thuê (renter)
    renter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Chủ cho thuê (owner)
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Ngày kết thúc hiện tại
    currentEndDate: {
      type: Date,
      required: true
    },

    // Ngày kết thúc mới yêu cầu
    newEndDate: {
      type: Date,
      required: true
    },

    // Số ngày gia hạn
    extensionDays: {
      type: Number,
      required: true,
      min: 1
    },

    // Giá thuê mỗi ngày
    rentalRate: {
      type: Number,
      required: true
    },

    // Chi phí gia hạn
    extensionCost: {
      type: Number,
      required: true
    },

    // Tổng chi phí (có thể bao gồm cọc, phí khác)
    totalCost: {
      type: Number,
      required: true
    },

    // Lý do gia hạn
    extensionReason: {
      type: String,
      default: ''
    },

    // Phương thức thanh toán
    paymentMethod: {
      type: String,
      enum: ['WALLET', 'PAYOS', 'COD', 'BANK_TRANSFER'],
      default: 'WALLET'
    },

    // Trạng thái thanh toán
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: 'PENDING'
    },

    // Thông tin thanh toán
    paymentInfo: {
      transactionId: String,
      paymentDate: Date,
      paymentDetails: mongoose.Schema.Types.Mixed
    },

    // Trạng thái yêu cầu
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
      default: 'PENDING'
    },

    // Ngày gửi yêu cầu
    requestedAt: {
      type: Date,
      default: Date.now
    },

    // Ngày chấp nhận/từ chối
    approvedAt: {
      type: Date
    },

    rejectedAt: {
      type: Date
    },

    // Phản hồi từ owner
    ownerResponse: {
      status: {
        type: String,
        enum: ['APPROVED', 'REJECTED']
      },
      respondedAt: Date,
      rejectionReason: String,
      notes: String
    }
  },
  {
    timestamps: true,
    collection: 'ExtensionRequests',
    strict: false
  }
);

// Index for faster queries
extensionRequestSchema.index({ subOrder: 1, renter: 1 });
extensionRequestSchema.index({ owner: 1, status: 1 });
extensionRequestSchema.index({ renter: 1, status: 1 });
extensionRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ExtensionRequests', extensionRequestSchema);