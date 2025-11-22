const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Contract = require('../models/Contract');
const VietMapService = require('./vietmap.service');
const mongoose = require('mongoose');

class RentalOrderService {
    /**
     * Người thuê hủy SubOrder (sau khi chủ đã xác nhận)
     */
    async renterCancelSubOrder(subOrderId, renterId, reason) {
      // Tìm subOrder thuộc về renter và trạng thái OWNER_CONFIRMED
      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        status: 'OWNER_CONFIRMED'
      }).populate('masterOrder');

      if (!subOrder) {
        throw new Error('Không tìm thấy SubOrder hoặc trạng thái không hợp lệ');
      }
      // Kiểm tra quyền
      if (subOrder.masterOrder.renter.toString() !== renterId) {
        throw new Error('Không có quyền hủy SubOrder này');
      }

      subOrder.status = 'CANCELLED';
      subOrder.cancellation = {
        cancelledBy: renterId,
        cancelledAt: new Date(),
        reason
      };
      await subOrder.save();

      // TODO: Trả sản phẩm về cart (thực hiện ở phía client)

      // Nếu tất cả suborders đều CANCELLED/OWNER_REJECTED thì cập nhật masterOrder
      if (subOrder.masterOrder) {
        const allSubOrders = await SubOrder.find({ masterOrder: subOrder.masterOrder._id });
        const allCancelledOrRejected = allSubOrders.every(
          (so) => so.status === 'CANCELLED' || so.status === 'OWNER_REJECTED'
        );
        if (allCancelledOrRejected) {
          subOrder.masterOrder.status = 'CANCELLED';
          await subOrder.masterOrder.save();
        }
      }

      return subOrder;
    }
  /**
   * Bước 1: Tạo đơn thuê tạm từ giỏ hàng (Draft Order)
   */
  async createDraftOrderFromCart(renterId, orderData) {
    console.log('🚀 Creating draft order for renter:', renterId);
    console.log('📋 Order data:', JSON.stringify(orderData, null, 2));

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

      console.log('📦 Cart found with items:', cart.items.length);

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
        if (startDate < new Date()) {
          throw new Error(
            `Thời gian bắt đầu thuê không thể trong quá khứ cho sản phẩm "${item.product.title || item.product.name}" "${startDate.toISOString().split('T')[0]}"`
          );
        }
      }

      // Nhóm sản phẩm theo chủ sở hữu
      console.log(
        '🛒 Original cart items:',
        cart.items.map((item, index) => ({
          index,
          productId: item.product._id,
          productName: item.product.title || item.product.name,
          quantity: item.quantity,
          rental: item.rental,
          ownerId: item.product.owner._id
        }))
      );

      const productsByOwner = this.groupProductsByOwner(cart.items);

      console.log(
        '👥 Products grouped by owner:',
        Object.keys(productsByOwner).map((ownerId) => ({
          ownerId,
          itemCount: productsByOwner[ownerId].length,
          items: productsByOwner[ownerId].map((item, index) => ({
            index,
            productId: item.product._id,
            quantity: item.quantity,
            rental: item.rental
          }))
        }))
      );

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
        // Treat OWNER_DELIVERY similarly to DELIVERY for shipping calculations
        if ((deliveryMethod === 'DELIVERY' || deliveryMethod === 'OWNER_DELIVERY') && owner.profile.address) {
          const shippingInfo = await this.calculateShippingFee(
            owner.profile.address,
            deliveryAddress
          );

          subOrder.shipping = {
            ...subOrder.shipping,
            ...shippingInfo
          };
          subOrder.pricing.shippingFee = shippingInfo.fee.totalFee;
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
      paymentMessage
    } = orderData;

    try {
      console.log('🚀 Creating paid order for renter:', renterId);
      console.log('💳 Payment method:', paymentMethod);
      console.log('💰 Total amount:', totalAmount);

      // First create draft order using existing method
      const draftOrder = await this.createDraftOrderFromCart(renterId, {
        rentalPeriod,
        deliveryAddress,
        deliveryMethod
      });

      if (!draftOrder || !draftOrder._id) {
        throw new Error('Không thể tạo đơn hàng draft');
      }

      console.log('✅ Draft order created:', draftOrder._id);

      // Process payment based on method
      console.log('💳 Processing payment with method:', paymentMethod);
      const paymentResult = await this.processPaymentForOrder(draftOrder._id, {
        method: paymentMethod,
        amount: totalAmount,
        transactionId:
          paymentTransactionId || `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        message: paymentMessage
      });

      // Check payment result
      if (paymentResult.status === 'FAILED') {
        throw new Error(`Thanh toán thất bại: ${paymentResult.error || 'Unknown error'}`);
      }

      // Update order status based on payment method
      draftOrder.status = 'PENDING_CONFIRMATION';
      draftOrder.paymentMethod = paymentMethod;
      draftOrder.paymentInfo = paymentResult;

      // Set payment status based on method
      if (paymentMethod === 'COD') {
        draftOrder.paymentStatus = 'PENDING'; // Will be paid on delivery
      } else {
        draftOrder.paymentStatus = 'PAID'; // Immediate payment methods
      }

      await draftOrder.save();

      // Update all SubOrders to PENDING_OWNER_CONFIRMATION
      await SubOrder.updateMany(
        { masterOrder: draftOrder._id },
        { status: 'PENDING_OWNER_CONFIRMATION' }
      );

      console.log('✅ Paid order created successfully with status PENDING_CONFIRMATION');

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
    console.log(`💳 Processing ${method} payment for order:`, masterOrderId);
    console.log('💰 Amount:', amount);

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
      console.log('💳 Processing wallet payment - deducting from user wallet');
      console.log('💰 Amount to deduct:', amount);

      // Get master order to find user
      const MasterOrder = require('../models/MasterOrder');
      const User = require('../models/User');
      const Wallet = require('../models/Wallet');

      const masterOrder = await MasterOrder.findById(masterOrderId).populate('renter');
      if (!masterOrder) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      const userId = masterOrder.renter._id;
      console.log('👤 Processing payment for user:', userId);

      // Get user's wallet
      const user = await User.findById(userId).populate('wallet');
      if (!user || !user.wallet) {
        throw new Error('Không tìm thấy ví của người dùng');
      }

      const wallet = user.wallet;
      console.log('💳 Current wallet balance:', wallet.balance.available);

      // Check if wallet has sufficient balance
      if (wallet.balance.available < amount) {
        throw new Error(
          `Ví không đủ số dư. Số dư hiện tại: ${wallet.balance.available.toLocaleString('vi-VN')}đ, cần: ${amount.toLocaleString('vi-VN')}đ`
        );
      }

      // Deduct amount from wallet
      wallet.balance.available -= amount;
      await wallet.save();

      console.log('✅ Wallet payment successful');
      console.log('💳 New wallet balance:', wallet.balance.available);

      return {
        transactionId: transactionId,
        method: 'WALLET',
        amount: amount,
        status: 'SUCCESS',
        processedAt: new Date(),
        paymentDetails: {
          previousBalance: wallet.balance.available + amount,
          newBalance: wallet.balance.available,
          deductedAmount: amount,
          walletId: wallet._id,
          message: 'Thanh toán từ ví thành công'
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

    console.log(`💳 Processing PayOS payment (${method})`);

    // TODO: Integrate with PayOS API
    // Mock PayOS payment processing
    const payosResult = {
      paymentUrl: `https://payos.vn/payment/${transactionId}`,
      qrCode: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`,
      status: 'SUCCESS'
    };

    return {
      transactionId: transactionId,
      method: method,
      amount: amount,
      status: 'SUCCESS',
      processedAt: new Date(),
      paymentDetails: {
        payosResult: payosResult,
        message: `Thanh toán ${method} qua PayOS thành công`
      }
    };
  }

  /**
   * Process COD payment - cash on delivery
   */
  async processCODPayment(masterOrderId, paymentData) {
    const { transactionId, amount } = paymentData;

    console.log('💵 Processing COD payment - no immediate payment required');

    return {
      transactionId: transactionId,
      method: 'COD',
      amount: amount,
      status: 'PENDING',
      processedAt: new Date(),
      paymentDetails: {
        message: 'Thanh toán khi nhận hàng',
        note: 'Khách hàng sẽ thanh toán bằng tiền mặt khi nhận sản phẩm'
      }
    };
  }

  /**
   * Process refund when order is rejected by owner
   */
  async processRefundForRejectedOrder(masterOrderId, subOrderId, rejectionReason) {
    try {
      console.log('💸 Processing refund for rejected order:', {
        masterOrderId,
        subOrderId,
        rejectionReason
      });

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
        console.log('💸 All suborders rejected - processing full refund');

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

        console.log('✅ Full refund processed successfully:', refundResult);
      } else {
        // Partial refund for specific suborder
        console.log('💸 Partial refund for specific suborder');

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

        console.log('✅ Partial refund processed successfully:', refundResult);
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
      console.log('[DEBUG] ownerConfirmOrder called:', { subOrderId, ownerId, confirmationData });
    // Accept subOrder in either PENDING_OWNER_CONFIRMATION or DRAFT (for legacy/auto-promotion)
    const subOrder = await SubOrder.findOne({
      _id: subOrderId,
      owner: ownerId,
      status: { $in: ['PENDING_OWNER_CONFIRMATION', 'DRAFT'] }
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
      await subOrder.save();
    } else if (status === 'REJECTED') {
      subOrder.ownerConfirmation = {
        status: 'OWNER_REJECTED',
        rejectedAt: new Date(),
        rejectionReason,
        notes
      };
      subOrder.status = 'OWNER_REJECTED';
      await subOrder.save();
      await this.processRefundForRejectedOrder(
        subOrder.masterOrder._id,
        subOrderId,
        rejectionReason
      );
    } else {
      await subOrder.save();
    }

    // Update MasterOrder status if needed
    if (subOrder.masterOrder) {
      console.log('[DEBUG] subOrder.masterOrder found:', subOrder.masterOrder._id);
      try {
        const allSubOrders = await SubOrder.find({ masterOrder: subOrder.masterOrder._id });
        console.log('[DEBUG] allSubOrders:', allSubOrders.map(so => ({ id: so._id, status: so.status })));
        const allConfirmedOrRejected = allSubOrders.every(
          (so) => so.status === 'OWNER_CONFIRMED' || so.status === 'OWNER_REJECTED'
        );

        // Only update master status if all SubOrders have been confirmed/rejected
          if (allConfirmedOrRejected) {
            const hasRejected = allSubOrders.some((so) => so.status === 'OWNER_REJECTED');
            const allConfirmed = allSubOrders.every((so) => so.status === 'OWNER_CONFIRMED');
            console.log('[DEBUG] allConfirmedOrRejected:', allConfirmedOrRejected, 'hasRejected:', hasRejected, 'allConfirmed:', allConfirmed);
            const masterOrder = await MasterOrder.findById(subOrder.masterOrder._id);

            if (masterOrder) {
              console.log('[DEBUG] masterOrder before status update:', masterOrder.status);
              if (hasRejected) {
                console.log('[DEBUG] Setting masterOrder.status = CANCELLED');
                masterOrder.status = 'CANCELLED';
              } else if (allConfirmed) {
                console.log('[DEBUG] Setting masterOrder.status = READY_FOR_CONTRACT');
                masterOrder.status = 'READY_FOR_CONTRACT';
              } else {
                console.log('[DEBUG] Setting masterOrder.status = PENDING_CONFIRMATION');
                masterOrder.status = 'PENDING_CONFIRMATION';
              }
              await masterOrder.save();
              console.log('[DEBUG] masterOrder after status update:', masterOrder.status);
              console.log(`[SYNC] MasterOrder ${masterOrder._id} status updated to ${masterOrder.status} after all owners confirmed/rejected.`);
            }
          }
      } catch (err) {
        console.error('Error updating master order after owner confirm:', err);
      }
    }

    return subOrder;
  }

  /**
   * Người thuê xác nhận SubOrder (sau khi chủ xác nhận)
   */
  async renterConfirmOrder(subOrderId, renterId, confirmationData) {
    const subOrder = await SubOrder.findById(subOrderId).populate('masterOrder owner products.product');

    if (!subOrder) {
      throw new Error('Không tìm thấy SubOrder');
    }

    // Kiểm tra quyền: chỉ renter của masterOrder mới được confirm
    const masterOrder = await MasterOrder.findById(subOrder.masterOrder);
    if (!masterOrder) {
      throw new Error('Không tìm thấy MasterOrder liên kết');
    }

    if (masterOrder.renter.toString() !== renterId.toString()) {
      throw new Error('Không có quyền xác nhận SubOrder này');
    }

    const { status, notes } = confirmationData || {};

    // Chỉ cho phép renter xác nhận (không có trạng thái REJECTED từ renter ở hiện tại)
    subOrder.renterConfirmation = {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      notes
    };

    // Nếu chủ đã xác nhận trước đó thì đưa SubOrder sang READY_FOR_CONTRACT
    if (subOrder.ownerConfirmation && subOrder.ownerConfirmation.status === 'CONFIRMED') {
      subOrder.status = 'READY_FOR_CONTRACT';

      // Nếu chưa có hợp đồng, tạo hợp đồng cho SubOrder
      if (!subOrder.contract) {
        await this.generateContractForSubOrder(subOrder);
      }
    }

    await subOrder.save();

    // If all suborders are ready, update master order status
    try {
      const allSubOrders = await SubOrder.find({ masterOrder: masterOrder._id });
      const allReady = allSubOrders.every((so) => so.status === 'READY_FOR_CONTRACT' || so.status === 'CONTRACT_SIGNED');
      if (allReady) {
        masterOrder.status = 'READY_FOR_CONTRACT';
        await masterOrder.save();
      }
    } catch (err) {
      console.error('Error while updating master order after renter confirm:', err);
    }

    return subOrder;
  }

  /**
   * Bước 5: Tạo hợp đồng điện tử
   */
  async generateContract(masterOrderId) {
    console.log('🔍 Generating contract for MasterOrder ID:', masterOrderId);

    // First, check if MasterOrder exists at all (without status filter)
    let existingOrder = await MasterOrder.findById(masterOrderId).populate('subOrders');
    console.log(
      '🔍 MasterOrder exists:',
      existingOrder
        ? {
            id: existingOrder._id,
            status: existingOrder.status,
            subOrdersCount: existingOrder.subOrders?.length,
            subOrderStatuses: existingOrder.subOrders?.map((so) => ({
              id: so._id,
              status: so.status
            }))
          }
        : 'DOES NOT EXIST'
    );

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

    console.log(
      '📋 Found MasterOrder:',
      masterOrder
        ? {
            id: masterOrder._id,
            status: masterOrder.status,
            subOrdersCount: masterOrder.subOrders?.length,
            subOrderStatuses: masterOrder.subOrders?.map((so) => ({
              id: so._id,
              status: so.status
            }))
          }
        : 'NOT FOUND'
    );

    if (!masterOrder) {
      throw new Error('Đơn hàng không hợp lệ để tạo hợp đồng');
    }

    // Check if all SubOrders are confirmed
    const allConfirmed = masterOrder.subOrders.every(
      (subOrder) => subOrder.status === 'OWNER_CONFIRMED'
    );

    console.log('✅ SubOrders confirmation check:', {
      allConfirmed,
      subOrderStatuses: masterOrder.subOrders.map((so) => ({
        id: so._id,
        status: so.status,
        isConfirmed: so.status === 'OWNER_CONFIRMED'
      }))
    });

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
      console.log('✅ MasterOrder status updated to READY_FOR_CONTRACT during contract generation');
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

    // Cập nhật chữ ký
    if (isOwner) {
      contract.signatures.owner = {
        signedAt: new Date(),
        signatureData,
        ipAddress: signatureData.ipAddress,
        userAgent: signatureData.userAgent
      };
    }

    if (isRenter) {
      contract.signatures.renter = {
        signedAt: new Date(),
        signatureData,
        ipAddress: signatureData.ipAddress,
        userAgent: signatureData.userAgent
      };
    }

    // Kiểm tra nếu đã có đủ chữ ký
    if (contract.signatures.owner.signedAt && contract.signatures.renter.signedAt) {
      contract.status = 'SIGNED';
      contract.signedAt = new Date();

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
    console.log('🔍 calculateProductPricing input:', {
      productsCount: products.length,
      products: products.map((item, index) => ({
        index,
        productId: item.product._id || item.product,
        quantity: item.quantity,
        rental: item.rental
      }))
    });

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

      console.log(`📊 Processing item ${index}:`, {
        productId: product._id || product,
        quantity,
        itemRental: item.rental,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        calculatedDuration: durationDays
      });

      // Debug product pricing structure
      console.log(`💰 Product pricing debug:`, {
        productId: product._id,
        price: product.price,
        deposit: product.deposit,
        pricing: product.pricing,
        fullProduct: product
      });

      // Try multiple ways to get pricing
      const dailyRate =
        product.price || product.pricing?.dailyRate || product.pricing?.rentalPrice || 0;

      const depositRate =
        product.deposit || product.pricing?.deposit?.amount || product.pricing?.depositAmount || 0;

      console.log(`💵 Calculated rates:`, {
        dailyRate,
        depositRate,
        quantity,
        durationDays
      });

      const totalRental = dailyRate * durationDays * quantity;
      const totalDeposit = depositRate * quantity;

      console.log(`💸 Final amounts:`, {
        totalRental,
        totalDeposit
      });

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
        console.log('⚠️ Geocoding thất bại, sử dụng fallback coordinates');

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
          console.log(`🏠 Owner fallback: ${ownerCity} -> ${ownerLat}, ${ownerLon}`);
        }

        // Sử dụng fallback cho user
        if (!userLat || !userLon) {
          const userCity = deliveryAddress.city || deliveryAddress.province || 'Hồ Chí Minh';
          const fallback = fallbackCoords[userCity] || fallbackCoords['Hồ Chí Minh'];
          userLat = fallback.lat;
          userLon = fallback.lon;
          console.log(`🚚 User fallback: ${userCity} -> ${userLat}, ${userLon}`);
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
        console.log('⚠️ VietMap distance API thất bại, sử dụng haversine fallback');

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

        console.log(
          `📏 Fallback distance: ${distanceResult.distanceKm}km, ${distanceResult.duration}min`
        );
      }

      // Tính phí ship
      const shippingFee = VietMapService.calculateShippingFee(distanceResult.distanceKm);

      console.log('📦 Calculated shipping fee:', shippingFee);

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
    console.log('[DEBUG] checkAllSubOrdersConfirmed called:', { masterOrderId });
    const subOrders = await SubOrder.find({ masterOrder: masterOrderId });
    console.log('[DEBUG] subOrders:', subOrders.map(so => ({ id: so._id, status: so.status })));

    // Only set READY_FOR_CONTRACT if all suborders are READY_FOR_CONTRACT or CONTRACT_SIGNED
    const allReady = subOrders.every(
      (so) => so.status === 'READY_FOR_CONTRACT' || so.status === 'CONTRACT_SIGNED'
    );

    if (allReady) {
      await MasterOrder.findByIdAndUpdate(masterOrderId, {
        status: 'READY_FOR_CONTRACT'
      });
    }

    // If all suborders are confirmed or rejected, set to CANCELLED if any rejected, else set to PENDING_CONFIRMATION
    const allConfirmedOrRejected = subOrders.every(
      (so) => so.status === 'OWNER_CONFIRMED' || so.status === 'OWNER_REJECTED'
    );
    if (allConfirmedOrRejected) {
      const hasRejected = subOrders.some((so) => so.status === 'OWNER_REJECTED');
      if (hasRejected) {
        await MasterOrder.findByIdAndUpdate(masterOrderId, {
          status: 'CANCELLED'
        });
      } else {
        await MasterOrder.findByIdAndUpdate(masterOrderId, {
          status: 'PENDING_CONFIRMATION'
        });
      }
    }
  }

  async checkAllContractsSigned(masterOrderId) {
    const subOrders = await SubOrder.find({ masterOrder: masterOrderId });
    const allSigned = subOrders.every((so) => so.status === 'CONTRACT_SIGNED');

    if (allSigned) {
      await MasterOrder.findByIdAndUpdate(masterOrderId, {
        status: 'CONTRACT_SIGNED'
      });
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
   * Xác nhận SubOrder
   */
  async confirmSubOrder(subOrderId, ownerId) {
    console.log('✅ Confirming SubOrder (legacy endpoint):', subOrderId, 'by owner:', ownerId);

    try {
      // Find subOrder by id and owner without strict status filtering
      const subOrder = await SubOrder.findOne({ _id: subOrderId, owner: ownerId }).populate(
        'masterOrder'
      );

      if (!subOrder) {
        throw new Error('Không tìm thấy yêu cầu thuê hoặc không có quyền xác nhận');
      }

      // If there are still product items marked PENDING, mark them as CONFIRMED
      let changed = false;
      for (const item of subOrder.products) {
        if (item.confirmationStatus === 'PENDING') {
          item.confirmationStatus = 'CONFIRMED';
          item.confirmedAt = new Date();
          changed = true;
        }
      }

      subOrder.status = 'OWNER_CONFIRMED';
      subOrder.confirmedAt = new Date();

      if (changed) {
        console.log('🔁 Some product items were pending and are now marked CONFIRMED');
      }

      await subOrder.save();

      console.log('✅ SubOrder confirmed successfully (legacy flow)');

      // Sync master order status similar to ownerConfirmOrder
      if (subOrder.masterOrder) {
        try {
          const allSubOrders = await SubOrder.find({ masterOrder: subOrder.masterOrder._id });
          const allConfirmedOrRejected = allSubOrders.every(
            (so) => so.status === 'OWNER_CONFIRMED' || so.status === 'OWNER_REJECTED'
          );

          if (allConfirmedOrRejected) {
            const hasRejected = allSubOrders.some((so) => so.status === 'OWNER_REJECTED');
            const masterOrder = await MasterOrder.findById(subOrder.masterOrder._id);
            if (masterOrder) {
              if (hasRejected) {
                masterOrder.status = 'CANCELLED';
              } else {
                masterOrder.status = 'PENDING_CONFIRMATION';
              }
              await masterOrder.save();
            }
          }
        } catch (err) {
          console.error('Error updating master order after confirmSubOrder (legacy):', err);
        }
      }

      // Populate và trả về
      return await SubOrder.findById(subOrderId)
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.firstName profile.lastName phone email'
          }
        })
        .populate({ path: 'products.product', select: 'name images rentalPrice depositPercentage' });
    } catch (error) {
      console.error('❌ Error confirming SubOrder (legacy):', error);
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
}

module.exports = new RentalOrderService();
