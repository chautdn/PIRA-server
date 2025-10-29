const Order = require('../models/Order');
const Contract = require('../models/Contract');
const Product = require('../models/Product');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Signature = require('../models/Signature');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../core/error');
const { generateContractPDF, generateContractHTML } = require('../utils/contractGenerator');

class RentalService {
  // Tạo đơn thuê mới
  async createRentalOrder(rentalData) {
    try {
      const { renter, product: productId, rental, delivery, paymentMethod, notes } = rentalData;

      // Kiểm tra sản phẩm có sẵn
      const product = await Product.findById(productId).populate('owner');
      if (!product) {
        throw new BadRequestError('Sản phẩm không tồn tại');
      }

      if (!product.availability?.isAvailable || product.status !== 'ACTIVE') {
        throw new BadRequestError('Sản phẩm hiện không có sẵn để thuê');
      }

      if (product.owner._id.toString() === renter.toString()) {
        throw new BadRequestError('Không thể thuê sản phẩm của chính mình');
      }

      // Tính toán giá thuê
      const pricing = this.calculateRentalPricing(product, rental);

      // Tạo số đơn hàng
      const orderNumber = await Order.generateOrderNumber();

      // Tạo đơn hàng
      const order = new Order({
        orderNumber,
        renter,
        owner: product.owner._id,
        product: productId,
        rental: {
          ...rental,
          duration: this.calculateDuration(rental.startDate, rental.endDate)
        },
        pricing,
        paymentMethod,
        delivery,
        notes,
        status: 'PENDING'
      });

      const savedOrder = await order.save();

      return {
        order: await Order.findById(savedOrder._id)
          .populate('renter', 'fullName email phone profile')
          .populate('owner', 'fullName email phone profile')
          .populate('product')
      };
    } catch (error) {
      throw error;
    }
  }

  // Xác nhận đơn thuê và tạo hợp đồng (chủ sở hữu)
  async confirmRentalOrder(orderId, ownerId) {
    try {
      const order = await Order.findById(orderId)
        .populate('renter', 'fullName email phone profile')
        .populate('owner', 'fullName email phone profile')
        .populate('product');

      if (!order) {
        throw new NotFoundError('Đơn hàng không tồn tại');
      }

      if (order.owner._id.toString() !== ownerId.toString()) {
        throw new ForbiddenError('Không có quyền xác nhận đơn hàng này');
      }

      if (order.status !== 'PENDING') {
        throw new BadRequestError('Đơn hàng không thể xác nhận');
      }

      // Kiểm tra nếu sản phẩm có giá trị cao cần hợp đồng
      const requiresContract = this.requiresContract(order.product, order.pricing.total);

      if (requiresContract) {
        // Tạo hợp đồng điện tử
        const contract = await this.createEContract(order);

        order.contract = contract._id;
        order.status = 'CONTRACT_PENDING';
      } else {
        order.status = 'CONFIRMED';
      }

      order.confirmedAt = new Date();
      await order.save();

      return {
        order: await Order.findById(orderId)
          .populate('renter', 'fullName email phone profile')
          .populate('owner', 'fullName email phone profile')
          .populate('product')
          .populate('contract'),
        requiresContract
      };
    } catch (error) {
      throw error;
    } finally {
    }
  }

  // Kiểm tra xem có cần hợp đồng không
  requiresContract(product, totalAmount) {
    // Sản phẩm có giá trị >= 10 triệu VND cần hợp đồng
    const HIGH_VALUE_THRESHOLD = 10000000;

    // Hoặc sản phẩm thuộc danh mục cần hợp đồng
    const CATEGORIES_REQUIRE_CONTRACT = ['electronics', 'vehicles', 'machinery', 'jewelry'];

    return (
      totalAmount >= HIGH_VALUE_THRESHOLD ||
      CATEGORIES_REQUIRE_CONTRACT.includes(product.category?.slug)
    );
  }

  // Tạo hợp đồng điện tử
  async createEContract(order) {
    const contractNumber = await Contract.generateContractNumber();

    // Tạo nội dung hợp đồng
    const contractHTML = await generateContractHTML(order);
    const contractPDF = await generateContractPDF(contractHTML);

    const contract = new Contract({
      contractNumber,
      order: order._id,
      owner: order.owner._id,
      renter: order.renter._id,
      product: order.product._id,
      terms: {
        startDate: order.rental.startDate,
        endDate: order.rental.endDate,
        rentalRate: order.pricing.rentalRate,
        deposit: order.pricing.deposit,
        totalAmount: order.pricing.total,
        lateReturnPenalty: order.pricing.rentalRate * 1.5, // 150% giá thuê/ngày
        damagePenalty: order.pricing.deposit * 0.5 // 50% tiền cọc
      },
      content: {
        htmlContent: contractHTML,
        pdfUrl: contractPDF,
        templateVersion: '1.0'
      },
      status: 'PENDING_OWNER',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 ngày
    });

    const savedContract = await contract.save();
    return savedContract;
  }

