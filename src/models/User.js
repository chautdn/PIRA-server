const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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
      unique: true,
      sparse: true, // Cho phép null values
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
      default: 'RENTER',
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
        trim: true
      },
      lastName: {
        type: String,
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

    // Verification Status
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

// Indexes
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'verification.emailVerified': 1 });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

// Prevent model overwrite error
module.exports = mongoose.models.User || mongoose.model('User', userSchema);
