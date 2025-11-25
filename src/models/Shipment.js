const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema(
  {
    shipmentId: {
      type: String,
      required: true,
      unique: true
    },

    // Relationships
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },
    subOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubOrder'
    },
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Shipment Type
    type: {
      type: String,
      enum: ['PICKUP', 'DELIVERY', 'RETURN'],
      required: true
    },

    // Locations
    fromAddress: {
      streetAddress: String,
      ward: String,
      district: String,
      city: String,
      province: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    toAddress: {
      streetAddress: String,
      ward: String,
      district: String,
      city: String,
      province: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },

    // Contact Info
    contactInfo: {
      name: String,
      phone: String,
      notes: String
    },

    // Scheduling
    scheduledAt: Date,
    estimatedDuration: Number, // minutes

    // Status
    status: {
      type: String,
      enum: ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'],
      default: 'PENDING'
    },

    // Tracking
    tracking: {
      pickedUpAt: Date,
      deliveredAt: Date,
      notes: String,
      photos: [String],
      signature: String
    },

    // Delivery Fee
    fee: {
      type: Number,
      default: 0
    },

    // Quality Check
    qualityCheck: {
      condition: {
        type: String,
        enum: ['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED']
      },
      notes: String,
      photos: [String],
      checkedAt: Date
    },

    // Rental Transfer tracking
    rentalTransferred: {
      type: Boolean,
      default: false
    },
    rentalTransferredAt: Date
  },
  {
    timestamps: true,
    collection: 'shipments'
  }
);

shipmentSchema.index({ shipmentId: 1 });
shipmentSchema.index({ order: 1 });
shipmentSchema.index({ subOrder: 1 });
shipmentSchema.index({ shipper: 1, status: 1 });
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ rentalTransferred: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);
