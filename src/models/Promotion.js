const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },

    // Promotion Code
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },

    // Promotion Type
    type: {
      type: String,
      enum: ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'FIRST_TIME_USER', 'LOYALTY'],
      required: true
    },

    // Discount Value
    value: {
      type: Number,
      required: true,
      min: 0
    },
    maxDiscount: {
      type: Number,
      min: 0
    },

    // Validity
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },

    // Usage Limits
    usageLimit: {
      total: {
        type: Number,
        min: 1
      },
      perUser: {
        type: Number,
        default: 1,
        min: 1
      }
    },
    usageCount: {
      type: Number,
      default: 0
    },

    // Conditions
    conditions: {
      minOrderAmount: {
        type: Number,
        default: 0
      },
      maxOrderAmount: Number,
      eligibleCategories: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Category'
        }
      ],
      eligibleProducts: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product'
        }
      ],
      userGroups: [String], // ['NEW_USER', 'VIP', 'REGULAR']
      firstTimeOnly: {
        type: Boolean,
        default: false
      }
    },

    // Status
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'EXPIRED', 'DEACTIVATED'],
      default: 'DRAFT'
    },

    // Creator
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Media
    image: String,
    bannerImage: String
  },
  {
    timestamps: true,
    collection: 'promotions'
  }
);

promotionSchema.index({ code: 1 });
promotionSchema.index({ status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Promotion', promotionSchema);