  // Ký hợp đồng điện tử
  async signContract(contractId, userId, signatureData, ipAddress) {
    try {
      const contract = await Contract.findById(contractId)
        .populate('order')
        .populate('owner', 'fullName email')
        .populate('renter', 'fullName email');

      if (!contract) {
        throw new NotFoundError('Hợp đồng không tồn tại');
      }

      if (contract.status === 'SIGNED') {
        throw new BadRequestError('Hợp đồng đã được ký đầy đủ');
      }

      // Kiểm tra quyền ký
      const isOwner = contract.owner._id.toString() === userId.toString();
      const isRenter = contract.renter._id.toString() === userId.toString();

      if (!isOwner && !isRenter) {
        throw new ForbiddenError('Không có quyền ký hợp đồng này');
      }

      // Lưu chữ ký vào database
      await this.saveUserSignature(userId, signatureData);

      // Ký hợp đồng
      await contract.signContract(userId, signatureData, ipAddress);

      // Cập nhật trạng thái đơn hàng nếu hợp đồng đã ký đầy đủ
      if (contract.isFullySigned) {
        const order = await Order.findById(contract.order._id);
        order.status = 'CONTRACT_SIGNED';
        await order.save();

        // Gửi thông báo cho cả hai bên
        // await this.sendContractCompletedNotification(contract);
      }

      return {
        contract,
        isFullySigned: contract.isFullySigned,
        nextSigner: contract.isFullySigned ? null : isOwner ? 'renter' : 'owner'
      };
    } catch (error) {
      throw error;
    } finally {
    }
  }

  // Lưu chữ ký người dùng
  async saveUserSignature(userId, signatureData) {
    // Kiểm tra xem đã có chữ ký chưa
    let signature = await Signature.findOne({ user: userId, isActive: true });

    if (signature) {
      // Cập nhật chữ ký hiện tại
      signature.signatureData = signatureData;
      signature.metadata.timestamp = new Date();
      await signature.use();
    } else {
      // Tạo chữ ký mới
      signature = new Signature({
        user: userId,
        signatureData: signatureData,
        metadata: {
          timestamp: new Date(),
          format: 'image/png'
        }
      });
      await signature.save();
    }

    return signature;
  }

  // Xử lý thanh toán
  async processPayment(orderId, paymentData) {
    try {
      const order = await Order.findById(orderId).populate('renter owner product');
      if (!order) {
        throw new NotFoundError('Đơn hàng không tồn tại');
      }

      // Kiểm tra trạng thái đơn hàng
      const validStatuses = ['CONFIRMED', 'CONTRACT_SIGNED'];
      if (!validStatuses.includes(order.status)) {
        throw new BadRequestError('Đơn hàng không ở trạng thái có thể thanh toán');
      }

      let paymentResult;

      switch (order.paymentMethod) {
        case 'WALLET':
          paymentResult = await this.processWalletPayment(order);
          break;
        case 'BANK_TRANSFER':
          paymentResult = await this.processBankTransferPayment(order, paymentData);
          break;
        case 'CASH_ON_DELIVERY':
          paymentResult = await this.processCODPayment(order);
          break;
        default:
          throw new Error('Phương thức thanh toán không hợp lệ');
      }

      if (paymentResult.success) {
        order.status = 'PAID';
        order.paymentStatus = 'PAID';
        await order.save();

        // Activate contract if exists
        if (order.contract) {
          await Contract.findByIdAndUpdate(order.contract, { status: 'ACTIVE', isActive: true });
        }
      }

      return paymentResult;
    } catch (error) {
      throw error;
    } finally {
    }
  }

  // Bắt đầu thời gian thuê
  async startRental(orderId, userId) {
    try {
      const order = await Order.findById(orderId).populate('product');
      if (!order) {
        throw new Error('Đơn hàng không tồn tại');
      }

      // Kiểm tra quyền
      if (
        order.renter.toString() !== userId.toString() &&
        order.owner.toString() !== userId.toString()
      ) {
        throw new Error('Không có quyền thực hiện thao tác này');
      }

      if (order.status !== 'DELIVERED') {
        throw new Error('Chỉ có thể bắt đầu thuê khi sản phẩm đã được giao');
      }

      // Cập nhật thời gian bắt đầu thuê thực tế
      order.rental.actualStartDate = new Date();
      order.status = 'ACTIVE';
      await order.save();

      // Cập nhật sản phẩm
      await Product.findByIdAndUpdate(order.product._id, {
        status: 'RENTED',
        'availability.isAvailable': false
      });

      return order;
    } catch (error) {
      throw error;
    } finally {
    }
  }

