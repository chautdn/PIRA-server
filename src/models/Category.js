const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    // Hierarchical Structure
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null
    },
    level: {
      type: Number,
      default: 0,
      min: 0,
      max: 3
    },
    path: {
      type: String,
      trim: true
    },

    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    },
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 10
    },

    deletedAt: Date
  },
  {
    timestamps: true,
    collection: 'categories'
  }
);

categorySchema.index({ parentCategory: 1 });
categorySchema.index({ slug: 1 });
categorySchema.index({ status: 1, priority: -1 });

module.exports = mongoose.model('Category', categorySchema);
