const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  rental: {
    startDate: Date,
    endDate: Date,
    duration: {
      type: Number,
      default: 1,
      min: 1
    }
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    items: [cartItemSchema],
    lastModified: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: 'carts'
  }
);

// Index
cartSchema.index({ user: 1 });
cartSchema.index({ 'items.product': 1 });

// Update lastModified on save
cartSchema.pre('save', function(next) {
  this.lastModified = new Date();
  next();
});

// Virtual for total items
cartSchema.virtual('totalItems').get(function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Virtual for total price
cartSchema.virtual('totalPrice').get(function() {
  return this.items.reduce((total, item) => {
    if (item.product && item.product.pricing) {
      const price = item.product.pricing.dailyRate || 0;
      const days = item.rental?.duration || 1;
      return total + (price * days * item.quantity);
    }
    return total;
  }, 0);
});

// Ensure virtuals are included in JSON
cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Cart', cartSchema);

