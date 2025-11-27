const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Contract = require('../models/Contract');
const VietMapService = require('./vietmap.service');
const mongoose = require('mongoose');
const { PayOS } = require('@payos/node');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const SystemWalletService = require('./systemWallet.service');

// Initialize PayOS
const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY
});

class RentalOrderService {
  /**
   * Bước 1: Tạo đơn thuê tạm từ giỏ hàng (Draft Order)
   */
  async createDraftOrderFromCart(renterId, orderData) {
    try {
      const { rentalPeriod, deliveryAddress, deliveryMethod } = orderData;

      // Lấy thông tin giỏ hàng
      const cart = await Cart.findOne({ user: renterId }).populate({
        path: 'items.product',
        populate: {
          path: 'owner',
          select: 'profile.firstName phone address'
        }
      });

      if (!cart || cart.items.length === 0) {
        throw new Error('Giỏ hàng trống');
      }

      // Kiểm tra các items trong cart có đầy đủ thông tin không
      for (const item of cart.items) {
        if (!item.product) {
          throw new Error('Có sản phẩm trong giỏ hàng đã bị xóa');
        }
        if (!item.product.owner) {
          throw new Error('Thông tin chủ sở hữu sản phẩm không đầy đủ');
        }
        // Kiểm tra rental period cho từng item
        if (!item.rental || !item.rental.startDate || !item.rental.endDate) {
          throw new Error(
            `Sản phẩm "${item.product.title || item.product.name}" chưa có thời gian thuê`
          );
        }
        // Kiểm tra thời gian hợp lệ
        const startDate = new Date(item.rental.startDate);
        const endDate = new Date(item.rental.endDate);
        if (startDate >= endDate) {
          throw new Error(
            `Thời gian thuê không hợp lệ cho sản phẩm "${item.product.title || item.product.name}"`
          );
        }
        // Kiểm tra thời gian: trước 12h trưa có thể chọn hôm nay, sau 12h phải chọn ngày mai
        const now = new Date();
        const minStartDate = new Date();
        if (now.getHours() >= 12) {
          minStartDate.setDate(minStartDate.getDate() + 1);
        }
        minStartDate.setHours(0, 0, 0, 0);

        // So sánh chỉ ngày, không so sánh giờ
        const startDateOnly = new Date(startDate);
        startDateOnly.setHours(0, 0, 0, 0);

        if (startDateOnly < minStartDate) {
          const timeMessage =
            now.getHours() >= 12
              ? 'Sau 12h trưa, ngày bắt đầu phải từ ngày mai trở đi'
              : 'Ngày bắt đầu phải từ hôm nay trở đi';
          throw new Error(
            `${timeMessage} cho sản phẩm "${item.product.title || item.product.name}" "${startDate.toISOString().split('T')[0]}"`
          );
        }
      }

      // Nhóm sản phẩm theo chủ sở hữu
      const productsByOwner = this.groupProductsByOwner(cart.items);

      // Tạo masterOrderNumber
      const orderNumber = `MO${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      // Tạo MasterOrder (rentalPeriod optional vì mỗi product có period riêng)
      const masterOrder = new MasterOrder({
        renter: renterId,
        masterOrderNumber: orderNumber,
        deliveryAddress: {
          ...deliveryAddress,
          latitude: deliveryAddress.latitude || null,
          longitude: deliveryAddress.longitude || null
        },
        deliveryMethod,
        status: 'DRAFT'
      });

      await masterOrder.save();

      // Tạo SubOrder cho từng chủ
      const subOrders = [];
      let totalAmount = 0;
      let totalDepositAmount = 0;
      let totalShippingFee = 0;

      for (const [ownerId, products] of Object.entries(productsByOwner)) {
        const owner = await User.findById(ownerId);
        if (!owner) continue;

        // Tính toán giá cho sản phẩm (không cần pass master rentalPeriod)
        const processedProducts = await this.calculateProductPricing(products);

        // Tạo subOrderNumber
        const subOrderNumber = `SO${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

        // Tạo SubOrder (không set rentalPeriod ở SubOrder level vì mỗi product có period riêng)
        const subOrder = new SubOrder({
          masterOrder: masterOrder._id,
          subOrderNumber: subOrderNumber,
          owner: ownerId,
          ownerAddress: owner.profile.address || {},
          products: processedProducts,
          shipping: {
            method: deliveryMethod
          },
          status: 'DRAFT'
        });

        // Tính phí shipping nếu cần giao hàng
        if (deliveryMethod === 'DELIVERY' && owner.profile.address) {
          const shippingInfo = await this.calculateShippingFee(
            owner.profile.address,
            deliveryAddress
          );

          subOrder.shipping = {
            ...subOrder.shipping,
            ...shippingInfo
          };
          subOrder.pricing.shippingFee =
            shippingInfo.fee.calculatedFee || shippingInfo.fee.breakdown?.total || 0;
        }

        await subOrder.save();
        subOrders.push(subOrder);

        // Cộng dồn tổng tiền
        totalAmount += subOrder.pricing.subtotalRental;
        totalDepositAmount += subOrder.pricing.subtotalDeposit;
        totalShippingFee += subOrder.pricing.shippingFee;
      }

      // Cập nhật MasterOrder
      masterOrder.subOrders = subOrders.map((so) => so._id);
      masterOrder.totalAmount = totalAmount;
      masterOrder.totalDepositAmount = totalDepositAmount;
      masterOrder.totalShippingFee = totalShippingFee;

      await masterOrder.save();

      // Populate và trả về
      return await MasterOrder.findById(masterOrder._id)
        .populate({
          path: 'subOrders',
          populate: [
            { path: 'owner', select: 'profile.fullName profile.phone profile.address' },
            { path: 'products.product', select: 'name images price deposit category' }
          ]
        })
        .populate('renter', 'profile phone email');
    } catch (error) {
      console.error('❌ Error creating draft order:', error);

      // Throw more specific error message
      if (error.message.includes('ValidationError')) {
        throw new Error('Dữ liệu đơn hàng không hợp lệ: ' + error.message);
      } else if (error.message.includes('MongoError')) {
        throw new Error('Lỗi cơ sở dữ liệu khi tạo đơn hàng');
      } else {
        throw new Error('Không thể tạo đơn thuê: ' + error.message);
      }
    }
  }

  /**
   * Tạo đơn thuê với thanh toán (renter pays upfront)
   */
  async createPaidOrderFromCart(renterId, orderData) {
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
    } = orderData;

