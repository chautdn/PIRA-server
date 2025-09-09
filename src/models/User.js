const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // Authentication
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },

    // Role & Status
    role: {
      type: String,
      enum: ['RENTER', 'OWNER', 'ADMIN', 'SHIPPER'],
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'INACTIVE', 'BANNED', 'SUSPENDED'],
      default: 'PENDING'
    },

    // Profile
    profile: {
      firstName: {
        type: String,
        required: true,
        trim: true
      },
      lastName: {
        type: String,
        required: true,
        trim: true
      },
      avatar: String,
      dateOfBirth: Date,
      gender: {
        type: String,
        enum: ['MALE', 'FEMALE', 'OTHER']
      }
    },

    // Contact Info
    address: {
      streetAddress: String,
      district: String,
      city: String,
      province: String,
      country: {
        type: String,
        default: 'VN'
      },
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },

    // Basic Verification Status
    verification: {
      emailVerified: {
        type: Boolean,
        default: false
      },
      phoneVerified: {
        type: Boolean,
        default: false
      },
      identityVerified: {
        type: Boolean,
        default: false
      }
    },

    // Credit System
    creditScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 1000
    },

    lastLoginAt: Date,
    deletedAt: Date
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
