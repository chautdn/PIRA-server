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
    
    // Shipment type để phân biệt dispute lúc giao hàng hay trả hàng
    shipmentType: {
      type: String,
      enum: ['DELIVERY', 'RETURN'],
      required: true
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
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Dispute Details
    type: {
      type: String,
      enum: [
        // DELIVERY phase (renter mở)
        'PRODUCT_NOT_AS_DESCRIBED', // Không đúng mô tả (vali móp, máy ảnh lỗi)
        'MISSING_ITEMS', // Thiếu phụ kiện/số lượng
        'DAMAGED_BY_SHIPPER', // Shipper làm hỏng hàng
        'DELIVERY_FAILED_RENTER', // Renter boom hàng, không nghe máy
        
        // ACTIVE phase (renter mở)
        'PRODUCT_DEFECT', // Sản phẩm lỗi khi đang sử dụng
        
        // RETURN phase (owner mở)
        'DAMAGED_ON_RETURN', // Hư hỏng khi trả
        'LATE_RETURN', // Trả hàng trễ
        'RETURN_FAILED_OWNER', // Owner không nhận lại hàng
        'RENTER_NO_RETURN', // ⭐ NEW: Renter không trả hàng khi shipper đến lấy
        
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

    // Chi phí sửa chữa/bồi thường (cho DAMAGED_ON_RETURN)
    repairCost: {
      type: Number,
      default: 0,
      min: 0
    },

    // Evidence
    evidence: {
      photos: [String],
      videos: [String],
      documents: [String],
      additionalInfo: String
    },

    // Status - Flow chi tiết
    status: {
      type: String,
      enum: [
        'OPEN', // Mới tạo, chờ respondent phản hồi
        'RESPONDENT_ACCEPTED', // Respondent đồng ý -> Done
        'RESPONDENT_REJECTED', // Respondent từ chối -> Chuyển admin
        'ADMIN_REVIEW', // Auto-escalated lên admin (cho shipper damage)
        'ADMIN_REVIEWING', // Admin đang xem xét bằng chứng
        'ADMIN_DECISION_MADE', // Admin đưa ra quyết định sơ bộ
        'BOTH_ACCEPTED', // Cả 2 bên đồng ý quyết định admin -> Done
        'NEGOTIATION_NEEDED', // 1 bên không đồng ý -> Mở negotiation room
        'IN_NEGOTIATION', // Đang đàm phán (3 ngày)
        'NEGOTIATION_AGREED', // 2 bên thỏa thuận xong -> Chờ admin chốt
        'NEGOTIATION_FAILED', // Không thỏa thuận được sau 3 ngày
        'THIRD_PARTY_ESCALATED', // Chuyển bên thứ 3 giải quyết
        'THIRD_PARTY_EVIDENCE_UPLOADED', // Đã upload kết quả từ bên thứ 3
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
    
    // Respondent response
    respondentResponse: {
      decision: {
        type: String,
        enum: ['ACCEPTED', 'REJECTED'],
      },
      reason: String,
      respondedAt: Date,
      evidence: {
        photos: [String],
        videos: [String],
        documents: [String],
        notes: String
      }
    },
    
    // Admin decision
    adminDecision: {
      decision: String, // Quyết định của admin
      reasoning: String, // Lý do
      decidedAt: Date,
      decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      // Ai đúng ai sai - dùng để xử lý tiền
      whoIsRight: {
        type: String,
        enum: ['COMPLAINANT_RIGHT', 'RESPONDENT_RIGHT', null],
        default: null
      },
      // Evidence từ shipper
      shipperEvidence: {
        photos: [String], // Ảnh chụp khi giao/nhận hàng
        videos: [String],
        notes: String,
        timestamp: Date
      },
      // Phản hồi từ 2 bên về quyết định admin
      complainantAccepted: {
        type: Boolean,
        default: null
      },
      respondentAccepted: {
        type: Boolean,
        default: null
      }
    },
    
    // Negotiation Room
    negotiationRoom: {
      startedAt: Date,
      deadline: Date, // 3 ngày từ lúc bắt đầu
      chatRoomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat'
      },
      // Thỏa thuận cuối cùng từ 2 bên
      finalAgreement: {
        proposedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        proposalText: String,
        proposalAmount: Number,
        // Quyết định cuối cùng từ owner
        ownerDecision: String,
        decidedAt: Date,
        complainantAccepted: {
          type: Boolean,
          default: false
        },
        respondentAccepted: {
          type: Boolean,
          default: false
        },
        acceptedAt: Date
      }
    },
    
    // Reschedule Request (for RENTER_NO_RETURN case)
    rescheduleRequest: {
      requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      requestedAt: Date,
      proposedReturnDate: Date,
      reason: String,
      evidence: {
        photos: [String],
        documents: [String],
        notes: String
      },
      status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING'
      },
      ownerResponse: {
        decision: String, // 'APPROVED' hoặc 'REJECTED'
        respondedAt: Date,
        reason: String
      },
      // Nếu approved, tạo shipment mới
      newShipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment'
      }
    },
    
    // Third Party Resolution
    thirdPartyResolution: {
      escalatedAt: Date,
      escalatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      evidenceDeadline: Date, // 7 ngày từ khi escalate
      // Thông tin chia sẻ cho 2 bên để đi qua bên thứ 3
      sharedData: {
        sharedAt: Date,
        sharedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        // Thông tin shipper (ảnh chụp khi giao/nhận hàng) - dùng Mixed để linh hoạt
        shipperEvidence: mongoose.Schema.Types.Mixed,
        // Thông tin cá nhân 2 bên
        partyInfo: {
          complainant: {
            name: String,
            phone: String,
            email: String,
            address: String
          },
          respondent: {
            name: String,
            phone: String,
            email: String,
            address: String
          }
        }
      },
      thirdPartyInfo: {
        name: String,
        contactInfo: String,
        caseNumber: String
      },
      // Bằng chứng kết quả từ bên thứ 3
      evidence: {
        documents: [String],
        photos: [String],
        videos: [String],
        officialDecision: String,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        uploadedAt: Date
      }
    },

    // Final Resolution
    resolution: {
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      resolvedAt: Date,
      resolutionText: String,
      resolutionSource: {
        type: String,
        enum: ['RESPONDENT_ACCEPTED', 'ADMIN_DECISION', 'NEGOTIATION', 'THIRD_PARTY', 'ADMIN_PROCESSED_PAYMENT', 'RESCHEDULE_APPROVED']
      },
      // Financial Impact
      financialImpact: {
        refundAmount: Number, // Tiền hoàn lại
        penaltyAmount: Number, // Tiền phạt
        compensationAmount: Number, // Tiền bồi thường
        paidBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        paidTo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        status: {
          type: String,
          enum: ['PENDING', 'PROCESSED', 'COMPLETED'],
          default: 'PENDING'
        }
      }
    },

    // Timeline tracking
    timeline: [
      {
        action: String,
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        timestamp: {
          type: Date,
          default: Date.now
        },
        details: String
      }
    ]
  },
  {
    timestamps: true,
    collection: 'disputes'
  }
);

