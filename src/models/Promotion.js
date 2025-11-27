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

    // Promotion Code (optional - only for product-specific vouchers, not system promotions)
    code: {
      type: String,
      unique: true,
      sparse: true, // Allow null values
      uppercase: true,
      trim: true
    },

    // Promotion Scope
    scope: {
      type: String,
      enum: ['PRODUCT', 'SYSTEM'],
      default: 'PRODUCT'
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
    bannerImage: String,

    // System Promotion Configuration (for shipping discount)
    systemPromotion: {
      isActive: {
        type: Boolean,
        default: false
      },
      discountType: {
        type: String,
        enum: ['PERCENTAGE', 'FIXED_AMOUNT'],
        default: 'PERCENTAGE'
      },
      shippingDiscountValue: {
        type: Number,
        min: 0,
        max: 100
      },
      applyTo: {
        type: String,
        enum: ['ALL_ORDERS', 'FIRST_ORDER', 'MIN_ORDER_VALUE'],
        default: 'ALL_ORDERS'
      },
      minOrderValue: Number
    },

    // Banner Display Configuration
    banner: {
      displayOnHome: {
        type: Boolean,
        default: false
      },
      bannerTitle: String,
      bannerDescription: String,
      bannerImage: String,
      backgroundColor: String,
      textColor: String
    }
  },
  {
    timestamps: true,
    collection: 'promotions'
  }
);

// Sparse unique index on code - allows null/undefined values
promotionSchema.index({ code: 1 }, { unique: true, sparse: true });
promotionSchema.index({ status: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('Promotion', promotionSchema);
