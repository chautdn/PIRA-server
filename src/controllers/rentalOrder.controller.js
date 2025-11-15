const RentalOrderService = require('../services/rentalOrder.service');
const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Contract = require('../models/Contract');
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
      const { rentalPeriod, deliveryAddress, deliveryMethod, paymentMethod, totalAmount } =
        req.body;

      console.log('📥 POST /api/rental-orders/create-paid');
      console.log('📋 Request body:', JSON.stringify(req.body, null, 2));

      // Tạo đơn thuê với thanh toán
      const masterOrder = await RentalOrderService.createPaidOrderFromCart(userId, {
        rentalPeriod,
        deliveryAddress,
        deliveryMethod,
        paymentMethod,
        totalAmount
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

      return new SuccessResponse({
        message: 'Lấy chi tiết đơn hàng thành công',
        metadata: {
          masterOrder
        }
      }).send(res);
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
      const ownerId = req.user.id;
      const { page, limit } = req.query;

      console.log('📥 GET /api/rental-orders/owner-active-rentals');
      console.log('👤 Owner ID:', ownerId);
      console.log('📋 Query params:', { page, limit });

      const activeRentals = await RentalOrderService.getActiveRentalsByOwner(ownerId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      });

      return new SuccessResponse({
        message: 'Lấy danh sách sản phẩm đang cho thuê thành công',
        metadata: {
          activeRentals
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error in getOwnerActiveRentals:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Không thể lấy danh sách sản phẩm đang cho thuê'
      });
    }
  }
}

module.exports = new RentalOrderController();
