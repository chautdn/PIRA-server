const mongoose = require('mongoose');

const shipmentProofSchema = new mongoose.Schema(
  {
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true
    },
    imageBeforeDelivery: {
      type: String,
      required: true
    },
    imageAfterDelivery: {
      type: String,
      required: true
    },
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