  // Trả sản phẩm
  async returnProduct(orderId, userId, returnData = {}) {
    try {
      const order = await Order.findById(orderId).populate('product contract');
      if (!order) {
        throw new Error('Đơn hàng không tồn tại');
      }

      if (order.status !== 'ACTIVE') {
        throw new Error('Đơn hàng không đang trong trạng thái thuê');
      }

      // Cập nhật thời gian trả thực tế
      order.rental.actualEndDate = new Date();
      order.status = 'RETURNED';

      // Tính toán phí phụ (nếu trả muộn)
      const additionalCharges = this.calculateAdditionalCharges(order);
      order.additionalCharges = additionalCharges;

      await order.save();

      // Xử lý hoàn tiền cọc
      await this.processDepositRefund(order, additionalCharges);

      // Cập nhật trạng thái sản phẩm
      await Product.findByIdAndUpdate(order.product._id, {
        status: 'ACTIVE',
        'availability.isAvailable': true
      });

      // Cập nhật hợp đồng
      if (order.contract) {
        await Contract.findByIdAndUpdate(order.contract._id, {
          status: 'COMPLETED',
          isActive: false
        });
      }

      return { order, additionalCharges };
    } catch (error) {
      throw error;
    } finally {
    }
  }

  // Helper methods
  calculateRentalPricing(product, rental) {
    const startDate = new Date(rental.startDate);
    const endDate = new Date(rental.endDate);
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    let rentalRate = product.pricing?.dailyRate || 100000;
    let subtotal = rentalRate * days;

    // Áp dụng giá theo tuần/tháng nếu có
    if (days >= 30 && product.pricing?.monthlyRate) {
      const months = Math.floor(days / 30);
      const remainingDays = days % 30;
      subtotal = months * product.pricing.monthlyRate + remainingDays * product.pricing.dailyRate;
    } else if (days >= 7 && product.pricing?.weeklyRate) {
      const weeks = Math.floor(days / 7);
      const remainingDays = days % 7;
      subtotal = weeks * product.pricing.weeklyRate + remainingDays * product.pricing.dailyRate;
    }

    const deposit = product.pricing?.deposit?.amount || subtotal * 0.3; // 30% tổng tiền thuê
    const deliveryFee = product.location?.deliveryOptions?.deliveryFee || 0;
    const total = subtotal + deposit + deliveryFee;

    return {
      rentalRate,
      subtotal,
      deposit,
      deliveryFee,
      total
    };
  }

  calculateDuration(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (days >= 30) {
      return { value: Math.ceil(days / 30), unit: 'MONTH' };
    } else if (days >= 7) {
      return { value: Math.ceil(days / 7), unit: 'WEEK' };
    } else {
      return { value: days, unit: 'DAY' };
    }
  }

  calculateAdditionalCharges(order) {
    const actualEnd = order.rental.actualEndDate;
    const plannedEnd = new Date(order.rental.endDate);

    let overtime = { days: 0, amount: 0 };
    let damages = { description: '', amount: 0 };

    if (actualEnd > plannedEnd) {
      const overdueDays = Math.ceil((actualEnd - plannedEnd) / (1000 * 60 * 60 * 24));
      const overdueRate = order.pricing.rentalRate * 1.5; // Phí phạt 150% giá thuê
      overtime = {
        days: overdueDays,
        amount: overdueDays * overdueRate
      };
    }

    return {
      overtime,
      damages,
      total: overtime.amount + damages.amount
    };
  }

  async processWalletPayment(order) {
    const wallet = await Wallet.findOne({ user: order.renter });
    if (!wallet) {
      throw new NotFoundError('Ví không tồn tại');
    }

    if (wallet.balance.available < order.pricing.total) {
      throw new BadRequestError('Số dư ví không đủ');
    }

    // Trừ tiền từ ví người thuê
    wallet.balance.available -= order.pricing.total;
    wallet.balance.frozen += order.pricing.deposit; // Đóng băng tiền cọc
    await wallet.save();

    // Tạo giao dịch thanh toán
    const payment = new Payment({
      order: order._id,
      payer: order.renter,
      payee: order.owner,
      amount: order.pricing.total,
      method: 'WALLET',
      status: 'COMPLETED',
      transactionType: 'RENTAL_PAYMENT'
    });
    await payment.save();

    return { success: true, payment };
  }

  async processBankTransferPayment(order, paymentData) {
    // Xử lý thanh toán chuyển khoản
    const payment = new Payment({
      order: order._id,
      payer: order.renter,
      payee: order.owner,
      amount: order.pricing.total,
      method: 'BANK_TRANSFER',
      status: 'PENDING',
      transactionType: 'RENTAL_PAYMENT',
      bankTransfer: paymentData
    });
    await payment.save();

    return { success: true, payment, requiresVerification: true };
  }

  async processDepositRefund(order, additionalCharges) {
    const refundAmount = order.pricing.deposit - additionalCharges.total;

    if (refundAmount > 0) {
      // Hoàn tiền cọc
      const wallet = await Wallet.findOne({ user: order.renter });
      if (wallet) {
        wallet.balance.available += refundAmount;
        wallet.balance.frozen -= order.pricing.deposit;
        await wallet.save();

        // Tạo giao dịch hoàn tiền
        const refund = new Payment({
          order: order._id,
          payer: order.owner,
          payee: order.renter,
          amount: refundAmount,
          method: 'WALLET',
          status: 'COMPLETED',
          transactionType: 'DEPOSIT_REFUND'
        });
        await refund.save();
      }
    }
  }
}

module.exports = new RentalService();
