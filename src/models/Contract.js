const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema(
  {
    contractNumber: {
      type: String,
      required: true,
      unique: true
    },

    // Relationships
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: false // Made optional since we might use subOrder instead
    },
    subOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubOrder',
      required: false // For partial confirmation contracts
    },
    masterOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
      required: false // Reference to MasterOrder
    },
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
      lateReturnPenalty: {
        type: Number,
        default: 0
      },
      damagePenalty: {
        type: Number,
        default: 0
      }
    },

    // Digital Signatures
    signatures: {
      owner: {
        signed: { type: Boolean, default: false },
        signedAt: Date,
        ipAddress: String,
        signature: String, // Base64 encoded signature image
        signatureHash: String // SHA-256 hash for verification
      },
      renter: {
        signed: { type: Boolean, default: false },
        signedAt: Date,
        ipAddress: String,
        signature: String,
        signatureHash: String
      }
    },

    // Contract Status
    status: {
      type: String,
      enum: [
        'DRAFT', // Nháp
        'PENDING_SIGNATURE', // Chờ ký
        'PENDING_OWNER', // Chờ chủ sở hữu ký
        'PENDING_RENTER', // Chờ người thuê ký
        'SIGNED', // Đã ký đầy đủ
        'ACTIVE', // Đang hiệu lực
        'COMPLETED', // Hoàn thành
        'TERMINATED', // Chấm dứt
        'EXPIRED' // Hết hạn
      ],
      default: 'DRAFT'
    },

    // Contract Content
    content: {
      htmlContent: String,
      pdfUrl: String,
      templateVersion: String
    },

    // Legal Information
    legal: {
      governingLaw: {
        type: String,
        default: 'Luật Việt Nam'
      },
      jurisdiction: {
        type: String,
        default: 'Tòa án Việt Nam'
      }
    },

    // Verification
    verification: {
      ownerIdVerified: { type: Boolean, default: false },
      renterIdVerified: { type: Boolean, default: false },
      contractHash: String, // Hash của toàn bộ hợp đồng
      timestamp: Date
    },

    isActive: {
      type: Boolean,
      default: false
    },

    expiresAt: Date,
    notes: String
  },
  {
    timestamps: true,
    collection: 'contracts'
  }
);

// Indexes
contractSchema.index({ contractNumber: 1 });
contractSchema.index({ order: 1 });
contractSchema.index({ subOrder: 1 });
contractSchema.index({ masterOrder: 1 });
contractSchema.index({ owner: 1, status: 1 });
contractSchema.index({ renter: 1, status: 1 });
contractSchema.index({ status: 1 });
contractSchema.index({ expiresAt: 1 });

// Virtual for checking if fully signed
contractSchema.virtual('isFullySigned').get(function () {
  return this.signatures.owner.signed && this.signatures.renter.signed;
});

// Method to generate contract number
contractSchema.statics.generateContractNumber = async function () {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  const todayStart = new Date(year, now.getMonth(), now.getDate());
  const todayEnd = new Date(year, now.getMonth(), now.getDate() + 1);

  const count = await this.countDocuments({
    createdAt: { $gte: todayStart, $lt: todayEnd }
  });

  const sequence = (count + 1).toString().padStart(4, '0');
  return `CT${year}${month}${day}${sequence}`;
};

// Method to sign contract
contractSchema.methods.signContract = async function (userId, ipAddress, signatureData) {
  const crypto = require('crypto');

  // Generate signature hash
  const signatureHash = crypto.createHash('sha256').update(signatureData).digest('hex');

  if (this.owner.toString() === userId.toString()) {
    this.signatures.owner = {
      signed: true,
      signedAt: new Date(),
      ipAddress,
      signature: signatureData,
      signatureHash
    };

    if (this.status === 'DRAFT') {
      this.status = 'PENDING_RENTER';
    }
  } else if (this.renter.toString() === userId.toString()) {
    this.signatures.renter = {
      signed: true,
      signedAt: new Date(),
      ipAddress,
      signature: signatureData,
      signatureHash
    };

    if (this.status === 'PENDING_RENTER') {
      this.status = 'SIGNED';
    }
  }

  // If both signed, mark as signed
  if (this.isFullySigned) {
    this.status = 'SIGNED';
    this.isActive = true;

    // Generate contract hash for verification
    const contractData = {
      contractNumber: this.contractNumber,
      terms: this.terms,
      signatures: this.signatures
    };
    this.verification.contractHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(contractData))
      .digest('hex');
    this.verification.timestamp = new Date();
  }

  return await this.save();
};

// Method to verify signature
contractSchema.methods.verifySignature = function (userId, signatureData) {
  const crypto = require('crypto');
  const signatureHash = crypto.createHash('sha256').update(signatureData).digest('hex');

  if (this.owner.toString() === userId.toString()) {
    return this.signatures.owner.signatureHash === signatureHash;
  } else if (this.renter.toString() === userId.toString()) {
    return this.signatures.renter.signatureHash === signatureHash;
  }

  return false;
};

module.exports = mongoose.model('Contract', contractSchema);
