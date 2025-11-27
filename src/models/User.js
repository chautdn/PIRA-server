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
        required: false,
        validate: {
          validator: function (v) {
            // Allow null, undefined, empty string, or valid enum values
            return !v || v === '' || ['MALE', 'FEMALE', 'OTHER'].includes(v);
          },
          message: 'Gender must be MALE, FEMALE, OTHER, or empty'
        }
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

    // KYC/CCCD Information
    cccd: {
      frontImageHash: String, // URL ảnh mặt trước đã mã hóa
      backImageHash: String, // URL ảnh mặt sau đã mã hóa
      cccdNumber: String, // Số CCCD
      fullName: String, // Họ tên trên CCCD
      dateOfBirth: Date, // Ngày sinh
      address: String, // Địa chỉ trên CCCD
      gender: String, // Giới tính
      uploadedAt: Date, // Thời gian upload ảnh
      isVerified: {
        // Trạng thái xác thực
        type: Boolean,
        default: false
      },
      verifiedAt: Date, // Thời gian xác thực
      verificationSource: String // Nguồn xác thực (FPT.AI, VNPT, etc.)
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

    // Loyalty Points System
    loyaltyPoints: {
      type: Number,
      default: 0,
      min: 0
    },

    // Bank Account Information (for withdrawals)
    bankAccount: {
      bankCode: {
        type: String,
        enum: [
          'VCB',
          'TCB',
          'BIDV',
          'VTB',
          'ACB',
          'MB',
          'TPB',
          'STB',
          'VPB',
          'AGR',
          'EIB',
          'MSB',
          'SCB',
          'SHB',
          'OCB'
        ]
      },
      bankName: String,
      accountNumber: String,
      accountHolderName: {
        type: String,
        uppercase: true
      },
      isVerified: {
        type: Boolean,
        default: false
      },
      addedAt: Date
    },

    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet'
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
userSchema.index({ 'cccd.isVerified': 1 });
userSchema.index({ 'cccd.cccdNumber': 1 });

// Clean up empty strings before saving
userSchema.pre('save', function (next) {
  // Clean up profile.gender - convert empty string to undefined
  if (this.profile && this.profile.gender === '') {
    this.profile.gender = undefined;
  }

  // Clean up phone - convert empty string to null to avoid duplicate key error
  if (this.phone === '') {
    this.phone = null;
  }

  next();
});

// Clean up for findOneAndUpdate operations
userSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
  const update = this.getUpdate();

  // Handle direct updates
  if (update.phone === '') {
    update.phone = null;
  }

  // Handle $set updates
  if (update.$set && update.$set.phone === '') {
    update.$set.phone = null;
  }

  // Handle profile.gender
  if (update.$set && update.$set['profile.gender'] === '') {
    update.$set['profile.gender'] = undefined;
  }

  next();
});

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

// ADD: Create wallet when user is created
userSchema.post('save', async function (doc) {
  // Only create wallet for new users that don't already have one
  if (this.isNew && !doc.wallet) {
    try {
      const Wallet = require('./Wallet');

      // Create new wallet
      const wallet = new Wallet({
        user: doc._id,
        balance: {
          available: 0,
          frozen: 0,
          pending: 0
        },
        currency: 'VND',
        status: 'ACTIVE'
      });

      await wallet.save();

      // Update user document directly without triggering hooks
      await mongoose.model('User').updateOne({ _id: doc._id }, { wallet: wallet._id });

      console.log(`✅ Auto-created wallet ${wallet._id} for new user ${doc.email}`);
    } catch (error) {
      console.error('❌ Error auto-creating wallet for user:', doc.email, error.message);
    }
  }
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
