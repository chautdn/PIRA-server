const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    // Relationships
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reviewee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Review Type
    type: {
      type: String,
      enum: ['PRODUCT_REVIEW', 'USER_REVIEW'],
      required: true
    },

    // Rating
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },

    // Detailed Ratings
    detailedRating: {
      quality: {
        type: Number,
        min: 1,
        max: 5
      },
      communication: {
        type: Number,
        min: 1,
        max: 5
      },
      delivery: {
        type: Number,
        min: 1,
        max: 5
      },
      value: {
        type: Number,
        min: 1,
        max: 5
      }
    },

    // Review Content
    title: {
      type: String,
      trim: true,
      maxlength: 100
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },

    // Media
    photos: [String],

    // Status
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'],
      default: 'PENDING'
    },

    // Moderation
    moderation: {
      moderatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      moderatedAt: Date,
      reason: String
    },

    // Helpfulness
    helpfulness: {
      helpful: {
        type: Number,
        default: 0
      },
      notHelpful: {
        type: Number,
        default: 0
      }
    },

    // Response from reviewee
    response: {
      comment: String,
      respondedAt: Date
    }
  },
  {
    timestamps: true,
    collection: 'reviews'
  }
);

reviewSchema.index({ product: 1, status: 1 });
reviewSchema.index({ reviewer: 1 });
reviewSchema.index({ reviewee: 1 });
reviewSchema.index({ order: 1 });

module.exports = mongoose.model('Review', reviewSchema);
