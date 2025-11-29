const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    // Relationships
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: false
    },
    subOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubOrder',
      required: false
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },

    // Review Type
    type: {
      type: String,
      enum: ['PRODUCT_REVIEW', 'USER_REVIEW'],
      required: false
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
      required: false,
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

    // Intended role when reviewee is not set at creation time (dev/testing)
    // allows temporarily storing that this USER_REVIEW was meant for OWNER or SHIPPER
    intendedFor: {
      type: String,
      enum: ['OWNER', 'SHIPPER'],
      required: false
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

    // Users who liked this review (for toggling likes)
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],

    // Responses from reviewee(s) (allow nested replies)
    responses: [
      {
        commenter: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        comment: String,
        respondedAt: Date,
        editedAt: Date,
        helpfulness: {
          helpful: { type: Number, default: 0 },
          notHelpful: { type: Number, default: 0 }
        },
        likedBy: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          }
        ],
        // allow replies to responses (nested)
        responses: [
          {
            commenter: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'User'
            },
            comment: String,
            respondedAt: Date,
            editedAt: Date,
            helpfulness: {
              helpful: { type: Number, default: 0 },
              notHelpful: { type: Number, default: 0 }
            },
            likedBy: [
              {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
              }
            ],
            // further nesting allowed (keeps the same shape)
            responses: []
          }
        ]
      }
    ]
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
reviewSchema.index({ subOrder: 1 });

module.exports = mongoose.model('Review', reviewSchema);

