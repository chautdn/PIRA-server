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

      // Send real-time notification to owner
      try {
        const Notification = require('../models/Notification');

        // Get product name from subOrder
        let productName = 'sản phẩm';
        if (subOrder.products && subOrder.products.length > 0) {
          const product = subOrder.products[0].product;
          if (product) {
            productName = product.title || product.name || product.productName || 'sản phẩm';
          }
        }

        const notification = new Notification({
          recipient: ownerId,
          sender: renterId,
          type: 'EXTENSION_REQUEST',
          title: 'Yêu cầu gia hạn thuê mới',
          message: `${masterOrder.renter.profile?.firstName || 'Khách hàng'} muốn gia hạn cho sản phẩm "${productName}" (${subOrder.subOrderNumber}) thêm ${extensionDays} ngày (đến ${newEnd.toLocaleDateString('vi-VN')}). Phí: ${totalCost.toLocaleString('vi-VN')}đ`,
          relatedId: savedRequest._id,
          relatedModel: 'Extension',
          metadata: {
            extensionId: savedRequest._id,
            subOrderNumber: subOrder.subOrderNumber,
            productName: productName,
            extensionDays: extensionDays,
            newEndDate: newEndDate,
            totalCost: totalCost
          }
        });
        await notification.save();

        // Send socket notification to owner
        if (global.chatGateway) {
          // Emit notification event
          global.chatGateway.emitNotification(ownerId.toString(), {
            type: 'EXTENSION_REQUEST',
            title: 'Yêu cầu gia hạn thuê mới',
            message: notification.message,
            timestamp: new Date().toISOString(),
            data: {
              extensionId: extensionRequest._id,
              subOrderNumber: subOrder.subOrderNumber,
              renterName:
                `${extensionRequest.renter.profile?.firstName || ''} ${extensionRequest.renter.profile?.lastName || ''}`.trim(),
              extensionDays: extensionRequest.extensionDays,
              totalCost: extensionRequest.totalCost
            }
          });

          // Emit custom extension-request event
          global.chatGateway.emitToUser(ownerId.toString(), 'extension-request', {
            type: 'extension_requested',
            extensionId: savedRequest._id,
            subOrderNumber: subOrder.subOrderNumber,
            productName: productName,
            renterName: masterOrder.renter.profile?.firstName || 'Khách hàng',
            extensionDays: extensionDays,
            newEndDate: newEndDate,
            totalCost: totalCost,
            message: `Yêu cầu gia hạn "${productName}" thêm ${extensionDays} ngày`
          });
        }
      } catch (err) {
        console.error('Failed to send extension request notification:', err);
      }

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

      // Emit wallet update realtime
      if (global.chatGateway) {
        const updatedWallet = await user.wallet.populate('user');
        global.chatGateway.emitWalletUpdate(renterId.toString(), {
          type: 'EXTENSION_PAYMENT',
          amount: amount,
          newBalance: wallet.balance.available,
          frozenBalance: wallet.balance.frozen,
          action: 'deduct',
          description: 'Thanh toán tiền gia hạn đơn thuê',
          timestamp: new Date().toISOString()
        });
      }

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
        returnUrl: `${process.env.CLIENT_URL || 'https://pira.asia'}/rental-orders?payment=success&orderCode=${orderCode}`,
        cancelUrl: `${process.env.CLIENT_URL || 'https://pira.asia'}/rental-orders?payment=cancel&orderCode=${orderCode}`,
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
        try {
          const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';
          const transferResult = await SystemWalletService.transferToUserFrozen(
            adminId,
            ownerId,
            ownerCompensation,
            `Phí gia hạn (90%) - ${extensionRequest.extensionDays} ngày`,
            24 * 60 * 60 * 1000 // 24 hours
          );

          // Update transaction metadata with subOrderId for unlock tracking
          if (transferResult?.transactions?.user?._id) {
            await Transaction.findByIdAndUpdate(transferResult.transactions.user._id, {
              $set: {
                'metadata.subOrderId': extensionRequest.subOrder,
                'metadata.action': 'RECEIVED_EXTENSION_FEE',
                'metadata.extensionId': extensionRequest._id,
                'metadata.extensionDays': extensionRequest.extensionDays
              }
            });
          }

          // Emit wallet update realtime for owner (frozen balance increased)
          if (global.chatGateway && transferResult?.userWallet) {
            global.chatGateway.emitWalletUpdate(ownerId.toString(), {
              type: 'EXTENSION_FEE_RECEIVED',
              amount: ownerCompensation,
              newBalance: transferResult.userWallet.balance.available,
              frozenBalance: transferResult.userWallet.balance.frozen,
              action: 'add_frozen',
              description: `Phí gia hạn (90%) - ${extensionRequest.extensionDays} ngày (đóng băng 24h)`,
              timestamp: new Date().toISOString()
            });
          }
        } catch (transferErr) {
          console.error('❌ Lỗi chuyển tiền cho owner:', transferErr.message);
          // Don't throw error, extension still approved
        }
      }

      const result = await ExtensionRequest.findById(requestId).populate([
        { path: 'renter', select: 'profile email' },
        { path: 'owner', select: 'profile email' },
        { path: 'subOrder', select: 'subOrderNumber' }
      ]);

      // Send real-time notification to renter
      try {
        const Notification = require('../models/Notification');
        const notification = new Notification({
          recipient: result.renter._id,
          sender: ownerId,
          type: 'EXTENSION_APPROVED',
          title: 'Yêu cầu gia hạn được chấp nhận',
          message: `${result.owner.profile?.firstName || 'Chủ sở hữu'} đã chấp nhận yêu cầu gia hạn đơn hàng ${result.subOrder.subOrderNumber}. Thời gian thuê mới đến ${result.newEndDate.toLocaleDateString('vi-VN')}`,
          relatedId: requestId,
          relatedModel: 'Extension',
          metadata: {
            extensionId: requestId,
            subOrderNumber: result.subOrder.subOrderNumber,
            extensionDays: result.extensionDays,
            newEndDate: result.newEndDate
          }
        });
        await notification.save();

        // Send socket notification to renter
        if (global.chatGateway) {
          // Emit notification with full notification object including _id
          global.chatGateway.emitNotification(result.renter._id.toString(), notification);

          global.chatGateway.emitToUser(result.renter._id.toString(), 'extension-approved', {
            type: 'extension_approved',
            extensionId: requestId,
            subOrderNumber: result.subOrder.subOrderNumber,
            ownerName: result.owner.profile?.firstName || 'Chủ sở hữu',
            extensionDays: result.extensionDays,
            newEndDate: result.newEndDate,
            extensionCost: extensionRequest.totalCost,
            message: `Gia hạn được chấp nhận đến ${result.newEndDate.toLocaleDateString('vi-VN')}`
          });
        }
      } catch (err) {
        console.error('Failed to send extension approved notification:', err);
      }

      return result;
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

      // Populate for notification
      const result = await ExtensionRequest.findById(requestId).populate([
        { path: 'renter', select: 'profile email' },
        { path: 'owner', select: 'profile email' },
        { path: 'subOrder', select: 'subOrderNumber' }
      ]);

      // Send real-time notification to renter
      try {
        const Notification = require('../models/Notification');
        const notification = new Notification({
          recipient: result.renter._id,
          sender: ownerId,
          type: 'EXTENSION_REJECTED',
          title: 'Yêu cầu gia hạn bị từ chối',
          message: `${result.owner.profile?.firstName || 'Chủ sở hữu'} đã từ chối yêu cầu gia hạn đơn hàng ${result.subOrder.subOrderNumber}. Lý do: ${rejectionReason || 'Không có lý do'}. ${notes ? `Ghi chú: ${notes}` : ''}`,
          relatedId: requestId,
          relatedModel: 'Extension',
          metadata: {
            extensionId: requestId,
            subOrderNumber: result.subOrder.subOrderNumber,
            rejectionReason: rejectionReason,
            notes: notes
          }
        });
        await notification.save();

        // Send socket notification to renter
        if (global.chatGateway) {
          // Emit notification with full notification object including _id
          global.chatGateway.emitNotification(result.renter._id.toString(), notification);

          global.chatGateway.emitToUser(result.renter._id.toString(), 'extension-rejected', {
            type: 'extension_rejected',
            extensionId: requestId,
            subOrderNumber: result.subOrder.subOrderNumber,
            ownerName: result.owner.profile?.firstName || 'Chủ sở hữu',
            rejectionReason: rejectionReason,
            notes: notes,
            refundAmount: extensionRequest.totalCost,
            message: `Yêu cầu gia hạn bị từ chối: ${rejectionReason || 'Không có lý do'}. Tiền đã được hoàn trả.`
          });
        }
      } catch (err) {
        console.error('Failed to send extension rejected notification:', err);
      }

      return result;
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

        const refundResult = await SystemWalletService.transferToUser(
          adminId,
          renter,
          totalCost,
          reason
        );

        // Emit wallet update realtime for refund
        if (global.chatGateway && refundResult?.userWallet) {
          global.chatGateway.emitWalletUpdate(renter.toString(), {
            type: 'EXTENSION_REFUND',
            amount: totalCost,
            newBalance: refundResult.userWallet.balance.available,
            frozenBalance: refundResult.userWallet.balance.frozen,
            action: 'add',
            description: reason,
            timestamp: new Date().toISOString()
          });
        }
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
        await this.refundExtensionPayment(extensionRequest, 'Người thuê hủy yêu cầu gia hạn');
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
