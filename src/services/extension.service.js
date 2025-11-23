const ExtensionRequest = require('../models/ExtensionRequest');
const SubOrder = require('../models/SubOrder');
const MasterOrder = require('../models/MasterOrder');
const Product = require('../models/Product');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

class ExtensionService {
  /**
   * Renter tạo yêu cầu gia hạn thuê
   */
  async requestExtension(subOrderId, renterId, extensionData) {
    try {
      console.log('🔄 Creating extension request:', { subOrderId, renterId });
      console.log('📋 Extension data:', JSON.stringify(extensionData, null, 2));

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
      }).populate([
        { path: 'masterOrder' },
        { path: 'owner' },
        { path: 'products.product' }
      ]);

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

      console.log('💰 Calculation:', {
        currentEndDate: currentEnd,
        newEndDate: newEnd,
        extensionDays,
        rentalRate,
        extensionCost,
        totalCost
      });

      // Tạo extension request
      const extensionRequest = new ExtensionRequest({
        subOrder: subOrderId,
        masterOrder: masterOrder._id,
        renter: renterId,
        owner: subOrder.owner._id,
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
      console.log('💳 Processing payment...');
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

      const savedRequest = await extensionRequest.save().catch(saveError => {
        console.error('❌ Save error details:', {
          error: saveError.message,
          validationErrors: saveError.errors,
          data: extensionRequest.toObject()
        });
        throw saveError;
      });
      
      console.log('✅ Extension request saved:', savedRequest._id);
      console.log('📦 Saved data:', JSON.stringify(savedRequest, null, 2));

      // Verify data was saved
      const verifyData = await ExtensionRequest.findById(savedRequest._id);
      if (!verifyData) {
        throw new Error('Không thể xác nhận dữ liệu đã được lưu');
      }
      console.log('✅ Data verification successful');

      // Populate and return
      const populatedRequest = await ExtensionRequest.findById(savedRequest._id).populate([
        { path: 'renter', select: 'profile email' },
        { path: 'owner', select: 'profile email' },
        { path: 'subOrder', select: 'subOrderNumber' }
      ]);
      
      console.log('✅ Final populated request:', populatedRequest._id);
      return populatedRequest;
    } catch (error) {
      console.error('❌ Error creating extension request:', error);
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
      console.log('💳 Processing extension payment:', { paymentMethod, amount });

      switch (paymentMethod) {
        case 'WALLET':
          return await this.processWalletPayment(renterId, amount);
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
      console.error('❌ Payment error:', error);
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

      // Deduct from wallet - ensure result is a number
      const transactionId = `EXT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      wallet.balance.available = Math.round(wallet.balance.available - amount);
      
      // Add transaction log
      if (!wallet.transactions) {
        wallet.transactions = [];
      }
      wallet.transactions.push({
        type: 'PAYMENT',
        amount: Math.round(amount),
        description: 'Extension request payment',
        timestamp: new Date(),
        status: 'COMPLETED'
      });
      
      await wallet.save();

      console.log('✅ Wallet payment successful');

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
   * Process COD payment
   */
  async processCODPayment(renterId, amount) {
    console.log('💵 Processing COD payment - no immediate payment');
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
      console.log('🔍 Fetching extension requests for owner:', ownerId);

      const query = { owner: ownerId };
      
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
      console.error('❌ Error fetching extension requests:', error);
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
      console.error('❌ Error fetching request detail:', error);
      throw new Error('Không thể lấy chi tiết yêu cầu: ' + error.message);
    }
  }

  /**
   * Owner chấp nhận yêu cầu gia hạn
   */
  async approveExtension(requestId, ownerId) {
    try {
      console.log('✅ Approving extension request:', requestId);

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

      console.log('✅ SubOrder updated with new end date');

      return await ExtensionRequest.findById(requestId).populate([
        { path: 'renter', select: 'profile email' }
      ]);
    } catch (error) {
      console.error('❌ Error approving extension:', error);
      throw new Error('Không thể chấp nhận yêu cầu gia hạn: ' + error.message);
    }
  }

  /**
   * Owner từ chối yêu cầu gia hạn
   */
  async rejectExtension(requestId, ownerId, rejectionData) {
    try {
      console.log('❌ Rejecting extension request:', requestId);

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

      // Refund payment
      console.log('💸 Processing refund...');
      if (extensionRequest.paymentStatus === 'PAID') {
        await this.refundExtensionPayment(extensionRequest);
        console.log('✅ Refund processed');
      }

      await extensionRequest.save();

      return extensionRequest;
    } catch (error) {
      console.error('❌ Error rejecting extension:', error);
      throw new Error('Không thể từ chối yêu cầu gia hạn: ' + error.message);
    }
  }

  /**
   * Refund payment khi từ chối
   */
  async refundExtensionPayment(extensionRequest) {
    try {
      const { renter, paymentMethod, totalCost } = extensionRequest;

      if (paymentMethod === 'WALLET') {
        const user = await User.findById(renter).populate('wallet');
        if (user && user.wallet) {
          user.wallet.balance.available += totalCost;
          await user.wallet.save();
          console.log('✅ Refunded to wallet:', totalCost);
        }
      }
    } catch (error) {
      console.error('⚠️  Error processing refund:', error);
      // Continue even if refund fails
    }
  }

  /**
   * Renter hủy yêu cầu gia hạn (chỉ trước khi owner phản hồi)
   */
  async cancelExtension(requestId, renterId) {
    try {
      console.log('🚫 Cancelling extension request:', requestId);

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

      // Refund payment
      if (extensionRequest.paymentStatus === 'PAID') {
        await this.refundExtensionPayment(extensionRequest);
      }

      return extensionRequest;
    } catch (error) {
      console.error('❌ Error cancelling extension:', error);
      throw new Error('Không thể hủy yêu cầu gia hạn: ' + error.message);
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
        .populate([
          { path: 'owner', select: 'profile email' }
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
      console.error('❌ Error fetching renter requests:', error);
      throw new Error('Không thể lấy danh sách yêu cầu: ' + error.message);
    }
  }
}

module.exports = new ExtensionService();
