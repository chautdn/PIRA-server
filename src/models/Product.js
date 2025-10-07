const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
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
      maxlength: 2000
    },

    // Relationships
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Product Details
    brand: {
      name: String,
      model: String
    },
    condition: {
      type: String,
      enum: ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'],
      required: true
    },

    // Media
    images: [
      {
        url: {
          type: String,
          required: true
        },
        alt: String,
        isMain: {
          type: Boolean,
          default: false
        }
      }
    ],
    videos: [
      {
        url: String,
        title: String,
        duration: Number,
        thumbnail: String
      }
    ],

    // Pricing
    pricing: {
      dailyRate: {
        type: Number,
        required: true,
        min: 0
      },
      weeklyRate: {
        type: Number,
        min: 0
      },
      monthlyRate: {
        type: Number,
        min: 0
      },
      deposit: {
        amount: {
          type: Number,
          required: true,
          min: 0
        },
        description: String
      },
      currency: {
        type: String,
        default: 'VND'
      }
    },

    // Location
    location: {
      address: {
        streetAddress: String,
        ward: String,
        district: String,
        city: String,
        province: String
      },
      coordinates: {
        latitude: Number,
        longitude: Number
      },
      deliveryOptions: {
        pickup: {
          type: Boolean,
          default: true
        },
        delivery: {
          type: Boolean,
          default: true
        },
        deliveryFee: {
          type: Number,
          default: 0
        }
      }
    },

    // Status & Availability
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING', 'ACTIVE', 'RENTED', 'INACTIVE', 'SUSPENDED'],
      default: 'DRAFT'
    },
    availability: {
      isAvailable: {
        type: Boolean,
        default: true
      },
      quantity: {
        type: Number,
        default: 1,
        min: 0
      }
    },

    // Metrics
    metrics: {
      viewCount: {
        type: Number,
        default: 0
      },
      rentalCount: {
        type: Number,
        default: 0
      },
      averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
      },
      reviewCount: {
        type: Number,
        default: 0
      }
    },

    // SEO
    slug: {
      type: String,
      unique: true,
      sparse: true
    },

    // Featured System
    featuredTier: {
      type: Number,
      enum: [1, 2, 3, 4, 5], // 1 = highest priority, 5 = lowest
      default: null
    },
    featuredExpiresAt: {
      type: Date,
      default: null
    },
    featuredPaymentAmount: {
      type: Number,
      default: 0
    },
    featuredPaymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
      default: null
    },
    featuredUpgradedAt: {
      type: Date,
      default: null
    },

    deletedAt: Date
  },
  {
    timestamps: true,
    collection: 'products'
  }
);

productSchema.index({ owner: 1 });
productSchema.index({ category: 1, subCategory: 1 });
productSchema.index({ status: 1 });
productSchema.index({ 'pricing.dailyRate': 1 });
productSchema.index({ slug: 1 });

// Featured indexes
productSchema.index({ featuredTier: 1, featuredExpiresAt: 1 });
productSchema.index({ featuredTier: 1, featuredUpgradedAt: -1 });
productSchema.index({ featuredPaymentStatus: 1, featuredTier: 1 });

// Instance methods
productSchema.methods.isFeaturedActive = function () {
  if (!this.featuredTier) {
    return false;
  }

  const now = new Date();
  const endDate = this.featuredExpiresAt;

  // Check if featured is still active
  if (endDate && now > endDate) {
    return false;
  }

  return true;
};

productSchema.methods.getFeaturedTierName = function () {
  const tierNames = {
    1: 'Premium',
    2: 'Gold',
    3: 'Silver',
    4: 'Bronze',
    5: 'Basic'
  };

  return tierNames[this.featuredTier] || 'None';
};

module.exports = mongoose.model('Product', productSchema);