// Methods
disputeSchema.methods.addTimelineEvent = function(action, performedBy, details) {
  this.timeline.push({
    action,
    performedBy,
    details,
    timestamp: new Date()
  });
  return this.save();
};

disputeSchema.methods.canOpenDispute = function(productStatus, shipmentType, userId, ownerId) {
  // DELIVERY type - chỉ renter mới mở được
  if (shipmentType === 'DELIVERY') {
    if (userId.toString() === ownerId.toString()) {
      return { allowed: false, reason: 'Owner không thể mở dispute trong giai đoạn giao hàng' };
    }
    // Cho phép khi DELIVERY_FAILED hoặc ACTIVE (renter có thể dispute khi đang sử dụng)
    if (!['DELIVERY_FAILED', 'ACTIVE'].includes(productStatus)) {
      return { allowed: false, reason: 'Chỉ có thể mở dispute khi trạng thái là DELIVERY_FAILED hoặc ACTIVE' };
    }
  }
  
  // RETURN type - chỉ owner mới mở được
  if (shipmentType === 'RETURN') {
    if (userId.toString() !== ownerId.toString()) {
      return { allowed: false, reason: 'Chỉ owner mới có thể mở dispute trong giai đoạn trả hàng' };
    }
    // Cho phép khi RETURNED hoặc RETURN_FAILED
    if (!['RETURNED', 'RETURN_FAILED'].includes(productStatus)) {
      return { allowed: false, reason: 'Chỉ có thể mở dispute khi trạng thái là RETURNED hoặc RETURN_FAILED' };
    }
  }
  
  return { allowed: true };
};

