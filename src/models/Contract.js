const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema(
  {
    // Contract Identification
    contractNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true
    },

    // Related Order
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },

    // Contract Parties
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    renter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Product Information
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },

    // Contract Terms
    terms: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: true
      },
      rentalRate: {
        type: Number,
        required: true
      },
      deposit: {
        type: Number,
        required: true
      },
      totalAmount: {
        type: Number,
        required: true
      },
      currency: {
        type: String,
        default: 'VND'
      }
    },

    // Digital Signatures
    signatures: {
      owner: {
        signed: {
          type: Boolean,
          default: false
        },
        signedAt: Date,
        ipAddress: String
      },
      renter: {
        signed: {
          type: Boolean,
          default: false
        },
        signedAt: Date,
        ipAddress: String
      }
    },

    // Contract Status
    status: {
      type: String,
      enum: ['DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'ACTIVE', 'COMPLETED', 'TERMINATED'],
      default: 'DRAFT'
    },

    // Contract validity
    isActive: {
      type: Boolean,
      default: false
    },

    // File attachments
    contractFile: String, // URL to signed contract file

    deletedAt: Date
  },
  {
    timestamps: true,
    collection: 'contracts'
  }
);

// Indexes
contractSchema.index({ contractNumber: 1 }, { unique: true });
contractSchema.index({ order: 1 });
contractSchema.index({ owner: 1, status: 1 });
contractSchema.index({ renter: 1, status: 1 });

// Virtual for is fully signed
contractSchema.virtual('isFullySigned').get(function () {
  return this.signatures.owner.signed && this.signatures.renter.signed;
});

// Method to sign contract
contractSchema.methods.signContract = function (userId, ipAddress) {
  const signatureInfo = {
    signed: true,
    signedAt: new Date(),
    ipAddress: ipAddress
  };

  if (this.owner.toString() === userId.toString()) {
    this.signatures.owner = { ...this.signatures.owner, ...signatureInfo };
  } else if (this.renter.toString() === userId.toString()) {
    this.signatures.renter = { ...this.signatures.renter, ...signatureInfo };
  } else {
    throw new Error('User not authorized to sign this contract');
  }

  // Update status if both parties have signed
  if (this.signatures.owner.signed && this.signatures.renter.signed) {
    this.status = 'SIGNED';
    this.isActive = true;
  }

  return this.save();
};

// Static method to generate contract number
contractSchema.statics.generateContractNumber = function () {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();

  return `CON${year}${month}${day}${random}`;
};

// Pre-save middleware
contractSchema.pre('save', function (next) {
  if (this.isNew && !this.contractNumber) {
    this.contractNumber = this.constructor.generateContractNumber();
  }
  next();
});

module.exports = mongoose.model('Contract', contractSchema);