    try {
      // First create draft order using existing method
      const draftOrder = await this.createDraftOrderFromCart(renterId, {
        rentalPeriod,
        deliveryAddress,
        deliveryMethod
      });

      if (!draftOrder || !draftOrder._id) {
        throw new Error('Không thể tạo đơn hàng draft');
      }

      // Process payment based on method

      const paymentData = {
        method: paymentMethod,
        amount: totalAmount,
        transactionId:
          paymentTransactionId || `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        message: paymentMessage
      };

      // Add COD specific fields if applicable
      if (paymentMethod === 'COD') {
        paymentData.depositAmount = depositAmount;
        paymentData.depositPaymentMethod = depositPaymentMethod;
        paymentData.depositTransactionId = depositTransactionId;
      }

      const paymentResult = await this.processPaymentForOrder(draftOrder._id, paymentData);

      // Check payment result
      if (paymentResult.status === 'FAILED') {
        throw new Error(`Thanh toán thất bại: ${paymentResult.error || 'Unknown error'}`);
      }

      // Update order status based on payment result
      draftOrder.paymentMethod = paymentMethod;
      draftOrder.paymentInfo = paymentResult;

      // Set payment status based on payment result status
      if (paymentResult.status === 'SUCCESS') {
        // Wallet payment: đã trừ tiền thành công
        draftOrder.paymentStatus = 'PAID';
        draftOrder.status = 'PENDING_CONFIRMATION';
      } else if (paymentResult.status === 'PARTIALLY_PAID') {
        // COD with deposit paid via Wallet: cọc đã trừ
        draftOrder.paymentStatus = 'PARTIALLY_PAID';
        draftOrder.status = 'PENDING_CONFIRMATION';
      } else if (paymentResult.status === 'PENDING') {
        // PayOS: đang chờ user thanh toán qua link
        // COD with deposit via PayOS: đang chờ thanh toán cọc
        draftOrder.paymentStatus = 'PENDING';
        draftOrder.status = 'AWAITING_PAYMENT'; // Chờ thanh toán
      }

      await draftOrder.save();

      // Update SubOrders status only if payment is confirmed (SUCCESS or PARTIALLY_PAID)
      if (paymentResult.status === 'SUCCESS' || paymentResult.status === 'PARTIALLY_PAID') {
        await SubOrder.updateMany(
          { masterOrder: draftOrder._id },
          { status: 'PENDING_OWNER_CONFIRMATION' }
        );

        // Set owner confirmation deadline (24h for paid orders)
        const expireTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
        draftOrder.ownerConfirmationDeadline = expireTime;
        await draftOrder.save();

        console.log('✅ Order confirmed and SubOrders updated to PENDING_OWNER_CONFIRMATION');
      } else {
        // PENDING payment: SubOrders remain in initial status
        console.log('⏳ Order created but awaiting payment completion');
      }

      // ✅ NO NEED TO UPDATE PRODUCT AVAILABILITY IN DATABASE
      // Product availability is calculated dynamically based on SubOrder data
      // The availability API will handle showing correct quantities per date ranges
      console.log('✅ Product quantities remain unchanged - availability calculated via SubOrders');

      // Return populated order
      return await MasterOrder.findById(draftOrder._id)
        .populate({
          path: 'subOrders',
          populate: [
            { path: 'owner', select: 'profile.fullName profile.phone profile.address' },
            { path: 'products.product', select: 'name images price deposit category' }
          ]
        })
        .populate('renter', 'profile phone email');
    } catch (error) {
      console.error('❌ Error creating paid order:', error);
      throw new Error('Không thể tạo đơn thuê với thanh toán: ' + error.message);
    }
  }

  /**
   * Process payment for order based on payment method
   */
  async processPaymentForOrder(masterOrderId, paymentData) {
    const { method, amount, transactionId } = paymentData;

    try {
      switch (method) {
        case 'WALLET':
          return await this.processWalletPayment(masterOrderId, paymentData);

        case 'BANK_TRANSFER':
        case 'PAYOS':
          return await this.processPayOSPayment(masterOrderId, paymentData);

        case 'COD':
          return await this.processCODPayment(masterOrderId, paymentData);

        default:
          throw new Error(`Unsupported payment method: ${method}`);
      }
    } catch (error) {
      console.error(`❌ Payment processing failed for ${method}:`, error);
      // For wallet payment failures, we want to throw the error to stop order creation
      if (method === 'WALLET') {
        throw error;
      }

      // For other payment methods, return failed status
      return {
        transactionId: transactionId,
        method: method,
        amount: amount,
        status: 'FAILED',
        processedAt: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Process wallet payment - deduct from user wallet
   */
  async processWalletPayment(masterOrderId, paymentData) {
    const { transactionId, amount } = paymentData;

    try {
      // Get master order to find user
      const MasterOrder = require('../models/MasterOrder');
      const User = require('../models/User');
      const Wallet = require('../models/Wallet');

      const masterOrder = await MasterOrder.findById(masterOrderId).populate('renter');
      if (!masterOrder) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      const userId = masterOrder.renter._id;

      // Use SystemWalletService.transferFromUser to atomically move funds
      // from renter's wallet into the system wallet so later disbursement can occur.
      const transfer = await SystemWalletService.transferFromUser(
        process.env.SYSTEM_ADMIN_ID || null,
        userId,
        amount,
        `Payment for order ${masterOrder.masterOrderNumber}`
      );

      // transfer.transactions.user and transfer.userWallet are available
      const userTx = transfer?.transactions?.user || null;

      return {
        transactionId: userTx?._id || transactionId,
        method: 'WALLET',
        amount: amount,
        status: 'SUCCESS',
        processedAt: new Date(),
        paymentDetails: {
          newBalance: transfer?.userWallet?.newBalance || null,
          walletId: transfer?.userWallet?.walletId || null,
          transfer
        }
      };
    } catch (error) {
      console.error('❌ Wallet payment failed:', error.message);
      throw error; // Re-throw để createPaidOrderFromCart có thể xử lý
    }
  }

  /**
   * Process PayOS payment - bank transfer or QR code
   */
  async processPayOSPayment(masterOrderId, paymentData) {
    const { transactionId, amount, method } = paymentData;

    try {
      // Get master order to find user
      const masterOrder = await MasterOrder.findById(masterOrderId).populate('renter');
      if (!masterOrder) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      const userId = masterOrder.renter._id;
      const orderNumber = masterOrder.masterOrderNumber;

      // Generate unique order code for PayOS
      const orderCode = Date.now();

      // Create PayOS payment request
      const paymentRequest = {
        orderCode,
        amount: amount,
        description: `Thanh toan don hang ${orderNumber}`.substring(0, 25), // Max 25 chars
        returnUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rental-orders?payment=success&orderCode=${orderCode}&orderId=${masterOrderId}`,
        cancelUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rental-orders?payment=cancel&orderCode=${orderCode}&orderId=${masterOrderId}`
      };

      const paymentLink = await payos.paymentRequests.create(paymentRequest);

      // Get user's wallet if exists (optional for order payment)
      const user = await User.findById(userId).populate('wallet');
      const walletId = user?.wallet?._id || null;

      // Create transaction record
      const transaction = new Transaction({
        user: userId,
        wallet: walletId,
        type: 'order_payment',
        amount: amount,
        status: 'pending',
        paymentMethod: 'payos',
        externalId: orderCode.toString(),
        orderCode: orderCode.toString(),
        description: `Thanh toán đơn hàng ${orderNumber}`,
        paymentUrl: paymentLink.checkoutUrl,
        metadata: {
          masterOrderId: masterOrderId.toString(),
          orderNumber: orderNumber,
          paymentMethod: method,
          orderType: 'rental_order'
        },
        expiredAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      });

      await transaction.save();

      return {
        transactionId: transaction._id.toString(),
        orderCode: orderCode,
        method: method,
        amount: amount,
        status: 'PENDING', // Payment link created, waiting for user to pay
        processedAt: new Date(),
        paymentDetails: {
          paymentUrl: paymentLink.checkoutUrl,
          qrCode: paymentLink.qrCode || null,
          orderCode: orderCode,
          expiresAt: transaction.expiredAt,
          message: `Link thanh toán PayOS đã được tạo. Vui lòng hoàn tất thanh toán trong 15 phút.`
        }
      };
    } catch (error) {
      console.error('❌ PayOS payment failed:', error.message);
      throw new Error(`Không thể tạo link thanh toán PayOS: ${error.message}`);
    }
  }

  /**
   * Process COD payment - cash on delivery with deposit
   */
  async processCODPayment(masterOrderId, paymentData) {
    const { transactionId, amount, depositAmount, depositPaymentMethod, depositTransactionId } =
      paymentData;

    try {
      // Validate required parameters
      if (!amount || amount <= 0) {
        throw new Error('Valid total amount is required for COD payment');
      }

      // Validate deposit amount by recalculating from cart
      const masterOrder = await MasterOrder.findById(masterOrderId);
      if (!masterOrder) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      const cartDepositInfo = await this.calculateDepositFromCart(masterOrder.renter);
      if (Math.abs(cartDepositInfo.totalDeposit - depositAmount) > 1) {
        throw new Error(
          `Số tiền cọc không đúng. Yêu cầu: ${cartDepositInfo.totalDeposit.toLocaleString('vi-VN')}đ, Nhận được: ${depositAmount.toLocaleString('vi-VN')}đ`
        );
      }

      if (!depositAmount || depositAmount <= 0) {
        throw new Error('Đơn hàng COD yêu cầu phải thanh toán cọc');
      }

      if (
        !depositPaymentMethod ||
        !['WALLET', 'PAYOS', 'BANK_TRANSFER'].includes(depositPaymentMethod)
      ) {
        throw new Error(
          'Phương thức thanh toán cọc không hợp lệ. Phải là WALLET, PAYOS hoặc BANK_TRANSFER'
        );
      }

      console.log(`💰 Processing COD deposit via ${depositPaymentMethod}:`, {
        depositAmount,
        totalAmount: amount,
        masterOrderId
      });

      // Process deposit payment immediately
      const depositPaymentData = {
        transactionId:
          depositTransactionId || `DEP_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        amount: depositAmount,
        method: depositPaymentMethod
      };

      let depositResult;
      if (depositPaymentMethod === 'WALLET') {
        // Xử lý thanh toán cọc qua ví - trừ tiền ngay
        depositResult = await this.processWalletPayment(masterOrderId, depositPaymentData);

        // Wallet payment phải SUCCESS ngay
        if (depositResult.status !== 'SUCCESS') {
          throw new Error(
            'Thanh toán cọc qua ví thất bại: ' + (depositResult.error || 'Số dư không đủ')
          );
        }
      } else {
        // Xử lý thanh toán cọc qua PayOS - tạo payment link
        depositResult = await this.processPayOSPayment(masterOrderId, depositPaymentData);

        // PayOS trả về PENDING, user cần hoàn tất thanh toán
        // Không throw error ở đây, để user có thời gian thanh toán
        if (depositResult.status === 'PENDING') {
          console.log(
            '⏳ PayOS deposit payment link created, waiting for user to complete payment'
          );
        }
      }

      const remainingAmount = amount - depositAmount;
      const isDepositPaid = depositResult.status === 'SUCCESS';

      return {
        transactionId: transactionId || `COD_${Date.now()}`,
        method: 'COD',
        amount: amount,
        depositAmount: depositAmount,
        remainingAmount: remainingAmount,
        status: isDepositPaid ? 'PARTIALLY_PAID' : 'PENDING', // PARTIALLY_PAID if deposit paid, PENDING if waiting for PayOS
        processedAt: new Date(),
        paymentDetails: {
          message: isDepositPaid
            ? `Đã thanh toán cọc ${depositAmount.toLocaleString('vi-VN')}đ bằng ${depositPaymentMethod}. Còn lại ${remainingAmount.toLocaleString('vi-VN')}đ thanh toán khi nhận hàng`
            : `Đang chờ thanh toán cọc ${depositAmount.toLocaleString('vi-VN')}đ qua ${depositPaymentMethod}. Còn lại ${remainingAmount.toLocaleString('vi-VN')}đ thanh toán khi nhận hàng`,
          depositPaid: isDepositPaid,
          depositPaymentMethod: depositPaymentMethod,
          depositTransactionId: depositResult.transactionId,
          depositOrderCode: depositResult.orderCode || null,
          depositPaymentUrl: depositResult.paymentDetails?.paymentUrl || null,
          depositPaymentDetails: depositResult.paymentDetails,
          note: isDepositPaid
            ? 'Khách hàng đã thanh toán cọc thành công, thanh toán phần còn lại khi nhận hàng'
            : 'Đang chờ khách hàng hoàn tất thanh toán cọc qua PayOS'
        }
      };
    } catch (error) {
      console.error('❌ COD payment processing failed:', error.message);
      throw error;
    }
  }

  /**
   * Process refund when order is rejected by owner
   */
  async processRefundForRejectedOrder(masterOrderId, subOrderId, rejectionReason) {
    try {
      const masterOrder = await MasterOrder.findById(masterOrderId).populate([
        'renter',
        { path: 'subOrders', populate: { path: 'products.product' } }
      ]);

      if (!masterOrder) {
        throw new Error('Không tìm thấy đơn hàng để hoàn tiền');
      }

      // Check if all suborders are rejected
      const allSubOrdersRejected = await SubOrder.find({
        masterOrder: masterOrderId,
        status: { $ne: 'OWNER_REJECTED' }
      });

      if (allSubOrdersRejected.length === 0) {
        // All suborders rejected - full refund

        const refundAmount = masterOrder.paymentInfo?.amount || masterOrder.totalAmount || 0;

        // Mock refund processing - in real app, integrate with payment/wallet service
        const refundResult = {
          refundId: `REF_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          amount: refundAmount,
          method: masterOrder.paymentMethod,
          status: 'SUCCESS',
          processedAt: new Date(),
          reason: 'Owner rejected all orders'
        };

        // Update master order status
        masterOrder.status = 'REFUNDED';
        masterOrder.refundInfo = refundResult;
        await masterOrder.save();
      } else {
        // Partial refund for specific suborder

        const rejectedSubOrder = await SubOrder.findById(subOrderId).populate('products.product');
        let partialRefundAmount = 0;

        // Calculate refund amount for rejected suborder
        rejectedSubOrder.products.forEach((item) => {
          const product = item.product;
          const rental = (product.pricing?.dailyRate || product.price || 0) * item.quantity;
          const deposit =
            (product.pricing?.deposit?.amount || product.deposit || 0) * item.quantity;
          partialRefundAmount += rental + deposit;
        });

        // Add shipping cost
        if (rejectedSubOrder.shipping?.fee) {
          partialRefundAmount += rejectedSubOrder.shipping.fee;
        }

        const refundResult = {
          refundId: `REF_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          amount: partialRefundAmount,
          method: masterOrder.paymentMethod,
          status: 'SUCCESS',
          processedAt: new Date(),
          reason: `Owner rejected suborder: ${rejectionReason}`
        };

        // Add to refund history
        if (!masterOrder.refundHistory) {
          masterOrder.refundHistory = [];
        }
        masterOrder.refundHistory.push(refundResult);
        await masterOrder.save();
      }
    } catch (error) {
      console.error('❌ Error processing refund:', error);
      throw new Error('Không thể xử lý hoàn tiền: ' + error.message);
    }
  }

  /**
   * Bước 2: Xác nhận đơn hàng và chuyển sang chờ thanh toán
   */
  async confirmOrder(masterOrderId, renterId) {
    const masterOrder = await MasterOrder.findOne({
      _id: masterOrderId,
      renter: renterId,
      status: 'DRAFT'
    }).populate('subOrders');

    if (!masterOrder) {
      throw new Error('Không tìm thấy đơn hàng hoặc đơn hàng không hợp lệ');
    }

    // Kiểm tra lại tính khả dụng của sản phẩm
    for (const subOrder of masterOrder.subOrders) {
      const subOrderDoc = await SubOrder.findById(subOrder._id).populate('products.product');
      await this.validateProductAvailability(
        subOrderDoc.products.map((p) => ({ product: p.product, quantity: p.quantity })),
        masterOrder.rentalPeriod
      );
    }

    // Cập nhật trạng thái
    masterOrder.status = 'PENDING_PAYMENT';
    await masterOrder.save();

    return masterOrder;
  }

  /**
   * Bước 3: Xử lý thanh toán
   */
  async processPayment(masterOrderId, paymentData) {
    const masterOrder = await MasterOrder.findOne({
      _id: masterOrderId,
      status: 'PENDING_PAYMENT'
    }).populate('subOrders');

    if (!masterOrder) {
      throw new Error('Không tìm thấy đơn hàng hoặc trạng thái không hợp lệ');
    }

    // Xử lý thanh toán (tích hợp với payment service)
    // Ở đây chúng ta giả sử thanh toán thành công
    masterOrder.paymentStatus = 'PAID';
    masterOrder.paymentMethod = paymentData.method;
    masterOrder.paymentInfo = {
      transactionId: paymentData.transactionId,
      paymentDate: new Date(),
      paymentDetails: paymentData
    };
    masterOrder.status = 'PENDING_CONFIRMATION';

    // Cập nhật tất cả SubOrder
    await SubOrder.updateMany(
      { masterOrder: masterOrderId },
      { status: 'PENDING_OWNER_CONFIRMATION' }
    );

    await masterOrder.save();

    // Xóa giỏ hàng sau khi thanh toán thành công
    await Cart.findOneAndUpdate({ user: masterOrder.renter }, { $set: { items: [] } });

    return masterOrder;
  }

  /**
   * Bước 4: Chủ xác nhận đơn hàng
   */
  async ownerConfirmOrder(subOrderId, ownerId, confirmationData) {
    const subOrder = await SubOrder.findOne({
      _id: subOrderId,
      owner: ownerId,
      status: 'PENDING_OWNER_CONFIRMATION'
    }).populate('masterOrder');

    if (!subOrder) {
      throw new Error('Không tìm thấy đơn hàng hoặc không có quyền xác nhận');
    }

    const { status, notes, rejectionReason } = confirmationData;

    if (status === 'CONFIRMED') {
      subOrder.ownerConfirmation = {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        notes
      };
      subOrder.status = 'OWNER_CONFIRMED';

      // Auto-generate contract when owner confirms
      await subOrder.save();
      await this.generateContractForSubOrder(subOrderId);
    } else if (status === 'REJECTED') {
      subOrder.ownerConfirmation = {
        status: 'OWNER_REJECTED',
        rejectedAt: new Date(),
        rejectionReason,
        notes
      };
      subOrder.status = 'OWNER_REJECTED';

      await subOrder.save();

      // Process refund for rejected order
      await this.processRefundForRejectedOrder(
        subOrder.masterOrder._id,
        subOrderId,
        rejectionReason
      );
    } else {
      await subOrder.save();
    }

    // Kiểm tra tất cả SubOrder đã được xác nhận chưa
    await this.checkAllSubOrdersConfirmed(subOrder.masterOrder._id);

    return subOrder;
  }

  /**
   * Bước 5: Tạo hợp đồng điện tử
   */
  async generateContract(masterOrderId) {
    // First, check if MasterOrder exists at all (without status filter)
    let existingOrder = await MasterOrder.findById(masterOrderId).populate('subOrders');

    let masterOrder = await MasterOrder.findOne({
      _id: masterOrderId,
      status: { $in: ['DRAFT', 'PENDING_CONFIRMATION', 'READY_FOR_CONTRACT'] }
    }).populate([
      { path: 'renter', select: 'profile email' },
      {
        path: 'subOrders',
        populate: [{ path: 'owner', select: 'profile email' }, { path: 'products.product' }]
      }
    ]);

    if (!masterOrder) {
      throw new Error('Đơn hàng không hợp lệ để tạo hợp đồng');
    }

    // Check if all SubOrders are confirmed
    const allConfirmed = masterOrder.subOrders.every(
      (subOrder) => subOrder.status === 'OWNER_CONFIRMED'
    );

    if (!allConfirmed) {
      const unconfirmedCount = masterOrder.subOrders.filter(
        (so) => so.status !== 'OWNER_CONFIRMED'
      ).length;
      const confirmedCount = masterOrder.subOrders.filter(
        (so) => so.status === 'OWNER_CONFIRMED'
      ).length;
      throw new Error(
        `Chưa có đủ xác nhận từ tất cả chủ cho thuê. Đã xác nhận: ${confirmedCount}/${masterOrder.subOrders.length}`
      );
    }

    // Update MasterOrder status if needed
    if (masterOrder.status === 'PENDING_CONFIRMATION') {
      masterOrder.status = 'READY_FOR_CONTRACT';
      await masterOrder.save();
    }

    const contracts = [];

    // Tạo hợp đồng cho từng SubOrder
    for (const subOrder of masterOrder.subOrders) {
      if (subOrder.status !== 'OWNER_CONFIRMED') continue;

      const contractNumber = `CT${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const totalAmount = subOrder.pricing.subtotalRental + subOrder.pricing.subtotalDeposit;

      const contract = new Contract({
        contractNumber,
        order: subOrder._id, // Liên kết với SubOrder
        owner: subOrder.owner._id,
        renter: masterOrder.renter._id,
        product: subOrder.products[0].product._id, // Sản phẩm chính
        terms: {
          startDate: masterOrder.rentalPeriod.startDate,
          endDate: masterOrder.rentalPeriod.endDate,
          rentalRate: subOrder.pricing.subtotalRental,
          deposit: subOrder.pricing.subtotalDeposit,
          totalAmount
        },
        status: 'PENDING_SIGNATURE'
      });

      await contract.save();

      // Cập nhật SubOrder
      subOrder.contract = contract._id;
      subOrder.status = 'READY_FOR_CONTRACT';
      await subOrder.save();

      contracts.push(contract);
    }

    return contracts;
  }

  /**
   * Ký hợp đồng điện tử
   */
  async signContract(contractId, userId, signatureData) {
    const contract = await Contract.findById(contractId).populate('owner renter');

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Kiểm tra quyền ký
    const isOwner = contract.owner._id.toString() === userId;
    const isRenter = contract.renter._id.toString() === userId;

    if (!isOwner && !isRenter) {
      throw new Error('Không có quyền ký hợp đồng này');
    }

    // Kiểm tra luồng ký đúng: Owner phải ký trước
    if (isRenter && !contract.signatures.owner.signed) {
      throw new Error('Chủ đồ phải ký hợp đồng trước');
    }

    // Kiểm tra đã ký chưa
    if (isOwner && contract.signatures.owner.signed) {
      throw new Error('Bạn đã ký hợp đồng này rồi');
    }
    if (isRenter && contract.signatures.renter.signed) {
      throw new Error('Bạn đã ký hợp đồng này rồi');
    }

    // Cập nhật chữ ký
    if (isOwner) {
      contract.signatures.owner = {
        signed: true,
        signedAt: new Date(),
        signature: signatureData.signature,
        ipAddress: signatureData.ipAddress,
        userAgent: signatureData.userAgent
      };
      // Owner ký xong → chuyển sang PENDING_RENTER
      contract.status = 'PENDING_RENTER';
      console.log('✅ Owner đã ký hợp đồng, chuyển sang PENDING_RENTER');
    }

    if (isRenter) {
      contract.signatures.renter = {
        signed: true,
        signedAt: new Date(),
        signature: signatureData.signature,
        ipAddress: signatureData.ipAddress,
        userAgent: signatureData.userAgent
      };
      // Renter ký xong → Hoàn thành
      contract.status = 'SIGNED';
      contract.signedAt = new Date();
      console.log('✅ Renter đã ký hợp đồng, hợp đồng hoàn tất');

      // Cập nhật SubOrder
      await SubOrder.findOneAndUpdate({ contract: contractId }, { status: 'CONTRACT_SIGNED' });

      // Kiểm tra tất cả hợp đồng đã ký chưa
      const masterOrderId = await this.getMasterOrderIdFromContract(contractId);
      await this.checkAllContractsSigned(masterOrderId);
    }

    await contract.save();
    return contract;
  }

  // Utility methods

  /**
   * 💰 Calculate total deposit amount from Cart items (before order creation)
   */
  async calculateDepositFromCart(renterId) {
    try {
      const Cart = require('../models/Cart');
      const cart = await Cart.findOne({ user: renterId }).populate({
        path: 'items.product',
        select: 'title pricing'
      });

      if (!cart || cart.items.length === 0) {
        throw new Error('Cart is empty for deposit calculation');
      }

      let totalDeposit = 0;
      const depositBreakdown = [];

      for (const item of cart.items) {
        const product = item.product;
        if (!product || !product.pricing) {
          console.warn(`Product ${product?._id} missing pricing info`);
          continue;
        }

        const depositPerUnit = product.pricing.deposit?.amount || 0;
        const productDeposit = depositPerUnit * item.quantity;

        totalDeposit += productDeposit;

        depositBreakdown.push({
          productId: product._id,
          productName: product.title,
          quantity: item.quantity,
          depositPerUnit: depositPerUnit,
          totalDeposit: productDeposit
        });
      }

      return {
        totalDeposit,
        breakdown: depositBreakdown
      };
    } catch (error) {
      console.error('❌ Error calculating deposit from cart:', error);
      throw error;
    }
  }

  /**
   * 💰 Get total deposit from existing SubOrders (after order creation)
   */
  async getDepositFromSubOrders(masterOrderId) {
    try {
      const MasterOrder = require('../models/MasterOrder');
      const masterOrder = await MasterOrder.findById(masterOrderId).populate({
        path: 'subOrders',
        populate: {
          path: 'products.product',
          select: 'title name'
        }
      });

      if (!masterOrder) {
        throw new Error('Master order not found');
      }

      let totalDeposit = 0;
      const depositBreakdown = [];

      for (const subOrder of masterOrder.subOrders) {
        for (const productItem of subOrder.products) {
          const productDeposit = productItem.totalDeposit || 0;
          totalDeposit += productDeposit;

          depositBreakdown.push({
            subOrderId: subOrder._id,
            productId: productItem.product._id,
            productName: productItem.product.title || productItem.product.name,
            quantity: productItem.quantity,
            depositPerUnit: productItem.depositRate || 0,
            totalDeposit: productDeposit,
            confirmationStatus: productItem.confirmationStatus || 'PENDING'
          });
        }
      }

      return { totalDeposit, breakdown: depositBreakdown };
    } catch (error) {
      console.error('❌ Error getting deposit from SubOrders:', error);
      throw error;
    }
  }

  async validateProductAvailability(cartItems, rentalPeriod) {
    for (const item of cartItems) {
      const product = await Product.findById(item.product._id || item.product);

      if (!product) {
        throw new Error(`Sản phẩm không tồn tại`);
      }

      if (product.status !== 'ACTIVE') {
        throw new Error(`Sản phẩm ${product.name} không khả dụng`);
      }

      if (product.quantity < item.quantity) {
        throw new Error(`Sản phẩm ${product.name} không đủ số lượng`);
      }

      // Kiểm tra xem sản phẩm có bị thuê trong khoảng thời gian này không
      const existingOrders = await SubOrder.find({
        'products.product': product._id,
        status: { $in: ['ACTIVE', 'CONTRACT_SIGNED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
        $or: [
          {
            'rentalPeriod.startDate': {
              $lte: rentalPeriod.endDate
            },
            'rentalPeriod.endDate': {
              $gte: rentalPeriod.startDate
            }
          }
        ]
      });

      if (existingOrders.length > 0) {
        throw new Error(`Sản phẩm ${product.name} đã được thuê trong thời gian này`);
      }
    }
  }

  groupProductsByOwner(cartItems) {
    const grouped = {};

    cartItems.forEach((item) => {
      const ownerId = item.product.owner._id.toString();
      if (!grouped[ownerId]) {
        grouped[ownerId] = [];
      }
      grouped[ownerId].push(item);
    });

    return grouped;
  }

  async calculateProductPricing(products) {
    return products.map((item, index) => {
      const product = item.product;
      const quantity = item.quantity;

      // Sử dụng rental period từ cart item - KHÔNG fallback về master period
      if (!item.rental || !item.rental.startDate || !item.rental.endDate) {
        console.error('❌ Cart item missing rental period:', item);
        throw new Error('Cart item thiếu thông tin thời gian thuê');
      }

      const itemRentalPeriod = item.rental;
      const startDate = new Date(itemRentalPeriod.startDate);
      const endDate = new Date(itemRentalPeriod.endDate);
      const durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // Try multiple ways to get pricing
      const dailyRate =
        product.price || product.pricing?.dailyRate || product.pricing?.rentalPrice || 0;

      const depositRate =
        product.deposit || product.pricing?.deposit?.amount || product.pricing?.depositAmount || 0;

      const totalRental = dailyRate * durationDays * quantity;
      const totalDeposit = depositRate * quantity;

      // Validation to prevent NaN
      if (isNaN(dailyRate) || dailyRate < 0) {
        throw new Error(`Invalid daily rate for product ${product._id}: ${dailyRate}`);
      }
      if (isNaN(depositRate) || depositRate < 0) {
        throw new Error(`Invalid deposit rate for product ${product._id}: ${depositRate}`);
      }
      if (isNaN(totalRental) || totalRental < 0) {
        throw new Error(`Invalid total rental for product ${product._id}: ${totalRental}`);
      }
      if (isNaN(totalDeposit) || totalDeposit < 0) {
        throw new Error(`Invalid total deposit for product ${product._id}: ${totalDeposit}`);
      }

      return {
        product: product._id,
        quantity,
        rentalRate: dailyRate,
        depositRate,
        // Thêm rental period riêng cho từng item
        rentalPeriod: {
          startDate: itemRentalPeriod.startDate,
          endDate: itemRentalPeriod.endDate,
          duration: {
            value: durationDays,
            unit: 'DAY'
          }
        },
        // Mặc định tất cả items đều PENDING khi tạo order
        confirmationStatus: 'PENDING',
        totalRental,
        totalDeposit
      };
    });
  }

  async calculateShippingFee(ownerAddress, deliveryAddress) {
    try {
      // Kiểm tra tọa độ của chủ và người thuê
      let ownerLat = ownerAddress.latitude;
      let ownerLon = ownerAddress.longitude;
      let userLat = deliveryAddress.latitude;
      let userLon = deliveryAddress.longitude;

      // Nếu chưa có tọa độ, thử geocode địa chỉ
      if (!ownerLat || !ownerLon) {
        const ownerGeocode = await VietMapService.geocodeAddress(
          `${ownerAddress.streetAddress}, ${ownerAddress.ward}, ${ownerAddress.district}, ${ownerAddress.city}`
        );
        if (ownerGeocode.success) {
          ownerLat = ownerGeocode.latitude;
          ownerLon = ownerGeocode.longitude;
        }
      }

      if (!userLat || !userLon) {
        const userGeocode = await VietMapService.geocodeAddress(
          `${deliveryAddress.streetAddress}, ${deliveryAddress.ward}, ${deliveryAddress.district}, ${deliveryAddress.city}`
        );
        if (userGeocode.success) {
          userLat = userGeocode.latitude;
          userLon = userGeocode.longitude;
        }
      }

      // Fallback mechanism: sử dụng tọa độ mặc định nếu geocoding thất bại
      if (!ownerLat || !ownerLon || !userLat || !userLon) {
        // Fallback coordinates cho các thành phố lớn
        const fallbackCoords = {
          'Hồ Chí Minh': { lat: 10.8231, lon: 106.6297 },
          'Hà Nội': { lat: 21.0285, lon: 105.8542 },
          'Đà Nẵng': { lat: 16.0471, lon: 108.2068 },
          'Cần Thơ': { lat: 10.0452, lon: 105.7469 }
        };

        // Sử dụng fallback cho owner
        if (!ownerLat || !ownerLon) {
          const ownerCity = ownerAddress.city || 'Hồ Chí Minh';
          const fallback = fallbackCoords[ownerCity] || fallbackCoords['Hồ Chí Minh'];
          ownerLat = fallback.lat;
          ownerLon = fallback.lon;
        }

        // Sử dụng fallback cho user
        if (!userLat || !userLon) {
          const userCity = deliveryAddress.city || deliveryAddress.province || 'Hồ Chí Minh';
          const fallback = fallbackCoords[userCity] || fallbackCoords['Hồ Chí Minh'];
          userLat = fallback.lat;
          userLon = fallback.lon;
        }
      }

      // Tính khoảng cách
      const distanceResult = await VietMapService.calculateDistance(
        ownerLon,
        ownerLat,
        userLon,
        userLat
      );

      // Nếu VietMap API thất bại, sử dụng công thức haversine đơn giản
      if (!distanceResult.success && !distanceResult.fallback) {
        // Công thức Haversine đơn giản
        const R = 6371; // Bán kính Trái đất (km)
        const dLat = ((userLat - ownerLat) * Math.PI) / 180;
        const dLon = ((userLon - ownerLon) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((ownerLat * Math.PI) / 180) *
            Math.cos((userLat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const fallbackDistance = R * c;

        distanceResult.distanceKm = Math.round(fallbackDistance * 100) / 100;
        distanceResult.duration = Math.round(fallbackDistance * 3); // Ước tính 3 phút/km
        distanceResult.success = true;
        distanceResult.fallback = true;
      }

      // Tính phí ship
      const shippingFee = VietMapService.calculateShippingFee(distanceResult.distanceKm);

      return {
        distance: distanceResult.distanceKm,
        estimatedTime: distanceResult.duration,
        fee: shippingFee,
        calculatedFee: shippingFee.calculatedFee, // For backward compatibility
        vietmapResponse: distanceResult,
        success: true
      };
    } catch (error) {
      console.error('Lỗi tính phí ship:', error);

      // Fallback: phí cố định
      return {
        distance: 0,
        estimatedTime: 0,
        fee: {
          baseFee: 15000,
          pricePerKm: 0,
          distance: 0,
          calculatedFee: 15000,
          breakdown: {
            base: 15000,
            distance: 0,
            total: 15000
          }
        },
        error: error.message
      };
    }
  }

  async checkAllSubOrdersConfirmed(masterOrderId) {
    const subOrders = await SubOrder.find({ masterOrder: masterOrderId });

    const allConfirmed = subOrders.every(
      (so) => so.status === 'OWNER_CONFIRMED' || so.status === 'OWNER_REJECTED'
    );

    if (allConfirmed) {
      const hasRejected = subOrders.some((so) => so.status === 'OWNER_REJECTED');

      if (hasRejected) {
        await MasterOrder.findByIdAndUpdate(masterOrderId, {
          status: 'CANCELLED'
        });
      } else {
        await MasterOrder.findByIdAndUpdate(masterOrderId, {
          status: 'READY_FOR_CONTRACT'
        });
      }
    }
  }

  async checkAllContractsSigned(masterOrderId) {
    try {
      if (!masterOrderId) {
        console.warn('⚠️ checkAllContractsSigned: masterOrderId is null or undefined');
        return;
      }

      const subOrders = await SubOrder.find({ masterOrder: masterOrderId });
      console.log(`📋 checkAllContractsSigned: Found ${subOrders.length} subOrders for master order ${masterOrderId}`);

      if (subOrders.length === 0) {
        console.warn('⚠️ No subOrders found for master order');
        return;
      }

      const allSigned = subOrders.every((so) => so.status === 'CONTRACT_SIGNED');
      console.log(`   Status breakdown: ${subOrders.map(so => so.status).join(', ')}`);
      console.log(`   All signed? ${allSigned}`);

      if (allSigned) {
        // Update master order status
        await MasterOrder.findByIdAndUpdate(masterOrderId, {
          status: 'CONTRACT_SIGNED'
        });
        console.log(`✅ Master Order status updated to CONTRACT_SIGNED`);

        // 📦 Create both DELIVERY and RETURN shipments when all contracts are signed
        const ShipmentService = require('./shipment.service');
        try {
          console.log(`\n🚀 Auto-creating shipments...`);
          const shipmentResult = await ShipmentService.createDeliveryAndReturnShipments(masterOrderId);
          console.log(`✅ Shipments created successfully:`, {
            pairs: shipmentResult.pairs,
            totalCount: shipmentResult.count
          });
        } catch (err) {
          console.error('❌ CRITICAL ERROR creating shipments after contract signing:');
          console.error('   Error message:', err.message);
          console.error('   Error type:', err.constructor.name);
          if (err.stack) {
            console.error('   Stack trace:', err.stack);
          }
          // Don't throw - order is already in CONTRACT_SIGNED status
          // Shipments can be created manually if needed
          return {
            success: false,
            error: err.message,
            masterOrderId: masterOrderId
          };
        }
      }
    } catch (error) {
      console.error('❌ Error in checkAllContractsSigned:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
  }

  async getMasterOrderIdFromContract(contractId) {
    const subOrder = await SubOrder.findOne({ contract: contractId });
    return subOrder ? subOrder.masterOrder : null;
  }

  // OLD METHOD REMOVED - using new async calculateProductPricing method

  /**
   * Group products by owner
   */
  groupProductsByOwner(cartItems) {
    const grouped = {};

    cartItems.forEach((item) => {
      const ownerId = item.product.owner._id || item.product.owner;
      if (!grouped[ownerId]) {
        grouped[ownerId] = [];
      }
      grouped[ownerId].push(item);
    });

    console.log(`👥 Grouped products by ${Object.keys(grouped).length} owners`);
    return grouped;
  }

  /**
   * Lấy danh sách SubOrder cho chủ sản phẩm
   */
  async getSubOrdersByOwner(ownerId, options = {}) {
    console.log('🔍 Getting SubOrders for owner:', ownerId);

    try {
      const { status, page = 1, limit = 10 } = options;
      const skip = (page - 1) * limit;

      // Build query
      const query = { owner: ownerId };
      if (status && status !== 'ALL') {
        query.status = status;
      }

      console.log('📊 Query:', query);

      const subOrders = await SubOrder.find(query)
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.firstName profile.lastName phone email'
          }
        })
        .populate({
          path: 'products.product',
          select: 'name images pricing availability'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await SubOrder.countDocuments(query);

      console.log(`✅ Found ${subOrders.length} SubOrders`);

      return {
        data: subOrders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('❌ Error getting SubOrders:', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách sản phẩm đang được thuê (active rentals) cho chủ sản phẩm
   */
  async getActiveRentalsByOwner(ownerId, options = {}) {
    console.log('🔍 Getting active rentals for owner:', ownerId);

    try {
      const { page = 1, limit = 20 } = options;
      const skip = (page - 1) * limit;

      // Query for SubOrders that are currently in active rental state
      const query = {
        owner: ownerId,
        status: { $in: ['ACTIVE', 'DELIVERED', 'PROCESSING', 'SHIPPED'] }
      };

      console.log('📊 Active rentals query:', query);

      const subOrders = await SubOrder.find(query)
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.firstName profile.lastName phone email'
          }
        })
        .populate({
          path: 'products.product',
          select: 'name title images pricing price deposit'
        })
        .sort({ 'products.rentalPeriod.endDate': 1 }) // Sort by end date (earliest first)
        .skip(skip)
        .limit(limit);

      const total = await SubOrder.countDocuments(query);

      // Process data to flatten products with rental information
      const activeRentals = [];

      subOrders.forEach((subOrder) => {
        subOrder.products.forEach((productItem) => {
          if (productItem.rentalPeriod && productItem.rentalPeriod.endDate) {
            const endDate = new Date(productItem.rentalPeriod.endDate);
            const now = new Date();
            const timeDiff = endDate - now;
            const daysUntilReturn = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

            activeRentals.push({
              subOrderId: subOrder._id,
              subOrderNumber: subOrder.subOrderNumber,
              status: subOrder.status,
              product: productItem.product,
              quantity: productItem.quantity,
              rentalPeriod: productItem.rentalPeriod,
              startDate: productItem.rentalPeriod.startDate,
              endDate: productItem.rentalPeriod.endDate,
              daysUntilReturn,
              isReturningsoon: daysUntilReturn <= 1 && daysUntilReturn >= 0,
              isOverdue: daysUntilReturn < 0,
              renter: subOrder.masterOrder?.renter,
              totalRental: productItem.totalRental,
              totalDeposit: productItem.totalDeposit,
              masterOrderNumber: subOrder.masterOrder?.masterOrderNumber,
              createdAt: subOrder.createdAt
            });
          }
        });
      });

      // Sort by days until return (ascending)
      activeRentals.sort((a, b) => a.daysUntilReturn - b.daysUntilReturn);

      console.log(
        `✅ Found ${activeRentals.length} active rentals from ${subOrders.length} SubOrders`
      );

      return {
        data: activeRentals,
        pagination: {
          page,
          limit,
          total: activeRentals.length,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('❌ Error getting active rentals:', error);
      throw error;
    }
  }

  /**
   * Xác nhận SubOrder
   */
  async confirmSubOrder(subOrderId, ownerId) {
    console.log('✅ Confirming SubOrder:', subOrderId, 'by owner:', ownerId);

    try {
      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId,
        status: 'PENDING_CONFIRMATION'
      });

      if (!subOrder) {
        throw new Error('Không tìm thấy yêu cầu thuê hoặc yêu cầu đã được xử lý');
      }

      subOrder.status = 'OWNER_CONFIRMED';
      subOrder.confirmedAt = new Date();
      await subOrder.save();

      console.log('✅ SubOrder confirmed successfully');

      // Auto-generate contract for this SubOrder
      await this.generateContractForSubOrder(subOrder);

      console.log('✅ Contract generated for confirmed SubOrder');

      // Check if all SubOrders in the MasterOrder are confirmed
      await this.checkAllSubOrdersConfirmed(subOrder.masterOrder);

      console.log('✅ Checked MasterOrder status update');

      // Populate và trả về
      return await SubOrder.findById(subOrderId)
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.firstName profile.lastName phone email'
          }
        })
        .populate({
          path: 'products.product',
          select: 'name images rentalPrice depositPercentage'
        });
    } catch (error) {
      console.error('❌ Error confirming SubOrder:', error);
      throw error;
    }
  }

  /**
   * Từ chối SubOrder
   */
  async rejectSubOrder(subOrderId, ownerId, reason) {
    console.log('❌ Rejecting SubOrder:', subOrderId, 'by owner:', ownerId);

    try {
      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId,
        status: 'DRAFT'
      });

      if (!subOrder) {
        throw new Error('Không tìm thấy yêu cầu thuê hoặc yêu cầu đã được xử lý');
      }

      subOrder.status = 'OWNER_REJECTED';
      subOrder.rejectedAt = new Date();
      subOrder.rejectionReason = reason;
      await subOrder.save();

      console.log('❌ SubOrder rejected successfully');

      // Populate và trả về
      return await SubOrder.findById(subOrderId)
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.firstName profile.lastName phone email'
          }
        })
        .populate({
          path: 'products.product',
          select: 'name images rentalPrice depositPercentage'
        });
    } catch (error) {
      console.error('❌ Error rejecting SubOrder:', error);
      throw error;
    }
  }

  /**
   * Kiểm tra và cập nhật trạng thái MasterOrder nếu tất cả SubOrders đã được xác nhận
   */
  async checkAllSubOrdersConfirmed(masterOrderId) {
    try {
      const masterOrder = await MasterOrder.findById(masterOrderId).populate('subOrders');

      if (!masterOrder) {
        throw new Error('Không tìm thấy MasterOrder');
      }

      // Check if all SubOrders are confirmed
      const allConfirmed = masterOrder.subOrders.every(
        (subOrder) => subOrder.status === 'OWNER_CONFIRMED'
      );

      if (allConfirmed && masterOrder.status === 'PENDING_CONFIRMATION') {
        masterOrder.status = 'READY_FOR_CONTRACT';
        await masterOrder.save();
        console.log('✅ MasterOrder status updated to READY_FOR_CONTRACT');
      }

      return masterOrder;
    } catch (error) {
      console.error('❌ Error checking SubOrders status:', error);
      throw error;
    }
  }

  /**
   * Tự động tạo contract cho SubOrder đã được confirm
   */
  async generateContractForSubOrder(subOrder) {
    try {
      // Populate MasterOrder để lấy thông tin cần thiết
      const populatedSubOrder = await SubOrder.findById(subOrder._id)
        .populate({
          path: 'masterOrder',
          populate: { path: 'renter', select: 'profile email' }
        })
        .populate('owner products.product');

      if (!populatedSubOrder) {
        throw new Error('Không tìm thấy SubOrder');
      }

      // Generate contract number và calculate total amount
      const contractNumber = `CT${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const totalAmount =
        populatedSubOrder.pricing.subtotalRental + populatedSubOrder.pricing.subtotalDeposit;

      // Create contract
      const contract = new Contract({
        contractNumber,
        order: populatedSubOrder._id,
        owner: populatedSubOrder.owner._id,
        renter: populatedSubOrder.masterOrder.renter._id,
        product: populatedSubOrder.products[0].product._id,
        terms: {
          startDate: populatedSubOrder.masterOrder.rentalPeriod.startDate,
          endDate: populatedSubOrder.masterOrder.rentalPeriod.endDate,
          rentalRate: populatedSubOrder.pricing.subtotalRental,
          deposit: populatedSubOrder.pricing.subtotalDeposit,
          totalAmount
        },
        status: 'PENDING_SIGNATURE'
      });

      await contract.save();

      // Update SubOrder với contract reference
      populatedSubOrder.contract = contract._id;
      await populatedSubOrder.save();

      console.log('✅ Contract created for SubOrder:', contract.contractNumber);
      return contract;
    } catch (error) {
      console.error('❌ Error generating contract for SubOrder:', error);
      throw error;
    }
  }

  /**
   * Cập nhật phương thức thanh toán cho MasterOrder
   */
  async updatePaymentMethod(masterOrderId, paymentMethod) {
    console.log('💳 Updating payment method for MasterOrder:', masterOrderId, 'to:', paymentMethod);

    try {
      const masterOrder = await MasterOrder.findById(masterOrderId);

      if (!masterOrder) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      // Validate payment method
      const validMethods = ['WALLET', 'BANK_TRANSFER', 'PAYOS'];
      if (!validMethods.includes(paymentMethod)) {
        throw new Error('Phương thức thanh toán không hợp lệ');
      }

      masterOrder.paymentMethod = paymentMethod;
      await masterOrder.save();

      console.log('✅ Payment method updated successfully');

      return masterOrder;
    } catch (error) {
      console.error('❌ Error updating payment method:', error);
      throw error;
    }
  }

  /**
   * Tính phí shipping cho từng product trong danh sách
   * @param {Array} products - Danh sách products với quantity
   * @param {Object} ownerLocation - Tọa độ owner {latitude, longitude}
   * @param {Object} userLocation - Tọa độ user {latitude, longitude}
   * @returns {Promise<Object>} - Chi tiết phí shipping per product
   */
  async calculateProductShippingFees(products, ownerLocation, userLocation) {
    console.log('🚚 Calculating shipping fees for products:', {
      productsCount: products.length,
      ownerLocation,
      userLocation
    });

    try {
      // Tính khoảng cách từ owner đến user
      const distanceResult = await VietMapService.calculateDistance(
        ownerLocation.longitude,
        ownerLocation.latitude,
        userLocation.longitude,
        userLocation.latitude
      );

      if (!distanceResult.success && !distanceResult.fallback) {
        throw new Error('Không thể tính khoảng cách giao hàng');
      }

      const distanceKm = distanceResult.distanceKm;
      console.log('📏 Distance calculated:', distanceKm, 'km');

      // Tính phí shipping cho từng product
      const shippingCalculation = VietMapService.calculateProductShippingFees(products, distanceKm);

      return {
        success: true,
        distance: {
          km: distanceKm,
          meters: distanceResult.distance,
          duration: distanceResult.duration,
          fallback: distanceResult.fallback || false
        },
        shipping: shippingCalculation,
        vietmapResponse: distanceResult.rawResponse
      };
    } catch (error) {
      console.error('❌ Error calculating product shipping fees:', error);
      throw error;
    }
  }

  /**
   * Cập nhật shipping fees cho SubOrder và tất cả products bên trong
   * @param {string} subOrderId - ID của SubOrder
   * @param {Object} ownerLocation - Tọa độ owner
   * @param {Object} userLocation - Tọa độ user
   * @param {string} userId - ID của user thực hiện update
   * @returns {Promise<Object>} - SubOrder đã được cập nhật
   */
  async updateSubOrderShipping(subOrderId, ownerLocation, userLocation, userId) {
    console.log('🔄 Updating SubOrder shipping:', {
      subOrderId,
      userId,
      ownerLocation,
      userLocation
    });

    try {
      // Tìm SubOrder
      const subOrder = await SubOrder.findById(subOrderId).populate([
        {
          path: 'masterOrder',
          populate: { path: 'renter', select: 'profile.firstName phone' }
        },
        { path: 'owner', select: 'profile.firstName phone address' },
        { path: 'products.product', select: 'title name images price' }
      ]);

      if (!subOrder) {
        throw new Error('Không tìm thấy SubOrder');
      }

      // Kiểm tra quyền access (chỉ renter hoặc owner mới được update)
      const masterOrder = subOrder.masterOrder;
      const isRenter = masterOrder.renter._id.toString() === userId;
      const isOwner = subOrder.owner._id.toString() === userId;

      if (!isRenter && !isOwner) {
        throw new Error('Không có quyền cập nhật thông tin shipping');
      }

      // Tính phí shipping cho các products
      const shippingCalculation = await this.calculateProductShippingFees(
        subOrder.products,
        ownerLocation,
        userLocation
      );

      if (!shippingCalculation.success) {
        throw new Error('Không thể tính phí shipping');
      }

      // Cập nhật shipping info cho từng product theo delivery batches
      let totalSubOrderShippingFee = 0;

      // Create a map for quick product lookup
      const productFeeMap = new Map();
      shippingCalculation.shipping.productFees.forEach((fee) => {
        productFeeMap.set(fee.productIndex, fee);
      });

      for (let i = 0; i < subOrder.products.length; i++) {
        const productItem = subOrder.products[i];
        const productShipping = productFeeMap.get(i);

        if (productShipping) {
          // Cập nhật shipping info cho product với delivery batch information
          productItem.shipping = {
            distance: shippingCalculation.distance.km,
            fee: {
              baseFee: 15000, // Base fee per delivery from VietMapService
              pricePerKm: 5000, // Price per km from VietMapService
              totalFee: productShipping.allocatedFee // Allocated share of delivery fee
            },
            method: masterOrder.deliveryMethod || 'PICKUP',
            deliveryInfo: {
              deliveryDate: productShipping.deliveryDate,
              deliveryBatch: productShipping.deliveryBatch,
              batchSize: productShipping.breakdown.batchSize,
              batchQuantity: productShipping.breakdown.batchQuantity,
              sharedDeliveryFee: productShipping.breakdown.deliveryFee
            }
          };
          productItem.totalShippingFee = productShipping.allocatedFee;
          totalSubOrderShippingFee += productShipping.allocatedFee;
        }
      }

      // Cập nhật shipping info cho SubOrder
      subOrder.shipping = {
        method: masterOrder.deliveryMethod || 'PICKUP',
        fee: {
          baseFee: 10000, // Base fee từ VietMapService
          pricePerKm: 5000, // Price per km từ VietMapService
          totalFee: totalSubOrderShippingFee
        },
        distance: shippingCalculation.distance.km,
        estimatedTime: shippingCalculation.distance.duration,
        vietmapResponse: shippingCalculation.vietmapResponse
      };

      // Cập nhật pricing
      subOrder.pricing.shippingFee = totalSubOrderShippingFee;
      subOrder.pricing.shippingDistance = shippingCalculation.distance.km;
      subOrder.pricing.totalAmount =
        subOrder.pricing.subtotalRental +
        subOrder.pricing.subtotalDeposit +
        totalSubOrderShippingFee;

      // Lưu SubOrder
      await subOrder.save();

      console.log('✅ SubOrder shipping updated successfully:', {
        subOrderId,
        totalShippingFee: totalSubOrderShippingFee,
        distance: shippingCalculation.distance.km
      });

      return subOrder;
    } catch (error) {
      console.error('❌ Error updating SubOrder shipping:', error);
      throw error;
    }
  }

  /**
   * ❌ DEPRECATED: updateProductAvailability method removed
   *
   * ✅ NEW APPROACH - Dynamic Availability Calculation:
   * - Product.availability.quantity stays unchanged (original inventory)
   * - Real-time availability calculated via getProductAvailabilityFromSubOrders()
   * - Availability calendar API shows correct quantities per date range
   * - Race conditions eliminated by using SubOrder creation timestamps
   *
   * Why this approach is better:
   * 1. No race conditions when multiple users book simultaneously
   * 2. Product inventory numbers stay consistent
   * 3. Availability calculated based on actual bookings (SubOrders)
   * 4. Easy to handle cancellations and modifications
   * 5. Audit trail through SubOrder history
   */

  /**
   * 💳 Check if order has sufficient financial commitment to warrant product blocking
   */
  async checkFinancialCommitment(masterOrderId, paymentMethod, paymentResult) {
    try {
      console.log('💳 Checking financial commitment for product reservation...');

      switch (paymentMethod) {
        case 'WALLET':
        case 'BANK_TRANSFER':
        case 'PAYOS':
          // Full payment made - definitely block
          return {
            shouldBlock: true,
            reason: 'Full payment completed',
            commitmentLevel: 'HIGH',
            timeoutHours: 24
          };

        case 'COD':
          // Check if deposit was paid
          const hasDeposit =
            paymentResult?.depositAmount > 0 && paymentResult?.paymentDetails?.depositPaid;

          if (hasDeposit) {
            return {
              shouldBlock: true,
              reason: 'COD with deposit paid',
              commitmentLevel: 'MEDIUM',
              timeoutHours: 12,
              depositAmount: paymentResult.depositAmount
            };
          } else {
            return {
              shouldBlock: false,
              reason: 'COD without deposit - no financial commitment yet',
              commitmentLevel: 'LOW'
            };
          }

        default:
          return {
            shouldBlock: false,
            reason: 'Unknown payment method',
            commitmentLevel: 'UNKNOWN'
          };
      }
    } catch (error) {
      console.error('❌ Error checking financial commitment:', error);
      // Err on the side of caution - don't block if unsure
      return {
        shouldBlock: false,
        reason: 'Error determining commitment level',
        commitmentLevel: 'ERROR'
      };
    }
  }

  /**
   * 🔒 Create product reservations after payment to prevent double booking
   * Strategy: "SMART RESERVE" - Block products with timeout mechanism
   */
  async createProductReservations(masterOrderId, paymentMethod, commitmentInfo) {
    try {
      console.log('🔒 Creating product reservations for order:', masterOrderId);

      const MasterOrder = require('../models/MasterOrder');
      const ProductReservation = require('../models/ProductReservation'); // Assuming we have this model

      // Get the master order with sub orders
      const masterOrder = await MasterOrder.findById(masterOrderId).populate('subOrders');
      if (!masterOrder) {
        throw new Error('Master order not found for reservation');
      }

      const reservations = [];

      // Create reservations for each product in each sub order
      for (const subOrder of masterOrder.subOrders) {
        for (const productItem of subOrder.products) {
          const reservation = {
            product: productItem.product,
            quantity: productItem.quantity,
            reservedFor: {
              masterOrder: masterOrderId,
              subOrder: subOrder._id,
              renter: masterOrder.renter
            },
            rentalPeriod: {
              startDate: subOrder.rentalPeriod.startDate,
              endDate: subOrder.rentalPeriod.endDate
            },
            paymentMethod: paymentMethod,
            status: 'ACTIVE', // ACTIVE, EXPIRED, CONFIRMED, CANCELLED
            expiresAt: new Date(Date.now() + (commitmentInfo.timeoutHours || 24) * 60 * 60 * 1000),
            createdAt: new Date(),
            metadata: {
              reason: commitmentInfo.reason || 'PAYMENT_COMPLETED',
              commitmentLevel: commitmentInfo.commitmentLevel,
              depositAmount: commitmentInfo.depositAmount || 0,
              autoExpire: true,
              requiresOwnerConfirmation: true,
              timeoutHours: commitmentInfo.timeoutHours || 24
            }
          };

          // For now, just log the reservation (implement model later)
          console.log('📋 Product reservation created:', {
            productId: productItem.product,
            quantity: productItem.quantity,
            period: `${subOrder.rentalPeriod.startDate} - ${subOrder.rentalPeriod.endDate}`,
            commitmentLevel: commitmentInfo.commitmentLevel,
            timeoutHours: commitmentInfo.timeoutHours,
            expiresAt: reservation.expiresAt.toLocaleString('vi-VN')
          });

          reservations.push(reservation);
        }
      }

      // TODO: Save reservations to database when ProductReservation model is ready
      // await ProductReservation.insertMany(reservations);

      console.log(`✅ Created ${reservations.length} product reservations`);

      return {
        reservationCount: reservations.length,
        expiresAt: new Date(Date.now() + (commitmentInfo.timeoutHours || 24) * 60 * 60 * 1000),
        strategy: 'SMART_RESERVE',
        commitmentLevel: commitmentInfo.commitmentLevel,
        timeoutHours: commitmentInfo.timeoutHours,
        details: reservations.map((r) => ({
          productId: r.product,
          quantity: r.quantity,
          period: `${r.rentalPeriod.startDate} - ${r.rentalPeriod.endDate}`,
          commitmentLevel: r.metadata.commitmentLevel
        }))
      };
    } catch (error) {
      console.error('❌ Error creating product reservations:', error);
      // Don't throw error - reservations are enhancement, not critical
      return { error: error.message, reservationCount: 0 };
    }
  }

  /**
   * 🕐 Check and expire overdue owner confirmations
   * Should be called by cron job or scheduler
   */
  async expireOverdueConfirmations() {
    try {
      console.log('⏰ Checking for overdue owner confirmations...');

      const overdueOrders = await MasterOrder.find({
        status: 'PENDING_CONFIRMATION',
        paymentStatus: 'PAID',
        ownerConfirmationDeadline: { $lt: new Date() }
      });

      console.log(`Found ${overdueOrders.length} overdue orders`);

      for (const order of overdueOrders) {
        console.log(`⏰ Order ${order._id} expired - initiating auto-refund`);

        // Auto-refund and cancel order
        await this.autoRefundExpiredOrder(order._id);
      }

      return { processedCount: overdueOrders.length };
    } catch (error) {
      console.error('❌ Error expiring overdue confirmations:', error);
      throw error;
    }
  }

  /**
   * 💰 Process partial refund for rejected products in SubOrder
   */
  async processPartialRefundForRejectedProducts(subOrderId, rejectedProductIds, rejectionReason) {
    try {
      console.log('💸 Processing partial refund for rejected products:', {
        subOrderId,
        rejectedProductIds,
        rejectionReason
      });

      const SubOrder = require('../models/SubOrder');
      const subOrder = await SubOrder.findById(subOrderId).populate([
        'masterOrder',
        'products.product'
      ]);

      if (!subOrder) {
        throw new Error('SubOrder not found for partial refund');
      }

      let refundAmount = 0;
      const refundBreakdown = [];
      const productsToRelease = [];

      // Update confirmation status and calculate refund
      for (const productItem of subOrder.products) {
        if (rejectedProductIds.includes(productItem.product._id.toString())) {
          // Mark as rejected
          productItem.confirmationStatus = 'REJECTED';
          productItem.rejectionReason = rejectionReason;
          productItem.rejectedAt = new Date();

          // Add to refund amount (deposit + rental if paid)
          const productRefund = (productItem.totalDeposit || 0) + (productItem.totalRental || 0);
          refundAmount += productRefund;

          refundBreakdown.push({
            productId: productItem.product._id,
            productName: productItem.product.title || productItem.product.name,
            quantity: productItem.quantity,
            refundAmount: productRefund,
            depositRefund: productItem.totalDeposit || 0,
            rentalRefund: productItem.totalRental || 0
          });

          // Mark for availability release
          productsToRelease.push({
            productId: productItem.product._id,
            quantity: productItem.quantity
          });
        }
      }

      await subOrder.save();

      // Release product availability for rejected products
      for (const releaseItem of productsToRelease) {
        await this.releaseSpecificProductAvailability(releaseItem.productId, releaseItem.quantity);
      }

      // Process actual refund if payment was made
      if (refundAmount > 0 && subOrder.masterOrder.paymentStatus === 'PAID') {
        await this.processWalletRefund(
          subOrder.masterOrder.renter,
          refundAmount,
          `Hoàn tiền cho sản phẩm bị từ chối trong đơn ${subOrder.masterOrder.masterOrderNumber}`
        );
      }

      console.log('✅ Partial refund processed:', {
        refundAmount: refundAmount.toLocaleString('vi-VN') + 'đ',
        breakdown: refundBreakdown
      });

      return {
        success: true,
        refundAmount,
        breakdown: refundBreakdown,
        productsReleased: productsToRelease.length
      };
    } catch (error) {
      console.error('❌ Error processing partial refund:', error);
      throw error;
    }
  }

  /**
   * 🔓 Release availability for specific products (used in partial refunds)
   */
  async releaseSpecificProductAvailability(productId, quantity) {
    try {
      const Product = require('../models/Product');
      const product = await Product.findById(productId);

      if (!product) {
        console.warn(`⚠️ Product ${productId} not found for availability release`);
        return;
      }

      product.availability.quantity += quantity;
      product.availability.isAvailable = product.availability.quantity > 0;

      await product.save();

      console.log(
        `📈 Released ${quantity} units for product ${product.title}: availability now ${product.availability.quantity}`
      );
    } catch (error) {
      console.error(`❌ Error releasing availability for product ${productId}:`, error);
      throw error;
    }
  }

  /**
   * 💰 Auto-refund expired order and release product reservations
   */
  async autoRefundExpiredOrder(masterOrderId) {
    try {
      console.log('💰 Auto-refunding expired order:', masterOrderId);

      const masterOrder = await MasterOrder.findById(masterOrderId);
      if (!masterOrder) return;

      // Update order status
      masterOrder.status = 'CANCELLED';
      masterOrder.cancellationReason = 'OWNER_CONFIRMATION_EXPIRED';
      masterOrder.cancelledAt = new Date();
      await masterOrder.save();

      // Update sub orders
      await SubOrder.updateMany(
        { masterOrder: masterOrderId },
        { status: 'CANCELLED', cancelledAt: new Date() }
      );

      // Process refund if payment was made
      if (masterOrder.paymentStatus === 'PAID' || masterOrder.paymentStatus === 'PARTIALLY_PAID') {
        let refundAmount = 0;

        if (masterOrder.paymentMethod === 'WALLET' || masterOrder.paymentMethod === 'PAYOS') {
          // Full payment refund
          refundAmount = masterOrder.totalAmount;
        } else if (masterOrder.paymentMethod === 'COD') {
          // Only refund the deposit for COD orders - get from SubOrders since they exist now
          const depositInfo = await this.getDepositFromSubOrders(masterOrderId);
          refundAmount = depositInfo.totalDeposit;
        }

        if (refundAmount > 0) {
          await this.processWalletRefund(
            masterOrder.renter,
            refundAmount,
            `Hoàn tiền tự động cho đơn hàng hết hạn ${masterOrder.masterOrderNumber}`
          );
        }
      }

      // ✅ NO NEED TO RELEASE PRODUCT AVAILABILITY
      // Product availability is calculated dynamically - no database updates needed
      console.log('✅ Product quantities unchanged - availability auto-calculated via SubOrders');

      console.log('✅ Order auto-refunded and products released');
    } catch (error) {
      console.error('❌ Error auto-refunding expired order:', error);
      throw error;
    }
  }

  /**
   * 💳 Process wallet refund for rejected/expired orders
   */
  async processWalletRefund(userId, amount, description) {
    try {
      console.log('💳 Processing wallet refund:', {
        userId,
        amount: amount.toLocaleString('vi-VN') + 'đ',
        description
      });

      const User = require('../models/User');
      const Wallet = require('../models/Wallet');
      const Transaction = require('../models/Transaction');

      // Get user's wallet
      const user = await User.findById(userId).populate('wallet');
      if (!user || !user.wallet) {
        throw new Error('User wallet not found for refund');
      }

      const wallet = user.wallet;
      const previousBalance = wallet.balance.available;

      // Add refund to wallet
      wallet.balance.available += amount;
      await wallet.save();

      // Create refund transaction record
      const transaction = new Transaction({
        user: userId,
        wallet: wallet._id,
        type: 'refund',
        amount: amount,
        description: description,
        status: 'success',
        metadata: {
          refundReason: 'ORDER_REJECTION_OR_EXPIRY',
          previousBalance: previousBalance,
          newBalance: wallet.balance.available
        }
      });
      await transaction.save();

      console.log('✅ Wallet refund processed successfully:', {
        previousBalance: previousBalance.toLocaleString('vi-VN') + 'đ',
        refundAmount: amount.toLocaleString('vi-VN') + 'đ',
        newBalance: wallet.balance.available.toLocaleString('vi-VN') + 'đ'
      });

      return {
        success: true,
        refundAmount: amount,
        transactionId: transaction._id,
        previousBalance,
        newBalance: wallet.balance.available
      };
    } catch (error) {
      console.error('❌ Error processing wallet refund:', error);
      throw error;
    }
  }

  /**
   * 🔄 Verify and complete PayOS payment for rental order
   */
  async verifyAndCompletePayOSPayment(masterOrderId, orderCode) {
    try {
      // Get master order
      const masterOrder = await MasterOrder.findById(masterOrderId);
      if (!masterOrder) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      // Check if already paid
      if (masterOrder.paymentStatus === 'PAID' || masterOrder.paymentStatus === 'PARTIALLY_PAID') {
        return {
          success: true,
          message: 'Đơn hàng đã được thanh toán',
          order: masterOrder
        };
      }

      // Verify payment with PayOS
      const payosPaymentInfo = await payos.paymentRequests.get(Number(orderCode));

      if (payosPaymentInfo.status !== 'PAID') {
        throw new Error(`Thanh toán chưa hoàn tất. Trạng thái: ${payosPaymentInfo.status}`);
      }

      // Update transaction record
      const transaction = await Transaction.findOne({
        orderCode: orderCode.toString(),
        status: 'pending'
      });

      if (transaction) {
        transaction.status = 'success';
        transaction.metadata = {
          ...transaction.metadata,
          payosData: payosPaymentInfo,
          completedAt: new Date()
        };
        await transaction.save();
      } // Update order payment status
      const isFullPayment =
        masterOrder.paymentMethod === 'PAYOS' || masterOrder.paymentMethod === 'BANK_TRANSFER';
      const isCODDeposit = masterOrder.paymentMethod === 'COD';

      console.log(
        '💰 Payment type:',
        isFullPayment ? 'FULL' : isCODDeposit ? 'DEPOSIT' : 'UNKNOWN'
      );

      if (isFullPayment) {
        // Full payment for PAYOS/BANK_TRANSFER
        masterOrder.paymentStatus = 'PAID';
        masterOrder.status = 'PENDING_CONFIRMATION';
        console.log('📝 Setting: paymentStatus=PAID, status=PENDING_CONFIRMATION');

        // Credit system wallet because external payment received by platform
        try {
          const creditAmount = Number(payosPaymentInfo.amount) || transaction?.amount || 0;
          if (creditAmount > 0) {
            await SystemWalletService.addFunds(process.env.SYSTEM_ADMIN_ID || null, creditAmount, `PayOS payment for order ${masterOrder.masterOrderNumber}`);
            console.log('✅ Credited system wallet with PayOS amount:', creditAmount);
          }
        } catch (err) {
          console.error('Failed to credit system wallet after PayOS payment:', err.message || String(err));
        }
      } else if (isCODDeposit) {
        // Deposit payment for COD
        masterOrder.paymentStatus = 'PARTIALLY_PAID';
        masterOrder.status = 'PENDING_CONFIRMATION';
        console.log('📝 Setting: paymentStatus=PARTIALLY_PAID, status=PENDING_CONFIRMATION');

        // If a transaction was created (deposit via PayOS), credit system wallet with deposit
        try {
          const depositAmount = transaction?.amount || Number(payosPaymentInfo.amount) || 0;
          if (depositAmount > 0) {
            await SystemWalletService.addFunds(process.env.SYSTEM_ADMIN_ID || null, depositAmount, `PayOS deposit for order ${masterOrder.masterOrderNumber}`);
            console.log('✅ Credited system wallet with deposit amount:', depositAmount);
          }
        } catch (err) {
          console.error('Failed to credit system wallet for deposit after PayOS:', err.message || String(err));
        }
      }

      // Update payment info
      if (masterOrder.paymentInfo) {
        masterOrder.paymentInfo.status = isFullPayment ? 'SUCCESS' : 'PARTIALLY_PAID';
        masterOrder.paymentInfo.paymentDetails = {
          ...masterOrder.paymentInfo.paymentDetails,
          payosVerified: true,
          payosData: payosPaymentInfo,
          verifiedAt: new Date()
        };
      }

      await masterOrder.save();

      // Update SubOrders to PENDING_OWNER_CONFIRMATION
      await SubOrder.updateMany(
        { masterOrder: masterOrderId },
        { status: 'PENDING_OWNER_CONFIRMATION' }
      );

      // Set owner confirmation deadline (24h)
      const expireTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      masterOrder.ownerConfirmationDeadline = expireTime;
      await masterOrder.save();

      return {
        success: true,
        message: 'Thanh toán đã được xác nhận thành công',
        order: await MasterOrder.findById(masterOrderId)
          .populate({
            path: 'subOrders',
            populate: [
              { path: 'owner', select: 'profile.fullName profile.phone' },
              { path: 'products.product', select: 'name images price deposit' }
            ]
          })
          .populate('renter', 'profile phone email')
      };
    } catch (error) {
      console.error('❌ Error verifying PayOS payment:', error);
      throw new Error(`Không thể xác nhận thanh toán: ${error.message}`);
    }
  }

  /**
   * 📊 Get product availability calendar from SubOrder data (real-time calculation)
   */
  async getProductAvailabilityFromSubOrders(productId, startDate, endDate) {
    const Product = require('../models/Product');
    const SubOrder = require('../models/SubOrder');

    const product = await Product.findById(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    const bufferDays = product.availability?.bufferDays || 1;
    console.log(`📊 Product ${product.title} - Buffer days: ${bufferDays}`);

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get all SubOrders for this product (đã cọc/thanh toán -> block ngay lập tức)
    // Không cần check status vì user đã thanh toán/cọc khi tạo SubOrder
    const bookings = await SubOrder.find({
      status: { $nin: ['DRAFT', 'CANCELLED', 'DELIVERY_FAILED_BOOM'] },
      'products.product': productId
    }).populate({
      path: 'masterOrder',
      populate: {
        path: 'renter',
        select: 'profile.firstName profile.lastName'
      }
    });

    console.log(`📋 Found ${bookings.length} SubOrders for product ${productId}`);

    const calendar = [];

    // Build calendar day by day
    for (
      let currentDate = new Date(start);
      currentDate <= end;
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      const dateString = currentDate.toISOString().split('T')[0];
      let bookedQuantity = 0;
      const dayBookings = [];

      // Check each booking to see if it covers this date
      for (const subOrder of bookings) {
        for (const productItem of subOrder.products) {
          if (productItem.product.toString() === productId) {
            const itemStart = new Date(productItem.rentalPeriod.startDate);
            const itemEnd = new Date(productItem.rentalPeriod.endDate);

            // Thêm buffer days vào endDate để kiểm tra hàng sau khi trả
            const bufferDays = product.availability?.bufferDays || 1;
            const itemEndWithBuffer = new Date(itemEnd);
            itemEndWithBuffer.setDate(itemEndWithBuffer.getDate() + bufferDays);

            // Check if current date falls within rental period + buffer days
            if (currentDate >= itemStart && currentDate < itemEndWithBuffer) {
              bookedQuantity += productItem.quantity;
              dayBookings.push({
                subOrderId: subOrder._id,
                subOrderNumber: subOrder.subOrderNumber,
                renterName:
                  `${subOrder.masterOrder?.renter?.profile?.firstName || ''} ${subOrder.masterOrder?.renter?.profile?.lastName || ''}`.trim(),
                quantity: productItem.quantity,
                rentalPeriod: {
                  startDate: productItem.rentalPeriod.startDate,
                  endDate: productItem.rentalPeriod.endDate,
                  duration: productItem.rentalPeriod.duration
                }
              });
            }
          }
        }
      }

      const availableQuantity = Math.max(0, product.availability.quantity - bookedQuantity);

      calendar.push({
        date: dateString,
        totalQuantity: product.availability.quantity,
        bookedQuantity: bookedQuantity,
        availableQuantity: availableQuantity,
        isFullyBooked: availableQuantity === 0,
        bookings: dayBookings
      });
    }

    return {
      productId: productId,
      productTitle: product.title,
      dateRange: { startDate, endDate },
      totalQuantity: product.availability.quantity,
      calendar: calendar
    };
  }

  // ============================================================================
  // XÁC NHẬN MỘT PHẦN SẢN PHẨM (PARTIAL CONFIRMATION)
  // ============================================================================

  /**
   * Owner xác nhận một phần sản phẩm trong SubOrder
   * - Những sản phẩm được chọn → CONFIRMED
   * - Những sản phẩm KHÔNG được chọn → TỰ ĐỘNG REJECTED + hoàn tiền ngay lập tức
   * - Chỉ tạo 1 hợp đồng cho các sản phẩm CONFIRMED
   *
   * @param {String} subOrderId - ID của SubOrder
   * @param {String} ownerId - ID của owner
   * @param {Array} confirmedProductIds - Mảng _id của các product item được xác nhận
   * @returns {Object} SubOrder đã được cập nhật
   */
  async partialConfirmSubOrder(subOrderId, ownerId, confirmedProductIds) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Lấy SubOrder và kiểm tra quyền
      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId,
        status: 'PENDING_OWNER_CONFIRMATION'
      })
        .populate('masterOrder')
        .populate('products.product')
        .session(session);

      if (!subOrder) {
        throw new Error('Không tìm thấy đơn hàng hoặc không có quyền xác nhận');
      }

      const masterOrder = await MasterOrder.findById(subOrder.masterOrder._id).session(session);
      if (!masterOrder) {
        throw new Error('Không tìm thấy MasterOrder');
      }

      // 2. Kiểm tra xem có ít nhất 1 sản phẩm được xác nhận
      if (!confirmedProductIds || confirmedProductIds.length === 0) {
        throw new Error('Phải xác nhận ít nhất 1 sản phẩm');
      }

      // Chuyển sang Set để tìm kiếm nhanh
      const confirmedSet = new Set(confirmedProductIds.map((id) => id.toString()));

      let totalConfirmed = 0;
      let totalRejected = 0;
      let rejectedAmount = 0;
      const now = new Date();

      // 3. Duyệt qua từng sản phẩm và cập nhật trạng thái
      for (const productItem of subOrder.products) {
        const productIdStr = productItem._id.toString();

        if (confirmedSet.has(productIdStr)) {
          // Sản phẩm được chọn → CONFIRMED
          productItem.confirmationStatus = 'CONFIRMED';
          productItem.confirmedAt = now;
          totalConfirmed++;
        } else {
          // Sản phẩm KHÔNG được chọn → TỰ ĐỘNG REJECTED
          productItem.confirmationStatus = 'REJECTED';
          productItem.rejectedAt = now;
          productItem.rejectionReason = 'Chủ đồ chỉ xác nhận một phần đơn hàng';
          totalRejected++;

          // Tính số tiền cần hoàn
          const rentalAmount = productItem.totalRental || 0;
          const depositAmount = productItem.totalDeposit || 0;
          const shippingAmount = productItem.totalShippingFee || 0;
          rejectedAmount += rentalAmount + depositAmount + shippingAmount;
        }
      }

      // 4. Cập nhật trạng thái SubOrder
      if (totalConfirmed > 0 && totalRejected > 0) {
        subOrder.status = 'PARTIALLY_CONFIRMED';
      } else if (totalConfirmed === subOrder.products.length) {
        subOrder.status = 'OWNER_CONFIRMED';
      } else if (totalRejected === subOrder.products.length) {
        subOrder.status = 'OWNER_REJECTED';
      }

      subOrder.ownerConfirmation = {
        status: totalConfirmed > 0 ? 'CONFIRMED' : 'REJECTED',
        confirmedAt: now,
        notes: `Đã xác nhận ${totalConfirmed}/${subOrder.products.length} sản phẩm`
      };

      await subOrder.save({ session });

      // 5. Hoàn tiền cho các sản phẩm bị rejected
      if (rejectedAmount > 0) {
        await this.refundRejectedProducts(
          masterOrder,
          subOrder,
          rejectedAmount,
          `Chủ đồ chỉ xác nhận ${totalConfirmed}/${subOrder.products.length} sản phẩm`,
          session
        );
      }

      // 6. Cập nhật confirmationSummary của MasterOrder
      await this.updateMasterOrderConfirmationSummary(masterOrder._id, session);

      // 7. Kiểm tra và cập nhật trạng thái tổng thể của MasterOrder
      await this.updateMasterOrderStatus(masterOrder._id, session);

      // 8. Gửi thông báo cho renter
      await this.sendPartialConfirmationNotification(
        masterOrder,
        subOrder,
        totalConfirmed,
        totalRejected
      );

      // 9. Nếu có sản phẩm CONFIRMED → tạo hợp đồng cho SubOrder này
      if (totalConfirmed > 0) {
        // Chuyển SubOrder sang READY_FOR_CONTRACT
        subOrder.status = 'READY_FOR_CONTRACT';
        subOrder.contractStatus = {
          status: 'PENDING',
          createdAt: now
        };
        await subOrder.save({ session });

        // Tạo hợp đồng chỉ cho các sản phẩm CONFIRMED
        await this.generatePartialContract(subOrder._id, session);
      }

      await session.commitTransaction();
      session.endSession();

      // Trả về SubOrder đã được populate
      return await SubOrder.findById(subOrderId)
        .populate('masterOrder')
        .populate('products.product')
        .populate('owner', 'profile.fullName profile.phone email');
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('❌ Error in partialConfirmSubOrder:', error);
      throw new Error('Không thể xác nhận đơn hàng: ' + error.message);
    }
  }

  /**
   * Hoàn tiền cho các sản phẩm bị rejected
   */
  async refundRejectedProducts(masterOrder, subOrder, refundAmount, reason, session) {
    try {
      const renter = masterOrder.renter;

      // Lấy wallet của renter
      const wallet = await Wallet.findOne({ user: renter }).session(session);
      if (!wallet) {
        throw new Error('Không tìm thấy ví của người thuê');
      }

      // Cộng tiền vào available balance
      wallet.balance.available += refundAmount;
      await wallet.save({ session });

      // Tạo transaction record
      const transaction = new Transaction({
        user: renter,
        wallet: wallet._id,
        type: 'refund',
        amount: refundAmount,
        status: 'success',
        description: `Hoàn tiền cho đơn hàng ${subOrder.subOrderNumber}: ${reason}`,
        reference: subOrder.subOrderNumber,
        paymentMethod: 'wallet',
        metadata: {
          masterOrderId: masterOrder._id,
          subOrderId: subOrder._id,
          reason: reason,
          refundType: 'partial_rejection'
        },
        processedAt: new Date()
      });
      await transaction.save({ session });

      // Cập nhật tổng số tiền đã hoàn trong MasterOrder
      if (!masterOrder.confirmationSummary) {
        masterOrder.confirmationSummary = {};
      }
      masterOrder.confirmationSummary.totalRefundedAmount =
        (masterOrder.confirmationSummary.totalRefundedAmount || 0) + refundAmount;
      await masterOrder.save({ session });

      console.log(`✅ Đã hoàn ${refundAmount} VND cho người thuê ${renter}`);
    } catch (error) {
      console.error('❌ Error refunding rejected products:', error);
      throw error;
    }
  }

  /**
   * Cập nhật tổng hợp trạng thái xác nhận của MasterOrder
   */
  async updateMasterOrderConfirmationSummary(masterOrderId, session) {
    try {
      const masterOrder = await MasterOrder.findById(masterOrderId).session(session);
      const subOrders = await SubOrder.find({ masterOrder: masterOrderId }).session(session);

      let totalProducts = 0;
      let confirmedProducts = 0;
      let rejectedProducts = 0;
      let pendingProducts = 0;
      let totalConfirmedAmount = 0;
      let totalRejectedAmount = 0;

      for (const subOrder of subOrders) {
        for (const productItem of subOrder.products) {
          totalProducts++;
          const itemAmount = (productItem.totalRental || 0) + (productItem.totalDeposit || 0);

          if (productItem.confirmationStatus === 'CONFIRMED') {
            confirmedProducts++;
            totalConfirmedAmount += itemAmount;
          } else if (productItem.confirmationStatus === 'REJECTED') {
            rejectedProducts++;
            totalRejectedAmount += itemAmount;
          } else {
            pendingProducts++;
          }
        }
      }

      masterOrder.confirmationSummary = {
        totalProducts,
        confirmedProducts,
        rejectedProducts,
        pendingProducts,
        totalConfirmedAmount,
        totalRejectedAmount,
        totalRefundedAmount: masterOrder.confirmationSummary?.totalRefundedAmount || 0
      };

      await masterOrder.save({ session });
    } catch (error) {
      console.error('❌ Error updating confirmation summary:', error);
      throw error;
    }
  }

  /**
   * Cập nhật trạng thái tổng thể của MasterOrder dựa trên confirmationSummary
   */
  async updateMasterOrderStatus(masterOrderId, session) {
    try {
      const masterOrder = await MasterOrder.findById(masterOrderId).session(session);
      const summary = masterOrder.confirmationSummary;

      if (!summary) return;

      // Nếu tất cả sản phẩm đều CONFIRMED
      if (summary.confirmedProducts === summary.totalProducts) {
        masterOrder.status = 'CONFIRMED';
      }
      // Nếu có ít nhất 1 sản phẩm REJECTED
      else if (summary.rejectedProducts > 0 && summary.confirmedProducts > 0) {
        masterOrder.status = 'PARTIALLY_CANCELLED';
      }
      // Nếu tất cả sản phẩm đều bị REJECTED
      else if (summary.rejectedProducts === summary.totalProducts) {
        masterOrder.status = 'CANCELLED';
      }
      // Còn lại: vẫn còn sản phẩm PENDING
      else if (summary.pendingProducts > 0) {
        masterOrder.status = 'PENDING_CONFIRMATION';
      }

      await masterOrder.save({ session });
    } catch (error) {
      console.error('❌ Error updating master order status:', error);
      throw error;
    }
  }

  /**
   * Gửi thông báo cho renter về việc xác nhận một phần
   */
  async sendPartialConfirmationNotification(masterOrder, subOrder, confirmedCount, rejectedCount) {
    try {
      const Notification = require('../models/Notification');

      const totalCount = confirmedCount + rejectedCount;
      let message = '';
      let category = 'INFO';

      if (confirmedCount > 0 && rejectedCount > 0) {
        message = `Chủ đồ đã xác nhận ${confirmedCount}/${totalCount} sản phẩm trong đơn hàng ${subOrder.subOrderNumber}. Các sản phẩm còn lại đã được tự động hủy và hoàn tiền.`;
        category = 'WARNING';
      } else if (confirmedCount === totalCount) {
        message = `Chủ đồ đã xác nhận tất cả ${confirmedCount} sản phẩm trong đơn hàng ${subOrder.subOrderNumber}.`;
        category = 'SUCCESS';
      } else {
        message = `Chủ đồ đã từ chối đơn hàng ${subOrder.subOrderNumber}. Toàn bộ tiền đã được hoàn lại.`;
        category = 'ERROR';
      }

      await Notification.create({
        recipient: masterOrder.renter,
        title: 'Cập nhật xác nhận đơn hàng',
        message: message,
        type: 'ORDER',
        category: category,
        relatedOrder: masterOrder._id,
        status: 'PENDING',
        data: {
          subOrderId: subOrder._id,
          confirmedCount,
          rejectedCount,
          totalCount
        }
      });

      console.log('✅ Đã gửi thông báo xác nhận một phần cho renter');
    } catch (error) {
      console.error('❌ Error sending partial confirmation notification:', error);
      // Không throw error vì notification không phải critical
    }
  }

  /**
   * Tạo hợp đồng chỉ cho các sản phẩm đã CONFIRMED trong SubOrder
   */
  async generatePartialContract(subOrderId, session = null) {
    try {
      const subOrder = await SubOrder.findById(subOrderId)
        .populate('masterOrder')
        .populate('owner', 'profile email phone')
        .populate('products.product')
        .session(session);

      if (!subOrder) {
        throw new Error('Không tìm thấy SubOrder');
      }

      // Lọc ra chỉ các sản phẩm CONFIRMED
      const confirmedProducts = subOrder.products.filter(
        (item) => item.confirmationStatus === 'CONFIRMED'
      );

      if (confirmedProducts.length === 0) {
        throw new Error('Không có sản phẩm nào được xác nhận để tạo hợp đồng');
      }

      const masterOrder = subOrder.masterOrder;
      const renter = await User.findById(masterOrder.renter).session(session);

      // Tạo contractNumber
      const contractNumber = `CT${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      // Tính tổng giá trị hợp đồng (chỉ cho các sản phẩm CONFIRMED)
      let totalRental = 0;
      let totalDeposit = 0;
      let totalShipping = 0;

      for (const item of confirmedProducts) {
        totalRental += item.totalRental || 0;
        totalDeposit += item.totalDeposit || 0;
        totalShipping += item.totalShippingFee || 0;
      }

      const totalAmount = totalRental + totalDeposit + totalShipping;

      // Tạo HTML content cho hợp đồng
      const htmlContent = this.generateContractHTML(
        contractNumber,
        subOrder,
        renter,
        confirmedProducts,
        totalRental,
        totalDeposit,
        totalShipping,
        totalAmount
      );

      // Tạo Contract document
      const contract = new Contract({
        contractNumber,
        subOrder: subOrder._id,
        masterOrder: masterOrder._id,
        owner: subOrder.owner._id,
        renter: masterOrder.renter,
        product: confirmedProducts[0].product._id, // Sản phẩm đầu tiên (có thể cải thiện)
        terms: {
          startDate: confirmedProducts[0].rentalPeriod.startDate,
          endDate: confirmedProducts[0].rentalPeriod.endDate,
          rentalRate: totalRental,
          deposit: totalDeposit,
          totalAmount: totalAmount,
          lateReturnPenalty: 0,
          damagePenalty: 0
        },
        status: 'PENDING_OWNER', // Owner phải ký trước
        content: {
          htmlContent: htmlContent,
          pdfUrl: null,
          templateVersion: '1.0'
        },
        verification: {
          ownerIdVerified: false,
          renterIdVerified: false,
          timestamp: new Date()
        }
      });

      if (session) {
        await contract.save({ session });
      } else {
        await contract.save();
      }

      // Cập nhật SubOrder với contract ID
      subOrder.contract = contract._id;
      subOrder.contractStatus.status = 'PENDING';
      subOrder.contractStatus.createdAt = new Date();

      if (session) {
        await subOrder.save({ session });
      } else {
        await subOrder.save();
      }

      console.log(`✅ Đã tạo hợp đồng ${contractNumber} cho SubOrder ${subOrder.subOrderNumber}`);
      return contract;
    } catch (error) {
      console.error('❌ Error generating partial contract:', error);
      throw error;
    }
  }

  /**
   * Generate HTML content cho hợp đồng (chỉ chứa sản phẩm CONFIRMED)
   */
  generateContractHTML(
    contractNumber,
    subOrder,
    renter,
    confirmedProducts,
    totalRental,
    totalDeposit,
    totalShipping,
    totalAmount
  ) {
    const productListHTML = confirmedProducts
      .map(
        (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.product?.title || item.product?.name || 'N/A'}</td>
        <td>${item.quantity}</td>
        <td>${new Date(item.rentalPeriod.startDate).toLocaleDateString('vi-VN')}</td>
        <td>${new Date(item.rentalPeriod.endDate).toLocaleDateString('vi-VN')}</td>
        <td>${(item.totalRental || 0).toLocaleString('vi-VN')} VND</td>
        <td>${(item.totalDeposit || 0).toLocaleString('vi-VN')} VND</td>
      </tr>
    `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <title>Hợp đồng thuê ${contractNumber}</title>
        <style>
          body { font-family: 'Times New Roman', serif; padding: 40px; line-height: 1.6; }
          h1 { text-align: center; color: #2c3e50; }
          .info { margin: 20px 0; }
          .info strong { display: inline-block; width: 200px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #3498db; color: white; }
          .total { font-weight: bold; background-color: #ecf0f1; }
          .note { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>HỢP ĐỒNG THUÊ ĐỒ</h1>
        <p style="text-align: center; font-weight: bold;">Số: ${contractNumber}</p>
        
        <div class="info">
          <p><strong>BÊN CHO THUÊ:</strong> ${subOrder.owner?.profile?.firstName || 'N/A'} ${subOrder.owner?.profile?.lastName || ''}</p>
          <p><strong>Số điện thoại:</strong> ${subOrder.owner?.phone || 'N/A'}</p>
          <p><strong>Email:</strong> ${subOrder.owner?.email || 'N/A'}</p>
        </div>

        <div class="info">
          <p><strong>BÊN THUÊ:</strong> ${renter?.profile?.firstName || 'N/A'} ${renter?.profile?.lastName || ''}</p>
          <p><strong>Số điện thoại:</strong> ${renter?.phone || 'N/A'}</p>
          <p><strong>Email:</strong> ${renter?.email || 'N/A'}</p>
        </div>

        <div class="note">
          <strong>Lưu ý quan trọng:</strong> 
          <p>Chủ đồ đã xác nhận <strong>${confirmedProducts.length}</strong> sản phẩm trong đơn hàng này. 
          Các sản phẩm còn lại đã được tự động hủy và hoàn tiền.</p>
        </div>

        <h3>DANH SÁCH SẢN PHẨM ĐÃ XÁC NHẬN</h3>
        <table>
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên sản phẩm</th>
              <th>Số lượng</th>
              <th>Ngày bắt đầu</th>
              <th>Ngày kết thúc</th>
              <th>Giá thuê</th>
              <th>Tiền cọc</th>
            </tr>
          </thead>
          <tbody>
            ${productListHTML}
            <tr class="total">
              <td colspan="5" style="text-align: right;">TỔNG CỘNG:</td>
              <td>${totalRental.toLocaleString('vi-VN')} VND</td>
              <td>${totalDeposit.toLocaleString('vi-VN')} VND</td>
            </tr>
            <tr class="total">
              <td colspan="5" style="text-align: right;">Phí vận chuyển:</td>
              <td colspan="2">${totalShipping.toLocaleString('vi-VN')} VND</td>
            </tr>
            <tr class="total">
              <td colspan="5" style="text-align: right;"><strong>TỔNG THANH TOÁN:</strong></td>
              <td colspan="2"><strong>${totalAmount.toLocaleString('vi-VN')} VND</strong></td>
            </tr>
          </tbody>
        </table>

        <h3>ĐIỀU KHOẢN HỢP ĐỒNG</h3>
        <ol>
          <li>Bên thuê cam kết sử dụng sản phẩm đúng mục đích và giữ gìn cẩn thận.</li>
          <li>Tiền cọc sẽ được hoàn trả sau khi trả sản phẩm trong tình trạng tốt.</li>
          <li>Nếu trả trễ, bên thuê phải chịu phí phạt theo quy định.</li>
          <li>Nếu sản phẩm bị hư hỏng, bên thuê phải bồi thường theo giá trị thực tế.</li>
        </ol>

        <div style="margin-top: 50px; display: flex; justify-content: space-between;">
          <div style="text-align: center;">
            <p><strong>BÊN CHO THUÊ</strong></p>
            <p>(Ký và ghi rõ họ tên)</p>
          </div>
          <div style="text-align: center;">
            <p><strong>BÊN THUÊ</strong></p>
            <p>(Ký và ghi rõ họ tên)</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Cron job tự động reject các sản phẩm PENDING quá deadline
   */
  async autoRejectExpiredPendingProducts() {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const now = new Date();

      // Tìm các MasterOrder đã quá deadline
      const expiredOrders = await MasterOrder.find({
        status: 'PENDING_CONFIRMATION',
        ownerConfirmationDeadline: { $lt: now }
      }).session(session);

      console.log(`🕐 Tìm thấy ${expiredOrders.length} đơn hàng quá deadline`);

      for (const masterOrder of expiredOrders) {
        const subOrders = await SubOrder.find({
          masterOrder: masterOrder._id,
          status: 'PENDING_OWNER_CONFIRMATION'
        }).session(session);

        for (const subOrder of subOrders) {
          let hasRejection = false;
          let rejectedAmount = 0;

          // Reject tất cả sản phẩm PENDING
          for (const productItem of subOrder.products) {
            if (productItem.confirmationStatus === 'PENDING') {
              productItem.confirmationStatus = 'REJECTED';
              productItem.rejectedAt = now;
              productItem.rejectionReason = 'Quá thời hạn xác nhận';

              const itemAmount =
                (productItem.totalRental || 0) +
                (productItem.totalDeposit || 0) +
                (productItem.totalShippingFee || 0);
              rejectedAmount += itemAmount;
              hasRejection = true;
            }
          }

          if (hasRejection) {
            // Cập nhật trạng thái SubOrder
            const confirmedCount = subOrder.products.filter(
              (p) => p.confirmationStatus === 'CONFIRMED'
            ).length;

            if (confirmedCount > 0) {
              subOrder.status = 'PARTIALLY_CONFIRMED';
            } else {
              subOrder.status = 'OWNER_REJECTED';
            }

            subOrder.ownerConfirmation = {
              status: 'REJECTED',
              rejectedAt: now,
              rejectionReason: 'Quá thời hạn xác nhận'
            };

            await subOrder.save({ session });

            // Hoàn tiền
            if (rejectedAmount > 0) {
              await this.refundRejectedProducts(
                masterOrder,
                subOrder,
                rejectedAmount,
                'Quá thời hạn xác nhận',
                session
              );
            }
          }
        }

        // Cập nhật MasterOrder
        await this.updateMasterOrderConfirmationSummary(masterOrder._id, session);
        await this.updateMasterOrderStatus(masterOrder._id, session);
      }

      await session.commitTransaction();
      session.endSession();

      console.log('✅ Đã tự động reject các sản phẩm quá deadline');
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('❌ Error in autoRejectExpiredPendingProducts:', error);
      throw error;
    }
  }

  /**
   * Renter từ chối SubOrder đã được partial confirm
   * - Hủy toàn bộ SubOrder
   * - Hoàn tiền 100% (cả sản phẩm đã confirm)
   * - Cập nhật MasterOrder status
   */
  async renterRejectSubOrder(subOrderId, renterId, reason) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log('📦 Renter reject SubOrder:', {
        subOrderId,
        renterId,
        reason
      });

      // Tìm SubOrder và validate
      const subOrder = await SubOrder.findById(subOrderId).populate('masterOrder').session(session);

      if (!subOrder) {
        throw new Error('Không tìm thấy SubOrder');
      }

      // Kiểm tra quyền
      if (subOrder.masterOrder.renter.toString() !== renterId) {
        throw new Error('Bạn không có quyền hủy SubOrder này');
      }

      // Chỉ cho phép reject nếu status là PARTIALLY_CONFIRMED
      if (subOrder.status !== 'PARTIALLY_CONFIRMED') {
        throw new Error('Chỉ có thể từ chối SubOrder đã được xác nhận một phần');
      }

      // Tính tổng số tiền cần hoàn (bao gồm cả sản phẩm đã confirm)
      const totalRefund =
        (subOrder.pricing?.subtotalRental || 0) +
        (subOrder.pricing?.subtotalDeposit || 0) +
        (subOrder.pricing?.shippingFee || 0);

      console.log('💰 Total refund amount:', totalRefund);

      // Cập nhật trạng thái SubOrder
      subOrder.status = 'RENTER_REJECTED';
      subOrder.renterRejection = {
        rejectedAt: new Date(),
        reason: reason || 'Không đồng ý với số lượng sản phẩm đã xác nhận'
      };

      // Đánh dấu tất cả sản phẩm là REJECTED
      for (const productItem of subOrder.products) {
        if (productItem.confirmationStatus !== 'REJECTED') {
          productItem.confirmationStatus = 'REJECTED';
          productItem.rejectedAt = new Date();
          productItem.rejectionReason = reason || 'Người thuê từ chối SubOrder';
        }
      }

      await subOrder.save({ session });

      // Hoàn tiền vào ví
      if (totalRefund > 0) {
        await this.refundRejectedProducts(
          subOrder.masterOrder,
          subOrder,
          totalRefund,
          reason || 'Người thuê từ chối SubOrder',
          session
        );
      }

      // Cập nhật MasterOrder
      const masterOrder = subOrder.masterOrder;
      await this.updateMasterOrderConfirmationSummary(masterOrder._id, session);
      await this.updateMasterOrderStatus(masterOrder._id, session);

      // Gửi thông báo cho owner
      await this.sendPartialConfirmationNotification(subOrder, masterOrder, 'RENTER_REJECTED');

      await session.commitTransaction();
      session.endSession();

      console.log('✅ Đã từ chối SubOrder và hoàn tiền thành công');

      return {
        subOrder,
        refundAmount: totalRefund
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('❌ Error in renterRejectSubOrder:', error);
      throw error;
    }
  }
}

module.exports = new RentalOrderService();
