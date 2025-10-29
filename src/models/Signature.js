const mongoose = require('mongoose');

const signatureSchema = new mongoose.Schema(
  {
    // Owner information
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Signature data
    signatureData: {
      type: String, // Base64 encoded signature
      required: true
    },

    // Signature metadata
    metadata: {
      width: Number,
      height: Number,
      format: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    },

    // Usage tracking
    usageCount: {
      type: Number,
      default: 0
    },

    lastUsed: Date,

    // Verification
    isVerified: {
      type: Boolean,
      default: false
    },

    // Status
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    collection: 'signatures'
  }
);

// Indexes
signatureSchema.index({ user: 1 });
signatureSchema.index({ isActive: 1 });

// Method to use signature
signatureSchema.methods.use = function () {
  this.usageCount += 1;
  this.lastUsed = new Date();
  return this.save();
};

module.exports = mongoose.model('Signature', signatureSchema);
