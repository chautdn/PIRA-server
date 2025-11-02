const rentalService = require('../services/rentalProduct.service');
const Order = require('../models/Order');
const Contract = require('../models/Contract');
const Signature = require('../models/Signature');
const { SuccessResponse } = require('../core/success');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../core/error');

class RentalController {
  // Tạo đơn thuê mới
  async createRentalOrder(req, res, next) {
    try {
      const userId = req.user.id;
      const rentalData = {
        ...req.body,
        renter: userId
      };

      const result = await rentalService.createRentalOrder(rentalData);

      new SuccessResponse({
        message: 'Đơn thuê đã được tạo thành công',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Lấy danh sách đơn thuê
  async getRentalOrders(req, res, next) {
    try {
      const userId = req.user.id;
      const { status, role = 'RENTER', page = 1, limit = 10 } = req.query;

      let query = {};
      if (role === 'RENTER') {
        query.renter = userId;
      } else if (role === 'OWNER') {
        query.owner = userId;
      }

      if (status) {
        query.status = status;
      }

      const skip = (page - 1) * limit;
      const orders = await Order.find(query)
        .populate('renter', 'fullName email phone avatar profile')
        .populate('owner', 'fullName email phone avatar profile')
        .populate('product', 'title images pricing location')
        .populate('contract', 'contractNumber status signatures')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Order.countDocuments(query);

      new SuccessResponse({
        message: 'Lấy danh sách đơn thuê thành công',
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
      next(error);
    }
  }

  async getRentalOrdersByOwner(req, res, next) {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 10 } = req.query;
      let query = { owner: userId };

      if (status) {
        query.status = status;
      }
      const skip = (page - 1) * limit;
      const orders = await Order.find(query)
        .populate('renter', 'fullName email phone avatar profile')
        .populate('owner', 'fullName email phone avatar profile')
        .populate('product', 'title images pricing location')
        .populate('contract', 'contractNumber status signatures')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      const total = await Order.countDocuments(query);

      new SuccessResponse({
        message: 'Lấy danh sách đơn thuê của người cho thuê thành công',
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
      next(error);
    }
  }

  // Lấy chi tiết đơn thuê
  async getRentalOrderDetail(req, res, next) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      const order = await Order.findById(orderId)
        .populate('renter', 'fullName email phone avatar profile')
        .populate('owner', 'fullName email phone avatar profile')
        .populate('product')
        .populate('contract');

      if (!order) {
        throw new NotFoundError('Đơn hàng không tồn tại');
      }

      // Kiểm tra quyền truy cập
      if (order.renter._id.toString() !== userId && order.owner._id.toString() !== userId) {
        throw new ForbiddenError('Không có quyền truy cập đơn hàng này');
      }

      new SuccessResponse({
        message: 'Lấy chi tiết đơn thuê thành công',
        metadata: { order }
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Xác nhận đơn thuê (chủ sở hữu)
  async confirmRentalOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      const result = await rentalService.confirmRentalOrder(orderId, userId);

      new SuccessResponse({
        message: 'Đơn thuê đã được xác nhận',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Lấy hợp đồng để ký
  async getContractForSigning(req, res, next) {
    try {
      const { contractId } = req.params;
      const userId = req.user.id;

      const contract = await Contract.findById(contractId)
        .populate('order')
        .populate('owner', 'fullName email profile')
        .populate('renter', 'fullName email profile')
        .populate('product');

      if (!contract) {
        throw new NotFoundError('Hợp đồng không tồn tại');
      }

      // Kiểm tra quyền truy cập
      const isOwner = contract.owner._id.toString() === userId;
      const isRenter = contract.renter._id.toString() === userId;

      if (!isOwner && !isRenter) {
        throw new ForbiddenError('Không có quyền truy cập hợp đồng này');
      }

      // Kiểm tra xem người dùng đã ký chưa
      const userSigned = isOwner
        ? contract.signatures.owner.signed
        : contract.signatures.renter.signed;
      const canSign = !userSigned && ['PENDING_OWNER', 'PENDING_RENTER'].includes(contract.status);

      new SuccessResponse({
        message: 'Lấy thông tin hợp đồng thành công',
        metadata: {
          contract,
          userRole: isOwner ? 'owner' : 'renter',
          canSign,
          userSigned,
          isFullySigned: contract.isFullySigned
        }
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Ký hợp đồng điện tử
  async signContract(req, res, next) {
    try {
      const { contractId } = req.params;
      const { signature } = req.body;
      const userId = req.user.id;
      const ipAddress = req.clientIP; // Từ validateIPAddress middleware

      const result = await rentalService.signContract(contractId, userId, signature, ipAddress);

      new SuccessResponse({
        message: result.isFullySigned
          ? 'Hợp đồng đã được ký hoàn tất'
          : 'Chữ ký đã được lưu thành công',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Lấy chữ ký đã lưu của người dùng
  async getUserSignature(req, res, next) {
    try {
      const userId = req.user.id;

      const signature = await Signature.findOne({ user: userId, isActive: true });

      new SuccessResponse({
        message: 'Lấy chữ ký thành công',
        metadata: { signature }
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Thanh toán đơn thuê
  async processPayment(req, res, next) {
    try {
      const { orderId } = req.params;
      const paymentData = req.body;

      const result = await rentalService.processPayment(orderId, paymentData);

      new SuccessResponse({
        message: 'Thanh toán thành công',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Bắt đầu thời gian thuê
  async startRental(req, res, next) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      const order = await rentalService.startRental(orderId, userId);

      new SuccessResponse({
        message: 'Đã bắt đầu thời gian thuê',
        metadata: order
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Trả sản phẩm
  async returnProduct(req, res, next) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;
      const returnData = req.body;

      const result = await rentalService.returnProduct(orderId, userId, returnData);

      new SuccessResponse({
        message: 'Sản phẩm đã được trả thành công',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Hủy đơn thuê
  async cancelRentalOrder(req, res, next) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;
      const { reason } = req.body;

      const order = await rentalService.cancelRentalOrder(orderId, userId, reason);

      new SuccessResponse({
        message: 'Đơn thuê đã được hủy',
        metadata: order
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  // Lấy lịch sử thuê sản phẩm
  async getRentalHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      const skip = (page - 1) * limit;
      const orders = await Order.find({
        renter: userId,
        status: { $in: ['COMPLETED', 'CANCELLED'] }
      })
        .populate('product', 'title images pricing')
        .populate('owner', 'fullName avatar profile')
        .sort({ completedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Order.countDocuments({
        renter: userId,
        status: { $in: ['COMPLETED', 'CANCELLED'] }
      });

      new SuccessResponse({
        message: 'Lấy lịch sử thuê thành công',
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
      next(error);
    }
  }

  // Tải hợp đồng đã ký (PDF)
  async downloadContract(req, res, next) {
    try {
      const { contractId } = req.params;
      const userId = req.user.id;

      const contract = await Contract.findById(contractId)
        .populate('owner', 'fullName')
        .populate('renter', 'fullName');

      if (!contract) {
        throw new NotFoundError('Hợp đồng không tồn tại');
      }

      // Kiểm tra quyền truy cập
      const isOwner = contract.owner._id.toString() === userId;
      const isRenter = contract.renter._id.toString() === userId;

      if (!isOwner && !isRenter) {
        throw new ForbiddenError('Không có quyền tải hợp đồng này');
      }

      // Chỉ cho phép tải khi hợp đồng đã ký đầy đủ
      if (!contract.isFullySigned) {
        throw new BadRequestError('Hợp đồng chưa được ký đầy đủ');
      }

      // Trả về URL file PDF
      new SuccessResponse({
        message: 'Lấy link tải hợp đồng thành công',
        metadata: {
          contractNumber: contract.contractNumber,
          pdfUrl: contract.content.pdfUrl,
          signedAt: contract.signatures.owner.signedAt
        }
      }).send(res);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RentalController();
