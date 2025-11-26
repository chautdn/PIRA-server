const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    disputeId: {
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
    // Reference đến product cụ thể
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    productIndex: {
      type: Number,
      required: true,
      min: 0
    },
    // Shipment liên quan (nếu có)
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment'
    },
    complainant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    respondent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Dispute Details
    type: {
      type: String,
      enum: [
        'PRODUCT_DAMAGE', // Sản phẩm bị hỏng
        'PRODUCT_NOT_AS_DESCRIBED', // Không đúng mô tả
        'DELIVERY_ISSUE', // Vấn đề giao hàng
        'MISSING_ITEMS', // Thiếu hàng
        'RETURN_ISSUE', // Vấn đề trả hàng
        'DAMAGED_ON_RETURN', // Hư hỏng khi trả
        'LATE_RETURN', // Trả hàng trễ
        'OTHER'
      ],
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },

    // Evidence
    evidence: {
      photos: [String],
      documents: [String],
      additionalInfo: String
    },

    // Status
    status: {
      type: String,
      enum: [
        'OPEN', // Mới tạo
        'IN_PROGRESS', // Đang xử lý
        'PENDING_EVIDENCE', // Chờ bằng chứng bổ sung
        'ESCALATED', // Đã chuyển lên cấp cao hơn
        'RESOLVED', // Đã giải quyết
        'CLOSED' // Đã đóng
      ],
      default: 'OPEN'
    },

    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM'
    },

    // Resolution
    resolution: {
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      resolvedAt: Date,
      resolution: String,
      compensationAmount: Number,
      compensationTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      // Refund hoặc penalty
      financialImpact: {
        refundAmount: Number,
        penaltyAmount: Number,
        paidBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        paidTo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      }
    },

    // Communication
    messages: [
      {
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        message: String,
        timestamp: {
          type: Date,
          default: Date.now
        },
        attachments: [String]
      }
    ]
  },
  {
    timestamps: true,
    collection: 'disputes'
  }
);

disputeSchema.index({ disputeId: 1 });
disputeSchema.index({ subOrder: 1, productId: 1 });
disputeSchema.index({ complainant: 1 });
disputeSchema.index({ status: 1, priority: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);
