const mongoose = require('mongoose');

const productPromotionSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Pricing
  tier: {
    type: Number,
    enum: [1, 2, 3, 4, 5],
    required: true
  },
  pricePerDay: {
    type: Number,
    required: true
  },
  duration: {
    type: Number,
    required: true, // in days
    min: 1
  },
  totalAmount: {
    type: Number,
    required: true
  },
  discountApplied: {
    type: Number,
    default: 0
  },

  // Payment
  paymentMethod: {
    type: String,
    enum: ['wallet', 'payos'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  externalOrderCode: {
    type: String,
    index: true
  },

  // Scheduling
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  },

  // Recurring
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPeriod: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none'
  },
  autoRenew: {
    type: Boolean,
    default: false
  },
  renewalAttempts: {
    type: Number,
    default: 0
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for performance
productPromotionSchema.index({ product: 1, isActive: 1 });
productPromotionSchema.index({ user: 1, createdAt: -1 });
productPromotionSchema.index({ endDate: 1, isActive: 1 });
productPromotionSchema.index({ externalOrderCode: 1 });

// Ensure one active promotion per product
productPromotionSchema.pre('save', async function (next) {
  if (this.isActive && this.isNew) {
    const existing = await this.constructor.findOne({
      product: this.product,
      isActive: true,
      _id: { $ne: this._id }
    });

    if (existing) {
      throw new Error('Product already has an active promotion');
    }
  }
  next();
});

// Update updatedAt on save
productPromotionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('ProductPromotion', productPromotionSchema);