/**
 * Calculate penalty for RENTER_NO_RETURN based on severity
 * @param {Number} depositAmount - Tiền cọc
 * @param {Number} rentalAmount - Tổng tiền thuê
 * @param {Number} creditScore - Credit score của renter
 * @param {Boolean} hasValidReason - Có lý do hợp lệ không
 * @param {Boolean} isFirstOffense - Lần đầu vi phạm
 * @param {Boolean} hasResponse - Có phản hồi không (trong 48h)
 * @returns {Object} - { penaltyPercent, keepDeposit, additionalPenalty, creditPenalty, allowReschedule, shouldBlacklist }
 */
disputeSchema.methods.calculateRenterNoReturnPenalty = function(params) {
  const { depositAmount, rentalAmount, creditScore, hasValidReason, isFirstOffense, hasResponse } = params;
  
  // Level 1: Lần đầu + Có lý do chính đáng + Phản hồi kịp thời
  if (isFirstOffense && hasValidReason && hasResponse) {
    return {
      penaltyPercent: 10, // Phạt 10% deposit
      keepDeposit: depositAmount * 0.1,
      additionalPenalty: 0,
      creditPenalty: -5,
      allowReschedule: true,
      shouldBlacklist: false,
      message: 'Lần đầu vi phạm, có lý do hợp lệ - Cho phép reschedule'
    };
  }
  
  // Level 2: Lần đầu + Không có lý do hoặc lý do không hợp lệ
  if (isFirstOffense && !hasValidReason && hasResponse) {
    return {
      penaltyPercent: 50, // Giữ 50% deposit
      keepDeposit: depositAmount * 0.5,
      additionalPenalty: rentalAmount * 0.2, // Phạt thêm 20% rental
      creditPenalty: -15,
      allowReschedule: false,
      shouldBlacklist: false,
      message: 'Lần đầu vi phạm nhưng không có lý do chính đáng'
    };
  }
  
  // Level 3: Tái phạm hoặc không phản hồi
  if (!isFirstOffense || !hasResponse) {
    return {
      penaltyPercent: 100, // Giữ 100% deposit
      keepDeposit: depositAmount,
      additionalPenalty: rentalAmount * 0.5, // Phạt thêm 50% rental
      creditPenalty: -30,
      allowReschedule: false,
      shouldBlacklist: true, // Blacklist 30 ngày
      blacklistDays: 30,
      message: hasResponse ? 'Tái phạm - Giữ toàn bộ deposit + phạt thêm' : 'Không phản hồi trong 48h - Xử phạt nặng'
    };
  }
  
  // Level 4: Quá 7 ngày vẫn không trả = Chiếm đoạt
  // (Sẽ được handle riêng trong service)
  
  // Default: Trường hợp bình thường
  return {
    penaltyPercent: 50,
    keepDeposit: depositAmount * 0.5,
    additionalPenalty: rentalAmount * 0.2,
    creditPenalty: -15,
    allowReschedule: false,
    shouldBlacklist: false,
    message: 'Vi phạm nghiêm trọng'
  };
};

// Indexes
disputeSchema.index({ disputeId: 1 });
disputeSchema.index({ subOrder: 1, productId: 1 });
disputeSchema.index({ complainant: 1 });
disputeSchema.index({ respondent: 1 });
disputeSchema.index({ status: 1, priority: 1 });
disputeSchema.index({ shipmentType: 1, status: 1 });
disputeSchema.index({ 'negotiationRoom.deadline': 1 });
disputeSchema.index({ type: 1, status: 1 });
disputeSchema.index({ 'rescheduleRequest.status': 1 });

module.exports = mongoose.model('Dispute', disputeSchema);