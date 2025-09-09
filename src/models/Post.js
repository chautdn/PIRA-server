const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },

    // Author
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Related Product (optional)
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },

    // Post Type
    type: {
      type: String,
      enum: ['ANNOUNCEMENT', 'PROMOTION', 'TIPS', 'NEWS'],
      default: 'ANNOUNCEMENT'
    },

    // Media
    images: [String],

    // Status
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT'
    },

    // Metrics
    viewCount: {
      type: Number,
      default: 0
    },

    // SEO
    slug: {
      type: String,
      unique: true,
      sparse: true
    },

    publishedAt: Date,
    deletedAt: Date
  },
  {
    timestamps: true,
    collection: 'posts'
  }
);

postSchema.index({ author: 1, status: 1 });
postSchema.index({ type: 1, status: 1 });
postSchema.index({ slug: 1 });

module.exports = mongoose.model('Post', postSchema);
