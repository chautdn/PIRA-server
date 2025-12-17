const mongoose = require('mongoose');
const ExtensionRequest = require('../models/Extension'); // Extension model
const SubOrder = require('../models/SubOrder');
const MasterOrder = require('../models/MasterOrder');
const Product = require('../models/Product');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { PayOS } = require('@payos/node');

class ExtensionService {
  /**
   * Renter tạo yêu cầu gia hạn thuê
   */
  async requestExtension(subOrderId, renterId, extensionData) {
    try {
      const { newEndDate, extensionReason, paymentMethod } = extensionData;

      // Validate newEndDate
      if (!newEndDate) {
        throw new Error('Ngày kết thúc mới là bắt buộc');
      }

      const newEnd = new Date(newEndDate);
      const now = new Date();

      if (newEnd <= now) {
        throw new Error('Ngày kết thúc phải sau hôm nay');
      }

      // Lấy SubOrder
      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        status: 'ACTIVE'
      }).populate([{ path: 'masterOrder' }, { path: 'owner' }, { path: 'products.product' }]);

      if (!subOrder) {
        throw new Error('Không tìm thấy SubOrder hoặc SubOrder không ở trạng thái ACTIVE');
      }

      // Verify renter owns this order
      const masterOrder = await MasterOrder.findById(subOrder.masterOrder._id).populate('renter');
      if (masterOrder.renter._id.toString() !== renterId) {
        throw new Error('Không có quyền gia hạn đơn hàng này');
      }

      // Tính toán giá gia hạn
      let currentEnd;

      // Try to get end date from products or subOrder
      if (subOrder.products && subOrder.products.length > 0) {
        currentEnd = new Date(subOrder.products[0].rentalPeriod.endDate);
      } else if (subOrder.rentalPeriod && subOrder.rentalPeriod.endDate) {
        currentEnd = new Date(subOrder.rentalPeriod.endDate);
      } else {
        throw new Error('Không tìm thấy ngày kết thúc của đơn hàng');
      }

      const extensionDays = Math.ceil((newEnd - currentEnd) / (1000 * 60 * 60 * 24));

      if (extensionDays <= 0) {
        throw new Error('Ngày kết thúc mới phải sau ngày kết thúc hiện tại');
      }

      // Lấy giá thuê từ sản phẩm - từ SubOrder hoặc Product
      let rentalRate = 0;

      if (subOrder.products && subOrder.products.length > 0) {
        rentalRate = subOrder.products[0].rentalRate || 0;
      }

      // If not found in subOrder, fetch from Product
      if (rentalRate === 0) {
        const product = await Product.findById(subOrder.products[0].product);
        if (!product) {
          throw new Error('Không tìm thấy sản phẩm');
        }
        rentalRate = product.pricing?.dailyRate || product.price || 0;
      }

      // Validate rentalRate
      if (!rentalRate || rentalRate <= 0 || isNaN(rentalRate)) {
        throw new Error('Giá thuê không hợp lệ. Vui lòng kiểm tra thông tin sản phẩm');
      }

      const extensionCost = Math.round(rentalRate * extensionDays);
      const totalCost = Math.round(extensionCost); // Có thể thêm deposits sau

      // Đảm bảo ownerId lấy đúng từ subOrder và luôn là ObjectId
      let ownerId = subOrder.owner?._id || subOrder.owner;
      if (!ownerId) {
        throw new Error('SubOrder không có owner, không thể tạo yêu cầu gia hạn');
      }
      if (typeof ownerId === 'string' && mongoose.Types.ObjectId.isValid(ownerId)) {
        ownerId = new mongoose.Types.ObjectId(ownerId);
      }
      // Tạo extension request
      const extensionRequest = new ExtensionRequest({
        subOrder: subOrderId,
        masterOrder: masterOrder._id,
        renter: renterId,
        owner: ownerId,
        currentEndDate: currentEnd,
        newEndDate: newEnd,
        extensionReason,
        extensionDays,
        rentalRate,
        extensionCost,
        totalCost,
        paymentMethod,
        status: 'PENDING',
        requestedAt: new Date()
      });

      // Process payment ngay lập tức
      const paymentResult = await this.processExtensionPayment(
        extensionRequest,
        paymentMethod,
        totalCost,
        renterId
      );

      if (paymentResult.status === 'FAILED') {
        throw new Error(`Thanh toán thất bại: ${paymentResult.error}`);
      }

