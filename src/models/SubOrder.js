const mongoose = require('mongoose');

// Sub Order Schema - Đơn con cho từng chủ thuê
const subOrderSchema = new mongoose.Schema(
  {
    subOrderNumber: {
      type: String,
      required: true,
      unique: true
    },

    // Liên kết với MasterOrder
    masterOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MasterOrder',
      required: true
    },

    // Chủ cho thuê
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Địa chỉ của chủ thuê (để tính phí ship)
    ownerAddress: {
      streetAddress: String,
      ward: String,
      district: String,
      city: String,
      province: String,
      latitude: Number,
      longitude: Number
    },

    // Danh sách sản phẩm thuê từ chủ này
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true
        },
        quantity: {
          type: Number,
          required: true,
          min: 1
        },
        rentalRate: {
          type: Number,
          required: true
        },
        depositRate: {
          type: Number,
          required: true
        },
        // Thêm rental period riêng cho từng product item
        rentalPeriod: {
          startDate: {
            type: Date,
            required: true
          },
          endDate: {
            type: Date,
            required: true
          },
          duration: {
            value: Number,
            unit: {
              type: String,
              enum: ['DAY', 'WEEK', 'MONTH']
            }
          }
        },
        // Thêm shipping information cho từng product
        shipping: {
          distance: {
            type: Number, // km from owner to user
            default: 0
          },
          fee: {
            baseFee: {
              type: Number,
              default: 15000 // 15,000 VND base fee per delivery trip
            },
            pricePerKm: {
              type: Number,
              default: 5000 // 5,000 VND per km
            },
            totalFee: {
              type: Number,
              default: 0 // Allocated share of delivery fee for this product
            }
          },
          method: {
            type: String,
            enum: ['DELIVERY'],
            default: 'DELIVERY'
          },
          // Delivery batch information
          deliveryInfo: {
            deliveryDate: {
              type: String, // YYYY-MM-DD format from rentalPeriod.startDate
              default: null
            },
            deliveryBatch: {
              type: Number, // Batch number for this delivery
              default: 1
            },
            batchSize: {
              type: Number, // Number of products in this delivery batch
              default: 1
            },
            batchQuantity: {
              type: Number, // Total quantity of all products in this batch
              default: 0
            },
            sharedDeliveryFee: {
              type: Number, // Total delivery fee for this batch (shared among products)
              default: 0
            }
          }
        },
        // Thêm confirmation status cho từng product item
        // Thêm delivery/shipping status cho từng product
        productStatus: {
          type: String,
          enum: [
            // Confirmation Phase
            'PENDING', // Chờ owner xác nhận
            'CONFIRMED', // Owner đã xác nhận
            'REJECTED', // Owner từ chối

            // Delivery Phase         // Chờ shipper nhận hàng giao
            'SHIPPER_CONFIRMED', // Shipper đã xác nhận nhận hàng
            'IN_TRANSIT', // Đang vận chuyển đến người thuê
            'DELIVERED', // Đã giao cho người thuê
            'DELIVERY_FAILED', // Giao hàng thất bại

            // Active Rental Phase
            'ACTIVE', // Đang trong thời gian thuê
            'DISPUTED', // Có tranh chấp

            // Return Phase
            'RETURN_REQUESTED', // Người thuê yêu cầu trả (bình thường hoặc sớm)
            'EARLY_RETURN_REQUESTED', // Yêu cầu trả sớm (cần approval)
            'RETURN_SHIPPER_CONFIRMED', // Shipper xác nhận nhận hàng trả
            'RETURNING', // Đang trả hàng về owner
            'RETURNED', // Đã trả về cho owner
            'RETURN_FAILED', // Trả hàng thất bại

            // Final States
            'COMPLETED', // Hoàn thành
            'CANCELLED' // Đã hủy
          ],
          default: 'PENDING'
        },

        // Shipment References
        deliveryShipment: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Shipment'
        },
        returnShipment: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Shipment'
        },

        // Early Return Info
        earlyReturn: {
          //Returner's info(name, phone, email)
          returner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          },
          requested: {
            type: Boolean,
            default: false
          },
          requestedAt: Date,
          reason: String
        },

        rejectionReason: String,
        confirmedAt: Date,
        rejectedAt: Date,
        actualReturnDate: Date, // Ngày trả thực tế (cho early return)
        totalRental: Number,
        totalDeposit: Number,
        totalShippingFee: {
          type: Number,
          default: 0 // Individual product shipping fee
        },

        // Disputes liên quan đến product này
        disputes: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Dispute'
          }
        ]
      }
    ],

    // Thời gian thuê (optional - mỗi product có rental period riêng)
    rentalPeriod: {
      startDate: {
        type: Date,
        required: false // Changed to optional
      },
      endDate: {
        type: Date,
        required: false // Changed to optional
      },
      duration: {
        value: Number,
        unit: {
          type: String,
          enum: ['DAY', 'WEEK', 'MONTH']
        }
      }
    },

    // Tính toán giá
    pricing: {
      subtotalRental: {
        type: Number,
        required: true,
        default: 0
      },
      subtotalDeposit: {
        type: Number,
        required: true,
        default: 0
      },
      shippingFee: {
        type: Number,
        default: 0
      },
      shippingDistance: {
        type: Number, // km
        default: 0
      },
      totalAmount: {
        type: Number,
        required: true,
        default: 0
      }
    },

    // Applied Promotions
    appliedPromotions: [
      {
        promotion: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Promotion'
        },
        promotionType: {
          type: String,
          enum: ['SYSTEM', 'PRODUCT']
        },
        discountAmount: Number,
        appliedTo: {
          type: String,
          enum: ['SHIPPING', 'PRODUCT', 'TOTAL']
        }
      }
    ],

    // Thông tin vận chuyển
    shipping: {
      method: {
        type: String,
        enum: ['PICKUP', 'DELIVERY'],
        required: true
      },
      fee: {
        baseFee: {
          type: Number,
          default: 10000 // 10,000 VND cố định
        },
        pricePerKm: {
          type: Number,
          default: 5000 // 5,000 VND/km
        },
        totalFee: {
          type: Number,
          default: 0
        },
        discount: {
          type: Number,
          default: 0
        },
        finalFee: {
          type: Number,
          default: 0
        }
      },
      distance: {
        type: Number, // km
        default: 0
      },
      estimatedTime: Number, // minutes
      vietmapResponse: mongoose.Schema.Types.Mixed // Lưu response từ VietMap API
    },

    // Trạng thái của SubOrder
    status: {
      type: String,
      enum: [
        // Order Creation
        'DRAFT', // Đơn nháp
        'PENDING_CONFIRMATION', // Chờ owner xác nhận

        // Confirmation Results
        'OWNER_CONFIRMED', // Owner xác nhận tất cả
        'OWNER_REJECTED', // Owner từ chối tất cả
        'PARTIALLY_CONFIRMED', // Owner xác nhận một phần
        'PENDING_RENTER_DECISION', // Chờ người thuê quyết định (hủy hoặc tiếp tục) khi xác nhận một phần
        'RENTER_REJECTED', // Renter từ chối đơn partial (chọn hủy)
        'RENTER_ACCEPTED_PARTIAL', // Renter chấp nhận đơn partial (chọn tiếp tục)

        // Contract & Payment
        'READY_FOR_CONTRACT', // Sẵn sàng ký hợp đồng
        'CONTRACT_SIGNED', // Đã ký hợp đồng

        // Delivery / Renter confirmation
        'DELIVERED', // Renter đã xác nhận đã nhận hàng (kích hoạt chuyển tiền)

        // Final States
        'COMPLETED', // Hoàn thành
        'CANCELLED' // Đã hủy
      ],
      default: 'DRAFT'
    },

    // Xác nhận từ chủ
    ownerConfirmation: {
      status: {
        type: String,
        enum: ['PENDING', 'CONFIRMED', 'REJECTED'],
        default: 'PENDING'
      },
      confirmedAt: Date,
      rejectedAt: Date,
      rejectionReason: String,
      notes: String
    },

    // Từ chối từ người thuê
    renterRejection: {
      rejectedAt: Date,
      reason: String
    },

    // Thông tin quyết định của người thuê khi owner xác nhận một phần
    renterDecision: {
      status: {
        type: String,
        enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
        default: 'PENDING'
      },
      decidedAt: Date,
      choice: {
        type: String,
        enum: ['CANCEL_ALL', 'CONTINUE_PARTIAL'], // Hủy toàn bộ hoặc tiếp tục với phần được xác nhận
        default: null
      },
      refundProcessed: {
        type: Boolean,
        default: false
      },
      refundDetails: {
        depositRefund: { type: Number, default: 0 },
        rentalRefund: { type: Number, default: 0 },
        shippingRefund: { type: Number, default: 0 },
        totalRefund: { type: Number, default: 0 },
        processedAt: Date
      }
    },

    // Hợp đồng
    contract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract'
    },

    // Ghi chú
    notes: String,

    // Thông tin giao hàng
    delivery: {
      trackingNumber: String,
      shippedAt: Date,
      deliveredAt: Date,
      deliveryProof: [String], // URLs to delivery proof images
      shipper: {
        name: String,
        phone: String,
        vehicleInfo: String
      }
    },

    // Đánh giá từ người thuê về chủ và sản phẩm
    review: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review'
    },

    // Auto-confirmation tracking (tự động xác nhận sau 24h nếu renter không confirm)
    autoConfirmation: {
      enabled: {
        type: Boolean,
        default: true // Enabled by default
      },
      readyAt: Date, // Khi hàng sẵn sàng để nhận (start of 24h period)
      autoConfirmedAt: Date, // Thời gian tự động xác nhận
      status: {
        type: String,
        enum: ['PENDING', 'CONFIRMED', 'SKIPPED'],
        default: 'PENDING'
      }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtuals
subOrderSchema.virtual('totalProductValue').get(function () {
  return this.pricing.subtotalRental + this.pricing.subtotalDeposit;
});

subOrderSchema.virtual('grandTotal').get(function () {
  return this.pricing.subtotalRental + this.pricing.subtotalDeposit + this.pricing.shippingFee;
});

// Virtual fields cho partial confirmation
subOrderSchema.virtual('confirmedAmount').get(function () {
  if (!this.products) return 0;
  return this.products.reduce((total, item) => {
    if (item.status === 'CONFIRMED') {
      return total + (item.totalRental || 0) + (item.totalDeposit || 0);
    }
    return total;
  }, 0);
});

subOrderSchema.virtual('rejectedAmount').get(function () {
  if (!this.products) return 0;
  return this.products.reduce((total, item) => {
    if (item.status === 'REJECTED') {
      return total + (item.totalRental || 0) + (item.totalDeposit || 0);
    }
    return total;
  }, 0);
});

subOrderSchema.virtual('pendingAmount').get(function () {
  if (!this.products) return 0;
  return this.products.reduce((total, item) => {
    if (item.status === 'PENDING') {
      return total + (item.totalRental || 0) + (item.totalDeposit || 0);
    }
    return total;
  }, 0);
});
// Indexes
subOrderSchema.index({ masterOrder: 1, owner: 1 });
subOrderSchema.index({ subOrderNumber: 1 });
subOrderSchema.index({ owner: 1, status: 1 });
subOrderSchema.index({ 'rentalPeriod.startDate': 1, 'rentalPeriod.endDate': 1 });

// Pre-save middleware
subOrderSchema.pre('save', function (next) {
  if (this.isNew && !this.subOrderNumber) {
    this.subOrderNumber = `SO${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  }

  // Note: Overlap validation đã được xử lý ở cart level với quantity checking
  // SubOrder cho phép multiple items với overlapping periods vì validation quantity
  // đã được thực hiện khi add to cart

  // Tính tổng tiền từ sản phẩm
  if (this.products && this.products.length > 0) {
    this.pricing.subtotalRental = this.products.reduce(
      (sum, item) => sum + (item.totalRental || 0),
      0
    );
    this.pricing.subtotalDeposit = this.products.reduce(
      (sum, item) => sum + (item.totalDeposit || 0),
      0
    );
  }

  // Tính tổng amount
  this.pricing.totalAmount =
    this.pricing.subtotalRental + this.pricing.subtotalDeposit + this.pricing.shippingFee;

  next();
});

// Virtual field: canConfirmDelivery - renter can only confirm delivery once
subOrderSchema.virtual('canConfirmDelivery').get(function () {
  // Renter can confirm delivery only if status is not DELIVERED yet
  return this.status !== 'DELIVERED';
});

// Ensure virtuals are included when converting to JSON or Object
subOrderSchema.set('toJSON', { virtuals: true });
subOrderSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SubOrder', subOrderSchema);
