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
            enum: ['PICKUP', 'DELIVERY'],
            default: 'PICKUP'
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
        status: {
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
        'RENTER_REJECTED', // Renter từ chối đơn partial

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

    // Hợp đồng
    contract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contract'
    },

    // Trạng thái hợp đồng
    contractStatus: {
      status: {
        type: String,
        enum: ['NOT_REQUIRED', 'PENDING', 'OWNER_SIGNED', 'RENTER_SIGNED', 'COMPLETED'],
        default: 'NOT_REQUIRED'
      },
      createdAt: Date,
      ownerSignedAt: Date,
      renterSignedAt: Date,
      completedAt: Date
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

    // 🔄 Return Shipment Information
    return: {
      status: {
        type: String,
        enum: ['NOT_INITIATED', 'PENDING', 'PICKUP_CONFIRMED', 'IN_TRANSIT', 'COMPLETED'],
        default: 'NOT_INITIATED'
      },
      initiatedAt: Date,
      returnType: {
        type: String,
        enum: ['NORMAL', 'EARLY'],
        default: 'NORMAL'
      },
      shipments: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Shipment'
        }
      ]
    },

    // Deposit refund information
    depositRefunded: {
      type: Boolean,
      default: false
    },
    depositRefundedAt: Date
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

module.exports = mongoose.model('SubOrder', subOrderSchema);