      // Update payment info
      extensionRequest.paymentStatus = 'PAID';
      extensionRequest.paymentInfo = {
        transactionId: paymentResult.transactionId,
        paymentDate: new Date(),
        paymentDetails: paymentResult
      };

      let savedRequest;
      try {
        savedRequest = await extensionRequest.save();
      } catch (saveError) {
        console.error('Save error details:', {
          error: saveError.message,
          validationErrors: saveError.errors,
          data: extensionRequest.toObject()
        });
        throw new Error('Không thể lưu yêu cầu gia hạn: ' + saveError.message);
      }

      if (!savedRequest || !savedRequest._id) {
        throw new Error('Không thể xác nhận dữ liệu đã được lưu');
      }

      // Populate and return
      const populatedRequest = await ExtensionRequest.findById(savedRequest._id).populate([
        { path: 'renter', select: 'profile email' },
        { path: 'owner', select: 'profile email' },
        { path: 'subOrder', select: 'subOrderNumber' }
      ]);

      return populatedRequest;
    } catch (error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        validationErrors: error.errors ? Object.keys(error.errors) : null
      });
      throw new Error('Không thể tạo yêu cầu gia hạn: ' + error.message);
    }
  }

  /**
   * Xử lý thanh toán gia hạn
   */
  async processExtensionPayment(extensionRequest, paymentMethod, amount, renterId) {
    try {
      switch (paymentMethod) {
        case 'WALLET':
          return await this.processWalletPayment(renterId, amount);
        case 'PAYOS':
          return await this.processPayOSPayment(renterId, extensionRequest, amount);
        case 'COD':
          return await this.processCODPayment(renterId, amount);
        default:
          return {
            status: 'SUCCESS',
            transactionId: `EXT_${Date.now()}`,
            method: paymentMethod,
            amount
          };
      }
    } catch (error) {
      return {
        status: 'FAILED',
        error: error.message,
        transactionId: `EXT_${Date.now()}`
      };
    }
  }

  /**
   * Process wallet payment
   */
  async processWalletPayment(renterId, amount) {
    try {
      // Validate amount first
      if (!amount || amount <= 0 || isNaN(amount)) {
        throw new Error(`Số tiền thanh toán không hợp lệ: ${amount}`);
      }

      const user = await User.findById(renterId).populate('wallet');
      if (!user || !user.wallet) {
        throw new Error('Không tìm thấy ví của người dùng');
      }

      const wallet = user.wallet;

      // Validate wallet balance
      if (wallet.balance.available === undefined || wallet.balance.available === null) {
        throw new Error('Ví không có số dư');
      }

      if (wallet.balance.available < amount) {
        throw new Error(
          `Ví không đủ số dư. Hiện có: ${wallet.balance.available.toLocaleString('vi-VN')}đ, cần: ${amount.toLocaleString('vi-VN')}đ`
        );
      }

      // Chuyển tiền từ renter vào system wallet ngay lập tức
      const SystemWalletService = require('./systemWallet.service');
      const transactionId = `EXT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      
      await SystemWalletService.transferFromUser(
        renterId,
        renterId,
        amount,
        'Thanh toán tiền gia hạn đơn thuê',
        {
          isOrderPayment: true,
          metadata: {
            type: 'EXTENSION_PAYMENT',
            action: 'EXTENSION_REQUEST_PAYMENT',
            transactionId: transactionId,
            paymentType: 'extension'
          }
        }
      );

      console.log(`✅ Đã trừ ${amount.toLocaleString('vi-VN')}đ từ ví renter ${renterId} cho yêu cầu gia hạn`);

      return {
        status: 'SUCCESS',
        transactionId: transactionId,
        method: 'WALLET',
        amount: Math.round(amount),
        previousBalance: Math.round(wallet.balance.available + amount),
        newBalance: Math.round(wallet.balance.available)
      };
    } catch (error) {
      console.error('❌ Wallet payment failed:', error.message);
      throw error;
    }
  }

  /**
   * Process PayOS payment
   */
  async processPayOSPayment(renterId, extensionRequest, amount) {
    try {
      // Validate amount
      if (!amount || amount <= 0 || isNaN(amount)) {
        throw new Error(`Số tiền thanh toán không hợp lệ: ${amount}`);
      }

      // Initialize PayOS
      const payos = new PayOS({
        clientId: process.env.PAYOS_CLIENT_ID,
        apiKey: process.env.PAYOS_API_KEY,
        checksumKey: process.env.PAYOS_CHECKSUM_KEY
      });

      // Generate unique order code
      const orderCode = Date.now();

      // Get renter info
      const renter = await User.findById(renterId).populate('wallet');
      if (!renter) {
        throw new Error('Không tìm thấy người thuê');
      }

      // Create PayOS payment request
      const paymentRequest = {
        orderCode,
        amount: Math.round(amount),
        description: `Extension: ${extensionRequest?.extensionDays || 'N/A'} ngày`.substring(0, 25),
        returnUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rental-orders?payment=success&orderCode=${orderCode}`,
        cancelUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rental-orders?payment=cancel&orderCode=${orderCode}`,
        buyerName: renter.profile?.fullName || renter.profile?.firstName || 'Renter',
        buyerEmail: renter.email,
        buyerPhone: renter.phone || '',
        buyerAddress: `${renter.address?.streetAddress || 'N/A'}`
      };

      // Create payment link
      const paymentLink = await payos.paymentRequests.create(paymentRequest);

      // Create transaction record
      const transaction = new Transaction({
        user: renterId,
        wallet: renter.wallet?._id || null,
        type: 'extension_payment',
        amount: Math.round(amount),
        status: 'pending',
        paymentMethod: 'payos',
        externalId: orderCode.toString(),
        orderCode: orderCode.toString(),
        description: `Extension payment - ${extensionRequest?.extensionDays || 'N/A'} ngày`,
        paymentUrl: paymentLink.checkoutUrl,
        metadata: {
          extensionRequestId: extensionRequest?._id?.toString(),
          masterOrderId: extensionRequest?.masterOrder?.toString(),
          subOrderId: extensionRequest?.subOrder?.toString(),
          extensionDays: extensionRequest?.extensionDays,
          paymentMethod: 'payos',
          orderType: 'extension'
        },
        expiredAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      });

      await transaction.save();

      return {
        transactionId: transaction._id.toString(),
        orderCode: orderCode,
        method: 'PAYOS',
        amount: Math.round(amount),
        status: 'PENDING',
        paymentUrl: paymentLink.checkoutUrl,
        qrCode: paymentLink.qrCode || null,
        expiresAt: transaction.expiredAt,
        message: 'Link thanh toán PayOS đã được tạo. Vui lòng hoàn tất thanh toán trong 15 phút.'
      };
    } catch (error) {
      console.error('❌ PayOS payment failed:', error.message);
      throw new Error(`Không thể tạo link thanh toán PayOS: ${error.message}`);
    }
  }

  /**
   * Process COD payment
   */
  async processCODPayment(renterId, amount) {
    return {
      status: 'SUCCESS',
      transactionId: `EXT_${Date.now()}`,
      method: 'COD',
      amount,
      note: 'Thanh toán khi trả hàng'
    };
  }

  /**
   * Owner xem danh sách yêu cầu gia hạn
   */
  async getOwnerExtensionRequests(ownerId, filters = {}) {
    try {
      // Luôn ép ownerId về ObjectId để đảm bảo nhất quán
      let ownerObjectId;
      if (mongoose.Types.ObjectId.isValid(ownerId)) {
        ownerObjectId = new mongoose.Types.ObjectId(ownerId.toString());
      } else {
        throw new Error('ownerId không hợp lệ');
      }
      const query = { owner: ownerObjectId };

      if (filters.status) {
        query.status = filters.status;
      }

      const requests = await ExtensionRequest.find(query)
        .populate([
          { path: 'renter', select: 'profile email' },
          { path: 'masterOrder', populate: { path: 'renter', select: 'profile' } }
        ])
        .sort({ requestedAt: -1 })
        .limit(filters.limit || 10)
        .skip((filters.page - 1) * (filters.limit || 10) || 0);

      const total = await ExtensionRequest.countDocuments(query);

      return {
        requests,
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 10,
          total,
          pages: Math.ceil(total / (filters.limit || 10))
        }
      };
    } catch (error) {
      throw new Error('Không thể lấy danh sách yêu cầu gia hạn: ' + error.message);
    }
  }

  /**
   * Owner xem chi tiết một yêu cầu gia hạn
   */
  async getExtensionRequestDetail(requestId, ownerId) {
    try {
      const request = await ExtensionRequest.findOne({
        _id: requestId,
        owner: ownerId
      }).populate([
        { path: 'renter', select: 'profile email' },
        { path: 'owner', select: 'profile email' },
        { path: 'subOrder' },
        { path: 'masterOrder' }
      ]);

      if (!request) {
        throw new Error('Không tìm thấy yêu cầu gia hạn');
      }

      return request;
    } catch (error) {
      console.error(' Error fetching request detail:', error);
      throw new Error('Không thể lấy chi tiết yêu cầu: ' + error.message);
    }
  }

  /**
   * Owner chấp nhận yêu cầu gia hạn
   */
  async approveExtension(requestId, ownerId) {
    try {
      const extensionRequest = await ExtensionRequest.findOne({
        _id: requestId,
        owner: ownerId,
        status: 'PENDING'
      }).populate('subOrder masterOrder renter');

      if (!extensionRequest) {
        throw new Error('Không tìm thấy yêu cầu gia hạn hoặc yêu cầu đã được xử lý');
      }

      // Update extension request
      extensionRequest.status = 'APPROVED';
      extensionRequest.ownerResponse = {
        status: 'APPROVED',
        respondedAt: new Date()
      };
      extensionRequest.approvedAt = new Date();
      await extensionRequest.save();

      // Update SubOrder - extend rental period
      const subOrder = extensionRequest.subOrder;
      subOrder.rentalPeriod.endDate = extensionRequest.newEndDate;
      await subOrder.save();

      // Transfer 90% extension fee to owner (frozen until order completed)
      const SystemWalletService = require('./systemWallet.service');
      const ownerCompensation = Math.floor(extensionRequest.totalCost * 0.9); // 90% of extension fee
      
      if (ownerCompensation > 0) {
        console.log(`💰 Chuyển 90% tiền gia hạn cho owner: ${ownerCompensation.toLocaleString()} VND`);
        
        try {
          const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
          const transferResult = await SystemWalletService.transferToUserFrozen(
            adminId,
            ownerId,
            ownerCompensation,
            `Phí gia hạn (90%) - ${extensionRequest.extensionDays} ngày`,
            365 * 24 * 60 * 60 * 1000 // Frozen for 1 year, will unlock when order completed
          );

          // Update transaction metadata with subOrderId for unlock tracking
          if (transferResult?.transactions?.user?._id) {
            await Transaction.findByIdAndUpdate(
              transferResult.transactions.user._id,
              {
                $set: {
                  'metadata.subOrderId': extensionRequest.subOrder,
                  'metadata.action': 'RECEIVED_EXTENSION_FEE',
                  'metadata.extensionId': extensionRequest._id,
                  'metadata.extensionDays': extensionRequest.extensionDays
                }
              }
            );
          }

          console.log(`✅ Đã chuyển ${ownerCompensation.toLocaleString()} VND vào frozen wallet owner ${ownerId}`);
        } catch (transferErr) {
          console.error('❌ Lỗi chuyển tiền cho owner:', transferErr.message);
          // Don't throw error, extension still approved
        }
      }

      return await ExtensionRequest.findById(requestId).populate([
        { path: 'renter', select: 'profile email' }
      ]);
    } catch (error) {
      throw new Error('Không thể chấp nhận yêu cầu gia hạn: ' + error.message);
    }
  }

  /**
   * Owner từ chối yêu cầu gia hạn
   */
  async rejectExtension(requestId, ownerId, rejectionData) {
    try {
      const { rejectionReason, notes } = rejectionData;

      const extensionRequest = await ExtensionRequest.findOne({
        _id: requestId,
        owner: ownerId,
        status: 'PENDING'
      }).populate('renter');

      if (!extensionRequest) {
        throw new Error('Không tìm thấy yêu cầu gia hạn hoặc yêu cầu đã được xử lý');
      }

      // Update status
      extensionRequest.status = 'REJECTED';
      extensionRequest.ownerResponse = {
        status: 'REJECTED',
        respondedAt: new Date(),
        rejectionReason,
        notes
      };
      extensionRequest.rejectedAt = new Date();

      // Refund payment with reason
      if (extensionRequest.paymentStatus === 'PAID') {
        await this.refundExtensionPayment(
          extensionRequest,
          `Chủ sở hữu từ chối yêu cầu gia hạn - ${rejectionReason || 'Không có lý do'}`
        );
      }

      await extensionRequest.save();

      return extensionRequest;
    } catch (error) {
      throw new Error('Không thể từ chối yêu cầu gia hạn: ' + error.message);
    }
  }

  /**
   * Refund payment khi từ chối hoặc hết hạn
   */
  async refundExtensionPayment(extensionRequest, reason = 'Hoàn tiền yêu cầu gia hạn') {
    try {
      const { renter, paymentMethod, totalCost } = extensionRequest;

      if (paymentMethod === 'WALLET') {
        // Hoàn tiền gia hạn từ system wallet về ví renter
        const SystemWalletService = require('./systemWallet.service');
        const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
        
        await SystemWalletService.transferToUser(
          adminId,
          renter,
          totalCost,
          reason
        );
        
        console.log(`✅ Hoàn ${totalCost.toLocaleString('vi-VN')}đ tiền gia hạn về ví renter ${renter} - Lý do: ${reason}`);
      }
      // For other payment methods (PAYOS, COD), handle separately if needed
    } catch (error) {
      console.error('❌ Error refunding extension payment:', error.message);
      // Continue even if refund fails
    }
  }

  /**
   * Renter hủy yêu cầu gia hạn (chỉ trước khi owner phản hồi)
   */
  async cancelExtension(requestId, renterId) {
    try {
      const extensionRequest = await ExtensionRequest.findOne({
        _id: requestId,
        renter: renterId,
        status: 'PENDING'
      });

      if (!extensionRequest) {
        throw new Error('Không tìm thấy yêu cầu gia hạn hoặc yêu cầu đã được xử lý');
      }

      // Update status
      extensionRequest.status = 'CANCELLED';
      await extensionRequest.save();

      // Refund payment with reason
      if (extensionRequest.paymentStatus === 'PAID') {
        await this.refundExtensionPayment(
          extensionRequest,
          'Người thuê hủy yêu cầu gia hạn'
        );
      }

      return extensionRequest;
    } catch (error) {
      throw new Error('Không thể hủy yêu cầu gia hạn: ' + error.message);
    }
  }

  /**
   * Auto-reject expired extension requests (owner didn't respond by old endDate)
   */
  async autoRejectExpiredExtensions() {
    try {
      const now = new Date();
      
      // Find all PENDING extension requests where currentEndDate has passed
      const expiredRequests = await ExtensionRequest.find({
        status: 'PENDING',
        paymentStatus: 'PAID',
        currentEndDate: { $lt: now }
      }).populate('renter owner');

      if (!expiredRequests || expiredRequests.length === 0) {
        return {
          success: true,
          processedCount: 0,
          message: 'No expired extension requests to process'
        };
      }

      console.log(`🔄 Processing ${expiredRequests.length} expired extension requests...`);

      const results = [];
      for (const request of expiredRequests) {
        try {
          // Update status to EXPIRED
          request.status = 'EXPIRED';
          request.ownerResponse = {
            status: 'EXPIRED',
            respondedAt: new Date(),
            rejectionReason: 'Hết thời gian phản hồi - tự động từ chối',
            notes: 'Chủ sở hữu không xác nhận hoặc từ chối trước ngày kết thúc cũ'
          };
          request.expiredAt = new Date();

          // Refund payment
          await this.refundExtensionPayment(
            request,
            'Chủ sở hữu không phản hồi trước ngày kết thúc - hoàn tiền tự động'
          );

          await request.save();
          
          results.push({
            requestId: request._id,
            renter: request.renter?.email || 'N/A',
            refundAmount: request.totalCost,
            status: 'SUCCESS'
          });

          console.log(`✅ Auto-rejected and refunded request ${request._id} - ${request.totalCost}đ to ${request.renter?.email}`);
        } catch (error) {
          console.error(`❌ Error processing request ${request._id}:`, error.message);
          results.push({
            requestId: request._id,
            status: 'FAILED',
            error: error.message
          });
        }
      }

      return {
        success: true,
        processedCount: expiredRequests.length,
        results
      };
    } catch (error) {
      console.error('❌ Error in autoRejectExpiredExtensions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Renter xem danh sách yêu cầu gia hạn của mình
   */
  async getRenterExtensionRequests(renterId, filters = {}) {
    try {
      const query = { renter: renterId };

      if (filters.status) {
        query.status = filters.status;
      }

      const requests = await ExtensionRequest.find(query)
        .populate([{ path: 'owner', select: 'profile email' }])
        .sort({ requestedAt: -1 })
        .limit(filters.limit || 10)
        .skip((filters.page - 1) * (filters.limit || 10) || 0);

      const total = await ExtensionRequest.countDocuments(query);

      return {
        requests,
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 10,
          total,
          pages: Math.ceil(total / (filters.limit || 10))
        }
      };
    } catch (error) {
      throw new Error('Không thể lấy danh sách yêu cầu: ' + error.message);
    }
  }
}

module.exports = new ExtensionService();
