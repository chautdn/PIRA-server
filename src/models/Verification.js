const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Verification Type
    type: {
      type: String,
      enum: ['EMAIL', 'PHONE', 'IDENTITY', 'BANK_ACCOUNT', 'ADDRESS'],
      required: true
    },

    // Verification Data
    data: {
      // For IDENTITY
      cccdNumber: String,
      cccdFrontImage: String,
      cccdBackImage: String,
      selfieImage: String,

      // For BANK_ACCOUNT
      bankName: String,
      accountNumber: String,
      accountHolder: String,

      // For EMAIL/PHONE
      token: String,
      otp: String,

      // For ADDRESS
      addressProof: String
    },

    // Status
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'EXPIRED'],
      default: 'PENDING'
    },

    // Processing
    submittedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: Date,
    expiresAt: Date,

    // Review
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewNotes: String,

    // AI Processing (for IDENTITY)
    aiProcessing: {
      confidence: Number,
      extractedData: mongoose.Schema.Types.Mixed,
      flags: [String]
    },

    // Attempts
    attemptCount: {
      type: Number,
      default: 1
    },
    maxAttempts: {
      type: Number,
      default: 3
    }
  },
  {
    timestamps: true,
    collection: 'verifications'
  }
);

verificationSchema.index({ user: 1, type: 1 });
verificationSchema.index({ status: 1, createdAt: -1 });
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Verification', verificationSchema);
