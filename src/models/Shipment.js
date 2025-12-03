
const mongoose = require('mongoose');

const shipmentSchema = new mongoose.Schema(
  {
    shipmentId: {
      type: String,
      required: true,
      unique: true
    },

    // Relationships
    subOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubOrder',
      required: true
    },
    // Reference đến product cụ thể trong SubOrder.products array
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    // Index của product trong mảng products của SubOrder
    productIndex: {
      type: Number,
      required: true,
      min: 0
    },
    shipper: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Shipment Type
    type: {
      type: String,
      enum: ['DELIVERY', 'RETURN'],
      required: true
    },

    // Return Type (nếu là RETURN)
    returnType: {
      type: String,
      enum: ['NORMAL', 'EARLY'], // Trả đúng hạn hoặc trả sớm
      required: function () {
        return this.type === 'RETURN';
      }
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

    // Customer Info (Renter or Owner - whoever receives/sends the shipment)
    customerInfo: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      name: String,
      phone: String,
      email: String
    },

    // Scheduling
    scheduledAt: Date,
    estimatedDuration: Number, // minutes

    // Status
    status: {
      type: String,
      enum: [
        'PENDING', // Chờ shipper nhận
        'SHIPPER_CONFIRMED', // Shipper đã xác nhận
        'IN_TRANSIT', // Đang vận chuyển
        'DELIVERED', // Đã giao thành công
        'DELIVERY_FAILED', // Giao hàng thất bại (sản phẩm có vấn đề)
        'FAILED', // Giao/trả thất bại - không liên lạc được
        'CANCELLED' // Đã hủy
      ],
      default: 'PENDING'
    },

    // Tracking
    tracking: {
      pickedUpAt: Date,
      deliveredAt: Date,
      notes: String,
      photos: [String],
      signature: String,
      failureReason: String, // Lý do thất bại
      notificationSentAt: Date // Email sent timestamp
    },

    // Delivery Fee
    fee: {
      type: Number,
      default: 0
    },

    // Quality Check (đặc biệt quan trọng cho RETURN)
    qualityCheck: {
      condition: {
        type: String,
        enum: ['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED']
      },
      notes: String,
      photos: [String],
      checkedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      checkedAt: Date
    },

    // Disputes liên quan
    disputes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Dispute'
      }
    ]
  },
  {
    timestamps: true,
    collection: 'shipments'
  }
);

shipmentSchema.index({ shipmentId: 1 });
shipmentSchema.index({ subOrder: 1, productId: 1, type: 1 }); // Allow DELIVERY and RETURN for same product
shipmentSchema.index({ shipper: 1, status: 1 });
shipmentSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);