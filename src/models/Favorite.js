const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    note: {
      type: String,
      trim: true,
      maxlength: 200
    },
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 5
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    deletedAt: Date
  },
  {
    timestamps: true,
    collection: 'favorites'
  }
);

// Compound index to ensure a user can only favorite a product once
favoriteSchema.index({ user: 1, product: 1 }, { unique: true });
favoriteSchema.index({ user: 1 });
favoriteSchema.index({ product: 1 });

module.exports = mongoose.model('Favorite', favoriteSchema);
