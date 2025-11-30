const mongoose = require('mongoose');

const shipmentProofSchema = new mongoose.Schema(
  {
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true
    },
    imageBeforeDelivery: {
      type: String
    },
    imagesBeforeDelivery: [
      {
        type: String
      }
    ],
    imageAfterDelivery: {
      type: String
    },
    imagesAfterDelivery: [
      {
        type: String
      }
    ],
    imageAfterUsage: {
      type: String
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500
    },
    geolocation: {
      latitude: Number,
      longitude: Number
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    deletedAt: Date,
    updatedAt: Date
  },
  {
    timestamps: true,
    collection: 'shipment_proofs'
  }
);

// Index for quick lookup by shipment
shipmentProofSchema.index({ shipment: 1 });
shipmentProofSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ShipmentProof', shipmentProofSchema);
