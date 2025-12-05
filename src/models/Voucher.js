const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema(
  {
    // Mã voucher (unique)
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },

    // Phần trăm giảm giá (25%, 50%, 100%)
    discountPercent: {
      type: Number,
      required: true,
      enum: [25, 50, 100],
      min: 0,
      max: 100
    },

    // Điểm loyalty cần để đổi
    requiredPoints: {
      type: Number,
      required: true,
      enum: [25, 50, 100]
    },

    // Loại voucher
    type: {
      type: String,
      default: 'SHIPPING_DISCOUNT',
      enum: ['SHIPPING_DISCOUNT']
    },

    // Người đổi voucher
    redeemedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Người sử dụng voucher (có thể khác người đổi)
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // Trạng thái sử dụng
    isUsed: {
      type: Boolean,
      default: false
    },

    // Đơn hàng áp dụng voucher
    appliedToOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
      default: null
    },

    // Reference to order where voucher was used (for tracking)
    usedInOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
      default: null
    },

    // Thời gian sử dụng
    usedAt: {
      type: Date,
      default: null
    },

    // Thời gian hết hạn (30 ngày từ khi đổi)
    expiresAt: {
      type: Date,
      required: true
    },

    // Trạng thái voucher
    status: {
      type: String,
      enum: ['ACTIVE', 'USED', 'EXPIRED'],
      default: 'ACTIVE'
    }
  },
  {
    timestamps: true,
    collection: 'vouchers'
  }
);

// Indexes
voucherSchema.index({ code: 1 });
voucherSchema.index({ redeemedBy: 1, status: 1 });
voucherSchema.index({ expiresAt: 1 });
voucherSchema.index({ isUsed: 1, status: 1 });

// Pre-save: Generate unique code if not provided
voucherSchema.pre('save', function (next) {
  if (this.isNew && !this.code) {
    // Generate code: SHIP[discount%]-[random]
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.code = `SHIP${this.discountPercent}-${randomPart}`;
  }
  next();
});

// Method to check if voucher is valid
voucherSchema.methods.isValid = function () {
  if (this.isUsed || this.status === 'USED') {
    return { valid: false, reason: 'Voucher đã được sử dụng' };
  }

  if (this.status === 'EXPIRED' || new Date() > this.expiresAt) {
    return { valid: false, reason: 'Voucher đã hết hạn' };
  }

  return { valid: true };
};

// Static method to generate unique voucher code
voucherSchema.statics.generateUniqueCode = async function (discountPercent) {
  let code;
  let exists = true;

  while (exists) {
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    code = `SHIP${discountPercent}-${randomPart}`;
    exists = await this.findOne({ code });
  }

  return code;
};

module.exports = mongoose.model('Voucher', voucherSchema);
