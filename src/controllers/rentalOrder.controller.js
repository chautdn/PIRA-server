const RentalOrderService = require('../services/rentalOrder.service');
const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Contract = require('../models/Contract');
const Shipment = require('../models/Shipment');
const ShipmentService = require('../services/shipment.service');
const SystemWalletService = require('../services/systemWallet.service');
const { SuccessResponse } = require('../core/success');
const { BadRequest, NotFoundError, ForbiddenError } = require('../core/error');

class RentalOrderController {
  /**
   * Bước 1: Tạo đơn thuê từ giỏ hàng (Draft)
   * POST /api/rental-orders/create-draft
   */
  async createDraftOrder(req, res) {
    try {
      const userId = req.user.id;
      const { rentalPeriod, deliveryAddress, deliveryMethod } = req.body;

      console.log('📥 POST /api/rental-orders/create-draft');
      console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

      // Validation
      if (!rentalPeriod || !rentalPeriod.startDate || !rentalPeriod.endDate) {
        throw new BadRequest('Thời gian thuê không hợp lệ');
      }

      // For DELIVERY method, need either streetAddress or coordinates
      if (deliveryMethod === 'DELIVERY' && deliveryAddress) {
        const hasAddress = deliveryAddress.streetAddress;
        const hasCoordinates = deliveryAddress.latitude && deliveryAddress.longitude;

        console.log('🏠 Delivery validation:', {
          hasAddress: !!hasAddress,
          hasCoordinates: !!hasCoordinates,
          streetAddress: deliveryAddress.streetAddress,
          coordinates: [deliveryAddress.latitude, deliveryAddress.longitude]
        });

        if (!hasAddress && !hasCoordinates) {
          throw new BadRequest('Vui lòng nhập địa chỉ giao hàng hoặc chọn vị trí trên bản đồ');
        }
      } else if (deliveryMethod === 'DELIVERY' && !deliveryAddress) {
        throw new BadRequest('Thiếu thông tin địa chỉ giao hàng');
      }
      if (!['PICKUP', 'DELIVERY'].includes(deliveryMethod)) {
        throw new BadRequest('Hình thức nhận hàng không hợp lệ');
      }

      // Kiểm tra ngày thuê hợp lệ
      const startDate = new Date(rentalPeriod.startDate);
      const endDate = new Date(rentalPeriod.endDate);
      const now = new Date();

      if (startDate < now) {
        throw new BadRequest('Ngày bắt đầu thuê phải từ hôm nay trở đi');
      }

      if (endDate <= startDate) {
        throw new BadRequest('Ngày kết thúc phải sau ngày bắt đầu');
      }

      const masterOrder = await RentalOrderService.createDraftOrderFromCart(userId, {
        rentalPeriod,
        deliveryAddress,
        deliveryMethod
      });

      return new SuccessResponse({
        message: 'Tạo đơn thuê tạm thành công',
        metadata: {
          masterOrder
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in createDraftOrder:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể tạo đơn thuê'
      });
    }
  }

  /**
   * Bước 1b: Tạo đơn thuê với thanh toán (renter pays upfront)
   * POST /api/rental-orders/create-paid
   */
  async createPaidOrder(req, res) {
    try {
      const userId = req.user.id;
      const {
        rentalPeriod,
        deliveryAddress,
        deliveryMethod,
        paymentMethod,
        totalAmount,
        paymentTransactionId,
        paymentMessage,
        // COD specific fields
        depositAmount,
        depositPaymentMethod,
        depositTransactionId
      } = req.body;

      console.log('📥 POST /api/rental-orders/create-paid');
      console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

      // Tạo đơn thuê với thanh toán
      const masterOrder = await RentalOrderService.createPaidOrderFromCart(userId, {
        rentalPeriod,
        deliveryAddress,
        deliveryMethod,
        paymentMethod,
        totalAmount,
        paymentTransactionId,
        paymentMessage,
        // Include COD specific fields
        depositAmount,
        depositPaymentMethod,
        depositTransactionId
      });

      if (!masterOrder) {
        throw new Error('Không nhận được dữ liệu đơn hàng từ service');
      }

      console.log('✅ Created paid order successfully:', masterOrder._id);

      return new SuccessResponse({
        message: 'Tạo đơn thuê với thanh toán thành công',
        metadata: {
          masterOrder
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in createPaidOrder controller:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể tạo đơn thuê với thanh toán'
      });
    }
  }

  /**
   * Bước 2: Xác nhận đơn hàng và chuyển sang chờ thanh toán
   * POST /api/rental-orders/:masterOrderId/confirm
   */
  async confirmOrder(req, res) {
    try {
      const userId = req.user.id;
      const { masterOrderId } = req.params;

      const masterOrder = await RentalOrderService.confirmOrder(masterOrderId, userId);

      return new SuccessResponse({
        message: 'Xác nhận đơn hàng thành công',
        metadata: {
          masterOrder
        }
      }).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Bước 3: Xử lý thanh toán
   * POST /api/rental-orders/:masterOrderId/payment
   */
  async processPayment(req, res) {
    try {
      const userId = req.user.id;
      const { masterOrderId } = req.params;
      const paymentData = req.body;

      // Kiểm tra quyền sở hữu đơn hàng
      const masterOrder = await MasterOrder.findOne({
        _id: masterOrderId,
        renter: userId
      });

      if (!masterOrder) {
        throw new NotFoundError('Không tìm thấy đơn hàng');
      }

      const updatedOrder = await RentalOrderService.processPayment(masterOrderId, paymentData);

      return new SuccessResponse({
        message: 'Thanh toán thành công',
        metadata: {
          masterOrder: updatedOrder
        }
      }).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Bước 4: Chủ xác nhận đơn hàng
   * POST /api/rental-orders/sub-orders/:subOrderId/owner-confirm
   */
  async ownerConfirmOrder(req, res) {
    try {
      const userId = req.user.id;
      const { subOrderId } = req.params;
      const { status, notes, rejectionReason } = req.body;

      if (!['CONFIRMED', 'REJECTED'].includes(status)) {
        throw new BadRequest('Trạng thái xác nhận không hợp lệ');
      }

      if (status === 'REJECTED' && !rejectionReason) {
        throw new BadRequest('Vui lòng cung cấp lý do từ chối');
      }

      const subOrder = await RentalOrderService.ownerConfirmOrder(subOrderId, userId, {
        status,
        notes,
        rejectionReason
      });

      return new SuccessResponse({
        message: status === 'CONFIRMED' ? 'Xác nhận đơn hàng thành công' : 'Đã từ chối đơn hàng',
        metadata: {
          subOrder
        }
      }).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Bước 5: Tạo hợp đồng
   * POST /api/rental-orders/:masterOrderId/generate-contracts
   */
  async generateContracts(req, res) {
    try {
      const { masterOrderId } = req.params;

      const contracts = await RentalOrderService.generateContract(masterOrderId);

      return new SuccessResponse({
        message: 'Tạo hợp đồng thành công',
        metadata: {
          contracts
        }
      }).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Bước 6: Ký hợp đồng
   * POST /api/rental-orders/contracts/:contractId/sign
   */
  async signContract(req, res) {
    try {
      const userId = req.user.id;
      const { contractId } = req.params;
      const signatureData = {
        ...req.body,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      const contract = await RentalOrderService.signContract(contractId, userId, signatureData);

      return new SuccessResponse({
        message: 'Ký hợp đồng thành công',
        metadata: {
          contract
        }
      }).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Lấy chi tiết hợp đồng
   * GET /api/rental-orders/contracts/:contractId
   */
  async getContractDetail(req, res) {
    try {
      const userId = req.user.id;
      const { contractId } = req.params;

      console.log('📥 GET /api/rental-orders/contracts/:contractId');
      console.log('Contract ID:', contractId);
      console.log('User ID:', userId);

      const contract = await Contract.findById(contractId)
        .populate('subOrder')
        .populate('masterOrder')
        .populate({
          path: 'product',
          select: 'title name images price'
        })
        .populate({
          path: 'owner',
          select: 'profile email phone'
        })
        .populate({
          path: 'renter',
          select: 'profile email phone'
        });

      if (!contract) {
        throw new NotFoundError('Không tìm thấy hợp đồng');
      }

      // Kiểm tra quyền truy cập
      const isOwner = contract.owner._id.toString() === userId;
      const isRenter = contract.renter._id.toString() === userId;

      if (!isOwner && !isRenter) {
        throw new ForbiddenError('Bạn không có quyền xem hợp đồng này');
      }

      // Xác định canSign dựa trên status và role
      let canSign = false;
      let signMessage = '';

      if (isOwner) {
        // Owner có thể ký nếu chưa ký và status = PENDING_OWNER
        canSign =
          !contract.signatures.owner.signed &&
          (contract.status === 'PENDING_OWNER' || contract.status === 'PENDING_SIGNATURE');
        if (contract.signatures.owner.signed) {
          signMessage = 'Bạn đã ký hợp đồng này rồi';
        }
      } else if (isRenter) {
        // Renter chỉ có thể ký nếu owner đã ký và status = PENDING_RENTER
        const ownerSigned = contract.signatures.owner.signed;
        canSign =
          !contract.signatures.renter.signed && ownerSigned && contract.status === 'PENDING_RENTER';

        if (!ownerSigned) {
          signMessage = 'Chờ chủ đồ ký hợp đồng trước';
        } else if (contract.signatures.renter.signed) {
          signMessage = 'Bạn đã ký hợp đồng này rồi';
        }
      }

      return new SuccessResponse({
        message: 'Lấy chi tiết hợp đồng thành công',
        metadata: {
          contract,
          userRole: isOwner ? 'OWNER' : 'RENTER',
          canSign,
          signMessage
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in getContractDetail:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể lấy chi tiết hợp đồng'
      });
    }
  }

  /**
   * Lấy danh sách đơn hàng của người thuê
   * GET /api/rental-orders/my-orders
   */
  async getMyOrders(req, res) {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 10 } = req.query;

      const filter = { renter: userId };
      if (status) {
        filter.status = status;
      }

      const orders = await MasterOrder.find(filter)
        .populate({
          path: 'subOrders',
          populate: [
            { path: 'owner', select: 'profile.firstName profile.phone' },
            { path: 'products.product', select: 'name images price' }
          ]
        })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await MasterOrder.countDocuments(filter);

      return new SuccessResponse({
        message: 'Lấy danh sách đơn hàng thành công',
        metadata: {
          orders,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      }).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Lấy danh sách đơn hàng của chủ cho thuê
   * GET /api/rental-orders/owner-orders
   */
  async getOwnerOrders(req, res) {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 10 } = req.query;

      const filter = { owner: userId };
      if (status) {
        filter.status = status;
      }

      const subOrders = await SubOrder.find(filter)
        .populate([
          {
            path: 'masterOrder',
            populate: { path: 'renter', select: 'profile.fullName profile.phone' }
          },
          { path: 'products.product', select: 'name images price' }
        ])
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await SubOrder.countDocuments(filter);

      return new SuccessResponse({
        message: 'Lấy danh sách đơn hàng thành công',
        metadata: {
          orders: subOrders,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      }).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Lấy chi tiết đơn hàng
   * GET /api/rental-orders/:masterOrderId
   */
  async getOrderDetail(req, res) {
    try {
      const userId = req.user.id;
      const { masterOrderId } = req.params;

      const masterOrder = await MasterOrder.findById(masterOrderId).populate([
        { path: 'renter', select: 'profile email' },
        {
          path: 'subOrders',
          populate: [
            { path: 'owner', select: 'profile email' },
            { path: 'products.product' },
            { path: 'contract' }
          ]
        }
      ]);

      if (!masterOrder) {
        throw new NotFoundError('Không tìm thấy đơn hàng');
      }

      // Kiểm tra quyền xem
      const isRenter = masterOrder.renter._id.toString() === userId;
      const isOwner = masterOrder.subOrders.some((so) => so.owner._id.toString() === userId);

      if (!isRenter && !isOwner) {
        throw new ForbiddenError('Không có quyền xem đơn hàng này');
      }

      return new SuccessResponse(
        {
          masterOrder
        },
        'Lấy chi tiết đơn hàng thành công'
      ).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Hủy đơn hàng
   * PUT /api/rental-orders/:masterOrderId/cancel
   */
  async cancelOrder(req, res) {
    try {
      const userId = req.user.id;
      const { masterOrderId } = req.params;
      const { reason } = req.body;

      const masterOrder = await MasterOrder.findOne({
        _id: masterOrderId,
        renter: userId,
        status: { $in: ['DRAFT', 'PENDING_PAYMENT', 'PENDING_CONFIRMATION'] }
      });

      if (!masterOrder) {
        throw new NotFoundError('Không tìm thấy đơn hàng hoặc không thể hủy');
      }

      masterOrder.status = 'CANCELLED';
      masterOrder.cancellation = {
        cancelledBy: userId,
        cancelledAt: new Date(),
        reason
      };

      await masterOrder.save();

      // Cập nhật tất cả SubOrder
      await SubOrder.updateMany({ masterOrder: masterOrderId }, { status: 'CANCELLED' });

      return new SuccessResponse({
        message: 'Hủy đơn hàng thành công',
        metadata: {
          masterOrder
        }
      }).send(res);
    } catch (error) {
      throw new BadRequestError(error.message);
    }
  }

  /**
   * Lấy lịch sử hợp đồng
   * GET /api/rental-orders/contracts
   */
  async getContracts(req, res) {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 10 } = req.query;

      const filter = {
        $or: [{ owner: userId }, { renter: userId }]
      };

      if (status) {
        filter.status = status;
      }

      const contracts = await Contract.find(filter)
        .populate([
          { path: 'owner', select: 'profile.fullName profile.phone' },
          { path: 'renter', select: 'profile.fullName profile.phone' },
          { path: 'product', select: 'name images' }
        ])
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Contract.countDocuments(filter);

      return new SuccessResponse({
        message: 'Lấy danh sách hợp đồng thành công',
        metadata: {
          contracts,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      }).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Tính phí ship preview
   * POST /api/rental-orders/calculate-shipping
   */
  async calculateShipping(req, res) {
    try {
      const { ownerAddress, deliveryAddress } = req.body;

      // Enhanced validation
      if (!ownerAddress || !deliveryAddress) {
        throw new BadRequest('Thiếu thông tin địa chỉ');
      }

      if (!ownerAddress.streetAddress) {
        throw new BadRequest('Thiếu địa chỉ chủ cho thuê');
      }

      if (!deliveryAddress.streetAddress) {
        throw new BadRequest('Thiếu địa chỉ giao hàng');
      }

      // Debug log
      console.log('Calculate shipping request:', {
        ownerAddress,
        deliveryAddress
      });

      const shippingInfo = await RentalOrderService.calculateShippingFee(
        ownerAddress,
        deliveryAddress
      );

      return new SuccessResponse({
        message: 'Tính phí ship thành công',
        metadata: {
          shipping: shippingInfo
        }
      }).send(res);
    } catch (error) {
      throw new BadRequest(error.message);
    }
  }

  /**
   * Tính phí ship chi tiết cho từng product trong suborder
   * POST /api/rental-orders/calculate-product-shipping
   */
  async calculateProductShipping(req, res) {
    try {
      const { subOrderId, ownerLocation, userLocation, products } = req.body;

      // Validation
      if (!ownerLocation || !userLocation) {
        throw new BadRequest('Thiếu thông tin tọa độ');
      }

      if (!ownerLocation.latitude || !ownerLocation.longitude) {
        throw new BadRequest('Thiếu tọa độ chủ cho thuê');
      }

      if (!userLocation.latitude || !userLocation.longitude) {
        throw new BadRequest('Thiếu tọa độ người thuê');
      }

      if (!products || !products.length) {
        throw new BadRequest('Thiếu thông tin sản phẩm');
      }

      console.log('🚚 Calculate product shipping request:', {
        subOrderId,
        ownerLocation,
        userLocation,
        productsCount: products.length
      });

      const shippingCalculation = await RentalOrderService.calculateProductShippingFees(
        products,
        ownerLocation,
        userLocation
      );

      return new SuccessResponse({
        message: 'Tính phí ship cho từng sản phẩm thành công',
        metadata: {
          subOrderId,
          shipping: shippingCalculation
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error calculating product shipping:', error);
      throw new BadRequest(error.message);
    }
  }

  /**
   * Cập nhật shipping fees cho SubOrder
   * PUT /api/rental-orders/suborders/:subOrderId/shipping
   */
  async updateSubOrderShipping(req, res) {
    try {
      const { subOrderId } = req.params;
      const { ownerLocation, userLocation } = req.body;
      const userId = req.user.id;

      // Validation
      if (!ownerLocation || !userLocation) {
        throw new BadRequest('Thiếu thông tin tọa độ');
      }

      console.log('🔄 Update SubOrder shipping:', {
        subOrderId,
        userId,
        ownerLocation,
        userLocation
      });

      const updatedSubOrder = await RentalOrderService.updateSubOrderShipping(
        subOrderId,
        ownerLocation,
        userLocation,
        userId
      );

      return new SuccessResponse({
        message: 'Cập nhật phí ship thành công',
        metadata: {
          subOrder: updatedSubOrder
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error updating suborder shipping:', error);
      throw new BadRequest(error.message);
    }
  }

  /**
   * Lấy danh sách SubOrder cho chủ sản phẩm
   * GET /api/rental-orders/owner-suborders
   */
  async getOwnerSubOrders(req, res) {
    try {
      const ownerId = req.user.id;
      const { status, page, limit } = req.query;

      console.log('📥 GET /api/rental-orders/owner-suborders');
      console.log('👤 Owner ID:', ownerId);
      console.log('📋 Query params:', { status, page, limit });

      const subOrders = await RentalOrderService.getSubOrdersByOwner(ownerId, {
        status,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      });

      return new SuccessResponse({
        message: 'Lấy danh sách yêu cầu thuê thành công',
        metadata: {
          subOrders
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in getOwnerSubOrders:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể lấy danh sách yêu cầu thuê'
      });
    }
  }

  /**
   * Xác nhận SubOrder
   * POST /api/rental-orders/suborders/:id/confirm
   */
  async confirmSubOrder(req, res) {
    try {
      const ownerId = req.user.id;
      const { id: subOrderId } = req.params;

      console.log('📥 POST /api/rental-orders/suborders/:id/confirm');
      console.log('👤 Owner ID:', ownerId);
      console.log('📋 SubOrder ID:', subOrderId);

      const subOrder = await RentalOrderService.confirmSubOrder(subOrderId, ownerId);

      return new SuccessResponse({
        message: 'Xác nhận yêu cầu thuê thành công',
        metadata: {
          subOrder
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in confirmSubOrder:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể xác nhận yêu cầu thuê'
      });
    }
  }

  /**
   * Từ chối SubOrder
   * POST /api/rental-orders/suborders/:id/reject
   */
  async rejectSubOrder(req, res) {
    try {
      const ownerId = req.user.id;
      const { id: subOrderId } = req.params;
      const { reason } = req.body;

      console.log('📥 POST /api/rental-orders/suborders/:id/reject');
      console.log('👤 Owner ID:', ownerId);
      console.log('📋 SubOrder ID:', subOrderId);
      console.log('💬 Reason:', reason);

      if (!reason || !reason.trim()) {
        throw new BadRequest('Vui lòng nhập lý do từ chối');
      }

      const subOrder = await RentalOrderService.rejectSubOrder(subOrderId, ownerId, reason);

      return new SuccessResponse({
        message: 'Từ chối yêu cầu thuê thành công',
        metadata: {
          subOrder
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in rejectSubOrder:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể từ chối yêu cầu thuê'
      });
    }
  }

  /**
   * Cập nhật phương thức thanh toán
   * PUT /api/rental-orders/:masterOrderId/payment-method
   */
  async updatePaymentMethod(req, res) {
    try {
      const { masterOrderId } = req.params;
      const { paymentMethod } = req.body;

      console.log('📥 PUT /api/rental-orders/:masterOrderId/payment-method');
      console.log('📋 MasterOrder ID:', masterOrderId);
      console.log('💳 Payment Method:', paymentMethod);

      const masterOrder = await RentalOrderService.updatePaymentMethod(
        masterOrderId,
        paymentMethod
      );

      return new SuccessResponse({
        message: 'Cập nhật phương thức thanh toán thành công',
        metadata: {
          masterOrder
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in updatePaymentMethod:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể cập nhật phương thức thanh toán'
      });
    }
  }

  /**
   * Lấy danh sách sản phẩm đang được thuê (active rentals) cho chủ sản phẩm
   * GET /api/rental-orders/owner-active-rentals
   */
  async getOwnerActiveRentals(req, res) {
    try {
      console.log('📥 GET /api/rental-orders/owner-active-rentals');
      console.log('👤 req.user:', req.user);

      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const ownerId = req.user.id;
      const { page, limit } = req.query;

      console.log('👤 Owner ID:', ownerId);
      console.log('📋 Query params:', { page, limit });

      const activeRentals = await RentalOrderService.getActiveRentalsByOwner(ownerId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      });

      console.log('✅ Active rentals found:', activeRentals.data.length);

      return res.status(200).json({
        success: true,
        message: 'Lấy danh sách sản phẩm đang cho thuê thành công',
        metadata: {
          activeRentals
        }
      });
    } catch (error) {
      console.error('❌ Error in getOwnerActiveRentals:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể lấy danh sách sản phẩm đang cho thuê'
      });
    }
  }

  /**
   * Get deposit calculation for current cart
   * GET /api/rental-orders/calculate-deposit
   */
  async calculateDeposit(req, res) {
    try {
      const userId = req.user.id;

      console.log('📥 GET /api/rental-orders/calculate-deposit');
      console.log('👤 User ID:', userId);

      const depositInfo = await RentalOrderService.calculateDepositFromCart(userId);

      return new SuccessResponse({
        message: 'Tính toán tiền cọc thành công',
        metadata: {
          totalDeposit: depositInfo.totalDeposit,
          breakdown: depositInfo.breakdown,
          formattedAmount: depositInfo.totalDeposit.toLocaleString('vi-VN') + 'đ'
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in calculateDeposit:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể tính toán tiền cọc'
      });
    }
  }

  /**
   * Lấy availability calendar cho product từ SubOrder data
   * GET /api/rental-orders/products/:productId/availability-calendar
   */
  async getProductAvailabilityCalendar(req, res) {
    try {
      const { productId } = req.params;
      const { startDate, endDate } = req.query;

      console.log(`📥 GET availability calendar for product ${productId}`);
      console.log(`📅 Date range: ${startDate} to ${endDate}`);

      const calendar = await RentalOrderService.getProductAvailabilityFromSubOrders(
        productId,
        startDate,
        endDate
      );

      console.log(`📊 Calendar response:`, {
        productId: calendar.productId,
        productTitle: calendar.productTitle,
        calendarDays: calendar.calendar?.length,
        firstDay: calendar.calendar?.[0]
      });

      return new SuccessResponse({
        message: 'Lấy lịch availability thành công',
        metadata: calendar
      }).send(res);
    } catch (error) {
      console.error('❌ Error getting availability calendar:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể lấy lịch availability'
      });
    }
  }

  /**
   * Handle PayOS payment success callback
   * GET /api/rental-orders/payment-success
   */
  async handlePaymentSuccess(req, res) {
    try {
      const { orderCode, cancel, status } = req.query;

      console.log('📥 Rental payment callback:', { orderCode, cancel, status });

      if (cancel === 'true' || status === 'CANCELLED') {
        // Payment was cancelled - redirect to rental payment cancel page
        return res.redirect(
          `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/cancelled?orderCode=${orderCode}`
        );
      }

      if (status === 'PAID') {
        // Payment successful - redirect to rental payment success page
        return res.redirect(
          `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/success?orderCode=${orderCode}`
        );
      }

      // Default case - redirect to pending page
      return res.redirect(
        `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/pending?orderCode=${orderCode}`
      );
    } catch (error) {
      console.error('❌ Error handling rental payment callback:', error);
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/error`);
    }
  }

  /**
   * Handle general PayOS payment cancel callback
   * GET /api/rental-orders/payment-cancel
   */
  async handlePaymentCancel(req, res) {
    try {
      const { orderCode } = req.query;

      console.log('📥 Rental payment cancel callback:', { orderCode });

      // Redirect to rental payment cancelled page
      return res.redirect(
        `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/cancelled?orderCode=${orderCode}`
      );
    } catch (error) {
      console.error('❌ Error handling rental payment cancel:', error);
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/error`);
    }
  }

  /**
   * Verify and complete PayOS payment for rental order
   * POST /api/rental-orders/:masterOrderId/verify-payment
   */
  async verifyPayOSPayment(req, res) {
    try {
      const { masterOrderId } = req.params;
      const { orderCode } = req.body;

      if (!orderCode) {
        throw new BadRequest('Order code is required');
      }

      const result = await RentalOrderService.verifyAndCompletePayOSPayment(
        masterOrderId,
        orderCode
      );

      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          order: result.order
        }
      });
    } catch (error) {
      console.error('❌ Error verifying PayOS payment:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể xác nhận thanh toán'
      });
    }
  }

  // ============================================================================
  // API XÁC NHẬN MỘT PHẦN SẢN PHẨM (PARTIAL CONFIRMATION)
  // ============================================================================

  /**
   * Owner xác nhận một phần sản phẩm trong SubOrder
   * POST /api/rental-orders/suborders/:subOrderId/partial-confirm
   * Body: { confirmedProductIds: ['productItemId1', 'productItemId2', ...] }
   */
  async partialConfirmSubOrder(req, res) {
    try {
      const ownerId = req.user.id;
      const { subOrderId } = req.params;
      const { confirmedProductIds } = req.body;

      console.log('📥 POST /api/rental-orders/suborders/:subOrderId/partial-confirm');
      console.log('SubOrder ID:', subOrderId);
      console.log('Owner ID:', ownerId);
      console.log('Confirmed Product IDs:', confirmedProductIds);

      // Validation
      if (!confirmedProductIds || !Array.isArray(confirmedProductIds)) {
        throw new BadRequest('Danh sách sản phẩm xác nhận không hợp lệ');
      }

      if (confirmedProductIds.length === 0) {
        throw new BadRequest('Phải chọn ít nhất 1 sản phẩm để xác nhận');
      }

      // Gọi service
      const subOrder = await RentalOrderService.partialConfirmSubOrder(
        subOrderId,
        ownerId,
        confirmedProductIds
      );

      return new SuccessResponse({
        message: `Đã xác nhận ${confirmedProductIds.length} sản phẩm thành công`,
        metadata: {
          subOrder,
          confirmedCount: confirmedProductIds.length,
          totalCount: subOrder.products.length
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in partialConfirmSubOrder:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể xác nhận đơn hàng'
      });
    }
  }

  /**
   * Lấy danh sách SubOrder cần xác nhận của owner
   * GET /api/rental-orders/owner/pending-confirmation
   */
  async getOwnerPendingConfirmation(req, res) {
    try {
      const ownerId = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      console.log('📥 GET /api/rental-orders/owner/pending-confirmation');
      console.log('Owner ID:', ownerId);

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Tìm các SubOrder đang chờ xác nhận của owner này
      const subOrders = await SubOrder.find({
        owner: ownerId,
        status: 'PENDING_CONFIRMATION'
      })
        .populate('masterOrder', 'masterOrderNumber deliveryAddress ownerConfirmationDeadline')
        .populate({
          path: 'products.product',
          select: 'title name images price deposit availability'
        })
        .populate('owner', 'profile.fullName profile.phone email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await SubOrder.countDocuments({
        owner: ownerId,
        status: 'PENDING_CONFIRMATION'
      });

      return new SuccessResponse({
        message: 'Lấy danh sách đơn hàng chờ xác nhận thành công',
        metadata: {
          subOrders,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
          }
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in getOwnerPendingConfirmation:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể lấy danh sách đơn hàng'
      });
    }
  }

  /**
   * Lấy chi tiết SubOrder để owner xác nhận
   * GET /api/rental-orders/suborders/:subOrderId/for-confirmation
   */
  async getSubOrderForConfirmation(req, res) {
    try {
      const ownerId = req.user.id;
      const { subOrderId } = req.params;

      console.log('📥 GET /api/rental-orders/suborders/:subOrderId/for-confirmation');
      console.log('SubOrder ID:', subOrderId);
      console.log('Owner ID:', ownerId);

      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId
      })
        .populate('masterOrder')
        .populate({
          path: 'products.product',
          select: 'title name images price deposit availability category owner'
        })
        .populate('owner', 'profile.fullName profile.phone email address');

      if (!subOrder) {
        throw new NotFoundError('Không tìm thấy đơn hàng hoặc không có quyền truy cập');
      }

      // Tính toán thông tin tổng hợp
      const summary = {
        totalProducts: subOrder.products.length,
        confirmedProducts: subOrder.products.filter((p) => p.productStatus === 'CONFIRMED').length,
        rejectedProducts: subOrder.products.filter((p) => p.productStatus === 'REJECTED').length,
        pendingProducts: subOrder.products.filter((p) => p.productStatus === 'PENDING').length,
        totalAmount:
          subOrder.pricing.subtotalRental +
          subOrder.pricing.subtotalDeposit +
          subOrder.pricing.shippingFee,
        deadline: subOrder.masterOrder.ownerConfirmationDeadline
      };

      return new SuccessResponse({
        message: 'Lấy chi tiết đơn hàng thành công',
        metadata: {
          subOrder,
          summary
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in getSubOrderForConfirmation:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể lấy chi tiết đơn hàng'
      });
    }
  }

  /**
   * Lấy tổng quan confirmation của MasterOrder
   * GET /api/rental-orders/:masterOrderId/confirmation-summary
   */
  async getConfirmationSummary(req, res) {
    try {
      const userId = req.user.id;
      const { masterOrderId } = req.params;

      console.log('📥 GET /api/rental-orders/:masterOrderId/confirmation-summary');
      console.log('MasterOrder ID:', masterOrderId);
      console.log('User ID:', userId);

      const masterOrder = await MasterOrder.findOne({
        _id: masterOrderId,
        renter: userId
      }).populate({
        path: 'subOrders',
        populate: [
          {
            path: 'products.product',
            select: 'title name images'
          },
          {
            path: 'owner',
            select: 'profile'
          }
        ]
      });

      if (!masterOrder) {
        throw new NotFoundError('Không tìm thấy đơn hàng');
      }

      return new SuccessResponse({
        message: 'Lấy tổng quan xác nhận thành công',
        metadata: {
          masterOrderNumber: masterOrder.masterOrderNumber,
          status: masterOrder.status,
          confirmationSummary: masterOrder.confirmationSummary,
          subOrders: masterOrder.subOrders
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in getConfirmationSummary:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể lấy tổng quan xác nhận'
      });
    }
  }

  /**
   * Renter từ chối SubOrder đã được partial confirm
   * POST /api/rental-orders/suborders/:subOrderId/renter-reject
   */
  async renterRejectSubOrder(req, res) {
    try {
      const userId = req.user.id;
      const { subOrderId } = req.params;
      const { reason } = req.body;

      console.log('📥 POST /api/rental-orders/suborders/:subOrderId/renter-reject');
      console.log('SubOrder ID:', subOrderId);
      console.log('Renter ID:', userId);
      console.log('Reason:', reason);

      const result = await RentalOrderService.renterRejectSubOrder(
        subOrderId,
        userId,
        reason || 'Không đủ số lượng sản phẩm mong muốn'
      );

      return new SuccessResponse({
        message: 'Đã hủy SubOrder và hoàn tiền thành công',
        metadata: result
      }).send(res);
    } catch (error) {
      console.error('❌ Error in renterRejectSubOrder:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể từ chối SubOrder'
      });
    }
  }

  // Renter confirms delivery for a suborder (tries to find related shipment and confirm)
  async renterConfirmDelivery(req, res) {
    try {
      const userId = req.user.id;
      const subOrderId = req.params.id;

      console.log('📥 POST /api/rental-orders/suborders/:id/confirm-delivered');
      console.log('👤 Renter ID:', userId);
      console.log('📦 SubOrder ID:', subOrderId);

      // Try to find a Shipment linked to this SubOrder
      const shipment = await Shipment.findOne({ subOrder: subOrderId }).populate('subOrder');

      if (shipment) {
        console.log('✅ Found shipment, processing via ShipmentService...');
        // DELIVERED is set by the renter's confirmation (the button).
        // If subOrder already marked DELIVERED, return current data to avoid double actions.
        if (shipment.subOrder && shipment.subOrder.status === 'DELIVERED') {
          console.log('⚠️ SubOrder already marked DELIVERED, returning current state');
          return res.json({ status: 'success', data: shipment.subOrder });
        }

        const result = await ShipmentService.renterConfirmDelivered(shipment._id, userId);
        // Normalize response: include shipment and transfer diagnostics
        if (result && result.shipment) {
          console.log('✅ Shipment confirmed and processed');
          return res.json({
            status: 'success',
            data: result.shipment,
            transfer: {
              result: result.transferResult || null,
              error: result.transferError || null
            }
          });
        }

        console.log('✅ Shipment result:', result);
        return res.json({ status: 'success', data: result });
      }

      // Fallback: no shipment found, operate directly on SubOrder
      console.log('⚠️ No shipment found, operating directly on SubOrder...');
      const subOrder = await SubOrder.findById(subOrderId);
      if (!subOrder) {
        console.error('❌ SubOrder not found');
        return res.status(404).json({ status: 'error', message: 'SubOrder not found' });
      }

      const masterOrder = await MasterOrder.findById(subOrder.masterOrder);
      if (!masterOrder) {
        console.error('❌ MasterOrder not found');
        return res.status(404).json({ status: 'error', message: 'MasterOrder not found' });
      }

      if (String(masterOrder.renter) !== String(userId)) {
        console.error('❌ Renter not authorized');
        return res.status(403).json({ status: 'error', message: 'No permission' });
      }

      // If subOrder is already marked DELIVERED, return immediately
      if (subOrder.status === 'DELIVERED') {
        console.log('⚠️ SubOrder already marked DELIVERED');
        return res.json({ status: 'success', data: subOrder });
      }

      // Mark as DELIVERED per renter confirmation
      console.log('🔄 Marking SubOrder as DELIVERED...');
      subOrder.status = 'DELIVERED';
      await subOrder.save();

      // Transfer ONLY rental fee to owner via SystemWallet (NOT deposit)
      let transferResult = null;
      let transferError = null;
      try {
        const ownerId = subOrder.owner;
        // Only transfer rental amount, NOT deposit (deposit is held by admin for renter refund)
        const rentalAmount = subOrder.pricing?.subtotalRental || 0;
        const depositAmount = subOrder.pricing?.subtotalDeposit || 0;
        
        console.log(`💰 Payment breakdown:`);
        console.log(`   - Rental fee (→ owner): ${rentalAmount} VND`);
        console.log(`   - Deposit (→ admin holds): ${depositAmount} VND`);
        console.log(`   - Attempting to transfer ${rentalAmount} VND to owner ${ownerId}`);

        if (rentalAmount > 0) {
          // Get SYSTEM_ADMIN_ID from env, or use a placeholder string for tracking
          const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
          transferResult = await SystemWalletService.transferToUser(
            adminId,
            ownerId,
            rentalAmount,
            `Rental fee for subOrder ${subOrder._id}`
          );
          console.log(`✅ Transfer successful: ${rentalAmount} VND transferred to owner ${ownerId}`);
          console.log(`   Deposit ${depositAmount} VND remains in admin wallet for renter refund`);
        } else {
          console.log('⚠️ Rental amount is 0 or undefined, skipping transfer');
        }
      } catch (err) {
        transferError = err.message || String(err);
        console.error(`❌ Failed to transfer payment to owner: ${transferError}`);
      }

      console.log('📤 Returning response with transfer diagnostics');
      return res.json({
        status: 'success',
        data: subOrder,
        transfer: { result: transferResult, error: transferError }
      });
    } catch (error) {
      console.error('❌ renterConfirmDelivery error:', error.message);
      return res.status(400).json({ status: 'error', message: error.message });
    }
  }
}

module.exports = new RentalOrderController();
