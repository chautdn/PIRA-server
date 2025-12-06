const { PayOS } = require('@payos/node');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const mongoose = require('mongoose');

// Initialize PayOS at module level (v2 API)
const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY
});

// Constants
const MIN_AMOUNT = Number(process.env.MIN_TOPUP_AMOUNT) || 2000;
const MAX_AMOUNT = Number(process.env.MAX_TOPUP_AMOUNT) || 50000000;
const DAILY_LIMIT = Number(process.env.DAILY_TOPUP_LIMIT) || 100000000;

// Validate amount with business rules
const validateAmount = (amount) => {
  const numAmount = Number(amount);

  // Basic validation
  if (!numAmount || numAmount < MIN_AMOUNT) {
    throw new Error(`Amount must be at least ${MIN_AMOUNT.toLocaleString()} VND`);
  }

  if (numAmount > MAX_AMOUNT) {
    throw new Error(`Amount cannot exceed ${MAX_AMOUNT.toLocaleString()} VND`);
  }

  return numAmount;
};

// Check daily limit for user
const checkDailyLimit = async (userId, amount) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTopups = await Transaction.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        type: 'deposit',
        status: { $in: ['success', 'processing'] },
        createdAt: { $gte: today }
      }
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  const todayTotal = todayTopups[0]?.totalAmount || 0;
  if (todayTotal + amount > DAILY_LIMIT) {
    throw new Error(
      `Daily top-up limit exceeded. Remaining: ${(DAILY_LIMIT - todayTotal).toLocaleString()} VND`
    );
  }

  return {
    validAmount: amount,
    todayTotal,
    remainingDaily: DAILY_LIMIT - todayTotal - amount
  };
};

// Create payment session
const createTopUpSession = async (userId, amount, metadata = {}) => {
  try {
    // Validate amount
    const validAmount = validateAmount(amount);

    // Check daily limit
    const validation = await checkDailyLimit(userId, validAmount);

    // Get user and wallet (with auto-creation)
    let user = await User.findById(userId).populate('wallet');
    if (!user) throw new Error('User not found');

    // Auto-create wallet if it doesn't exist
    if (!user.wallet) {
      const Wallet = require('../models/Wallet');

      const wallet = new Wallet({
        user: userId,
        balance: {
          available: 0,
          frozen: 0,
          pending: 0
        },
        currency: 'VND',
        status: 'ACTIVE'
      });

      await wallet.save();

      // Update user with wallet reference
      await User.findByIdAndUpdate(userId, { wallet: wallet._id });

      // Reload user with wallet
      user = await User.findById(userId).populate('wallet');
    }

    // Generate unique order code
    const orderCode = Date.now();

    // Create pending transaction
    const transaction = new Transaction({
      user: userId,
      wallet: user.wallet._id,
      type: 'deposit',
      amount: validAmount,
      status: 'pending',
      externalId: orderCode.toString(),
      description: `Wallet top-up ${validAmount.toLocaleString('vi-VN')} VND`,
      metadata: {
        ...metadata,
        isCustomAmount: ![10000, 50000, 100000, 500000, 1000000].includes(validAmount),
        dailyTotal: validation.todayTotal,
        remainingDaily: validation.remainingDaily
      },
      expiredAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent
    });

    await transaction.save();

    // Create PayOS payment link
    const paymentData = {
      orderCode,
      amount: validAmount,
      description: `PIRA Top-up ${Math.round(validAmount / 1000)}k`, // Max 25 chars: "PIRA Top-up 50000k" = 18 chars
      returnUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/wallet/topup-success?orderCode=${orderCode}`,
      cancelUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/wallet/topup-cancel?orderCode=${orderCode}`
    };

    const paymentLink = await payos.paymentRequests.create(paymentData);

    // Update transaction with payment URL
    transaction.paymentUrl = paymentLink.checkoutUrl;
    await transaction.save();

    return {
      transaction: {
        id: transaction._id,
        orderCode,
        amount: validAmount,
        status: transaction.status,
        expiresAt: transaction.expiredAt
      },
      checkoutUrl: paymentLink.checkoutUrl,
      validation
    };
  } catch (error) {
    console.error('Payment session creation error:', error);
    throw new Error(`Failed to create payment session: ${error.message}`);
  }
};

// Process webhook (compatible with standalone MongoDB)
const processWebhook = async (webhookData) => {
  try {
    // Parse webhook data
    let parsedData = parseWebhookData(webhookData);

    // Verify webhook signature (optional for development)
    let verifiedData;
    try {
      verifiedData = await payos.webhooks.verify(parsedData);
    } catch (verifyError) {
      // Webhook verification failed, use raw data (development fallback)
      verifiedData = parsedData;
    }

    const orderCode = verifiedData.orderCode || verifiedData.orderId;
    const success =
      verifiedData.success || verifiedData.code === '00' || verifiedData.status === 'PAID';

    if (!orderCode) {
      throw new Error('No order code in webhook data');
    }

    // Find transaction (without session)
    const transaction = await Transaction.findOne({
      externalId: orderCode.toString()
    }).populate('user wallet');

    if (!transaction) {
      throw new Error(`Transaction not found for orderCode: ${orderCode}`);
    }

    // Prevent double processing
    if (transaction.status === 'success') {
      return { message: 'Transaction already processed', transaction };
    }

    let updatedTransaction;
    if (success) {
      // Update transaction status
      updatedTransaction = await Transaction.findByIdAndUpdate(
        transaction._id,
        {
          status: 'success',
          processedAt: new Date(),
          metadata: {
            ...transaction.metadata,
            webhookData: verifiedData
          }
        },
        { new: true }
      ).populate('user wallet');

      // Update wallet balance
      const wallet = await Wallet.findById(transaction.wallet._id);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      wallet.balance.available += transaction.amount;
      await wallet.save();

      // Emit real-time update if chat gateway available
      if (global.chatGateway) {
        global.chatGateway.emitWalletUpdate(transaction.user._id.toString(), {
          type: 'balance_updated',
          amount: transaction.amount,
          newBalance: wallet.balance.available,
          transactionId: transaction._id
        });
      }

      return { message: 'Payment processed successfully', transaction: updatedTransaction };
    } else {
      // Payment failed
      updatedTransaction = await Transaction.findByIdAndUpdate(
        transaction._id,
        {
          status: 'failed',
          lastError: verifiedData.desc || 'Payment failed',
          processedAt: new Date(),
          metadata: {
            ...transaction.metadata,
            webhookData: verifiedData,
            failureReason: verifiedData.desc
          }
        },
        { new: true }
      ).populate('user wallet');

      return { message: 'Payment failed', transaction: updatedTransaction };
    }
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    throw new Error(`Webhook processing failed: ${error.message}`);
  }
};

// Parse webhook data with multiple format support
const parseWebhookData = (data) => {
  if (Buffer.isBuffer(data)) {
    return JSON.parse(data.toString());
  }
  if (typeof data === 'string') {
    return JSON.parse(data);
  }
  return data;
};

// Verify payment status - AUTO-COMPLETE if PayOS shows PAID
const verifyPayment = async (orderCode, userId) => {
  try {
    const transaction = await Transaction.findOne({
      externalId: orderCode,
      user: userId
    }).populate('user wallet');

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Get PayOS status first
    let payosStatus = null;
    try {
      payosStatus = await payos.paymentRequests.get(Number(orderCode));
    } catch (payosError) {
      // PayOS verification failed, continue with database status
    }

    // ✅ AUTO-COMPLETE: If PayOS shows PAID but transaction is pending, complete it NOW
    if (payosStatus?.status === 'PAID' && transaction.status === 'pending') {
      // Update transaction to success
      await Transaction.findByIdAndUpdate(transaction._id, {
        status: 'success',
        processedAt: new Date()
      });

      // Update wallet balance
      const wallet = await Wallet.findById(transaction.wallet._id);
      wallet.balance.available += transaction.amount;
      await wallet.save();

      return {
        transaction: {
          id: transaction._id,
          status: 'success', // Return success immediately
          amount: transaction.amount,
          createdAt: transaction.createdAt,
          processedAt: new Date(),
          expiresAt: transaction.expiredAt,
          paymentUrl: null
        },
        wallet: {
          balance: wallet.balance.available,
          currency: wallet.currency || 'VND'
        },
        payosStatus: {
          status: payosStatus.status,
          amount: payosStatus.amount
        }
      };
    }

    // Regular flow - get current wallet balance
    const wallet = await Wallet.findById(transaction.wallet._id);

    return {
      transaction: {
        id: transaction._id,
        status: transaction.status,
        amount: transaction.amount,
        createdAt: transaction.createdAt,
        processedAt: transaction.processedAt,
        expiresAt: transaction.expiredAt,
        paymentUrl: transaction.status === 'pending' ? transaction.paymentUrl : null
      },
      wallet: {
        balance: wallet.balance.available,
        currency: wallet.currency || 'VND'
      },
      payosStatus: payosStatus
        ? {
            status: payosStatus.status,
            amount: payosStatus.amount
          }
        : null
    };
  } catch (error) {
    throw new Error(`Failed to verify payment: ${error.message}`);
  }
};

// Get wallet balance (with auto-creation if missing)
const getWalletBalance = async (userId) => {
  try {
    let user = await User.findById(userId).populate('wallet');
    if (!user) {
      throw new Error('User not found');
    }

    // Auto-create wallet if it doesn't exist
    if (!user.wallet) {
      const Wallet = require('../models/Wallet');

      const wallet = new Wallet({
        user: userId,
        balance: {
          available: 0,
          frozen: 0,
          pending: 0
        },
        currency: 'VND',
        status: 'ACTIVE'
      });

      await wallet.save();

      // Update user with wallet reference
      await User.findByIdAndUpdate(userId, { wallet: wallet._id });

      // Reload user with wallet
      user = await User.findById(userId).populate('wallet');
    }

    return {
      balance: user.wallet.balance.display || user.wallet.balance.available,
      available: user.wallet.balance.available,
      frozen: user.wallet.balance.frozen,
      pending: user.wallet.balance.pending,
      currency: user.wallet.currency,
      status: user.wallet.status
    };
  } catch (error) {
    throw new Error(`Failed to get wallet balance: ${error.message}`);
  }
};

// Get transaction history
const getTransactionHistory = async (userId, options = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      type = null,
      status = null,
      startDate = null,
      endDate = null
    } = options;

    // Build query
    const query = { user: userId };
    if (type) query.type = type;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Execute queries in parallel
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('wallet', 'currency')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),

      Transaction.countDocuments(query)
    ]);

    // Add display amount with correct sign based on transaction type
    const enhancedTransactions = transactions.map((transaction) => {
      // Define transaction types that should show as negative (money going out)
      const outgoingTypes = ['payment', 'withdrawal', 'penalty'];
      // Define transaction types that should show as positive (money coming in)
      const incomingTypes = ['deposit', 'refund', 'order_payment'];

      let displayAmount = transaction.amount;

      // For outgoing transactions, show negative amount
      if (outgoingTypes.includes(transaction.type)) {
        displayAmount = -Math.abs(transaction.amount);
      }
      // For incoming transactions, show positive amount
      else if (incomingTypes.includes(transaction.type)) {
        displayAmount = Math.abs(transaction.amount);
      }
      // For unknown/system types, check description and metadata for context
      else {
        // Check if it's a promotion payment by description
        if (
          transaction.description &&
          (transaction.description.includes('Promotion') ||
            transaction.description.includes('Product Promotion'))
        ) {
          displayAmount = -Math.abs(transaction.amount);
        }
        // Check metadata for promotion type
        else if (transaction.metadata && transaction.metadata.type === 'product_promotion') {
          displayAmount = -Math.abs(transaction.amount);
        }
        // PROMOTION_REVENUE is system wallet transaction, should not appear in user wallet
        else if (transaction.type === 'PROMOTION_REVENUE') {
          // This shouldn't appear in user transactions, but if it does, treat as incoming
          displayAmount = Math.abs(transaction.amount);
        }
      }

      return {
        ...transaction,
        displayAmount,
        isOutgoing: displayAmount < 0
      };
    });

    return {
      transactions: enhancedTransactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  } catch (error) {
    throw new Error(`Failed to get transaction history: ${error.message}`);
  }
};

// Generic payment link creation (for promotions, rentals, etc.)
const createPaymentLink = async (paymentData) => {
  try {
    const { orderCode, amount, description, returnUrl, cancelUrl, metadata = {} } = paymentData;

    if (!orderCode || !amount || !description) {
      throw new Error('Missing required payment data');
    }

    // Create PayOS payment link
    const payosData = {
      orderCode,
      amount,
      description: description.substring(0, 25), // Max 25 chars for PayOS
      returnUrl: returnUrl || `${process.env.CLIENT_URL}/payment-success`,
      cancelUrl: cancelUrl || `${process.env.CLIENT_URL}/payment-cancel`
    };

    const paymentLink = await payos.paymentRequests.create(payosData);

    return {
      checkoutUrl: paymentLink.checkoutUrl,
      orderCode,
      qrCode: paymentLink.qrCode
    };
  } catch (error) {
    console.error('Payment link creation error:', error);
    throw new Error(`Failed to create payment link: ${error.message}`);
  }
};

// Create order payment session (PayOS) - similar to wallet top-up
const createOrderPaymentSession = async (userId, amount, orderInfo, metadata = {}) => {
  try {
    const validAmount = validateAmount(amount);
    const orderCode = Date.now();

    // Get user wallet (required for transaction)
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error('User wallet not found');
    }

    // Create pending transaction for this order payment (like wallet top-up)
    const transaction = new Transaction({
      user: userId,
      wallet: wallet._id, // Required field
      type: 'order_payment', // Different type from wallet top-up
      amount: validAmount,
      status: 'pending',
      paymentMethod: 'payos',
      externalId: orderCode.toString(), // Use externalId like wallet top-up
      description: `Thanh toán đơn thuê #${orderInfo.orderNumber || orderCode}`,
      metadata: {
        ...metadata,
        orderInfo,
        orderType: 'rental_order'
      },
      expiredAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes like wallet top-up
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent
    });

    await transaction.save();

    // Create PayOS payment link (same structure as wallet top-up)
    const paymentData = {
      orderCode,
      amount: validAmount,
      description: `PIRA Order ${Math.round(validAmount / 1000)}k`, // Keep it short like top-up
      returnUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rental-orders/payment-success?orderCode=${orderCode}`,
      cancelUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/rental-orders/payment-cancel?orderCode=${orderCode}`
    };

    const paymentLink = await payos.paymentRequests.create(paymentData);

    // Update transaction with payment URL (like wallet top-up)
    transaction.paymentUrl = paymentLink.checkoutUrl;
    await transaction.save();

    return {
      transaction: {
        id: transaction._id,
        orderCode,
        amount: validAmount,
        status: transaction.status,
        expiresAt: transaction.expiredAt
      },
      checkoutUrl: paymentLink.checkoutUrl,
      qrCode: paymentLink.qrCode // For QR display like wallet top-up
    };
  } catch (error) {
    console.error('Order payment creation error:', error);
    throw new Error(`Failed to create order payment: ${error.message}`);
  }
};

// Process wallet payment for orders
const processWalletPaymentForOrder = async (userId, amount, orderInfo) => {
  const validAmount = validateAmount(amount);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Get user wallet
    const wallet = await Wallet.findOne({ user: userId }).session(session);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Check balance
    if (wallet.balance.available < validAmount) {
      throw new Error(
        `Insufficient balance. Current balance: ${wallet.balance.available.toLocaleString()} VND`
      );
    }

    // Deduct from user wallet
    wallet.balance.available -= validAmount;
    await wallet.save({ session });

    // Add to system wallet
    const SystemWallet = require('../models/SystemWallet');
    let systemWallet = await SystemWallet.findOne({}).session(session);

    if (!systemWallet) {
      systemWallet = new SystemWallet({
        name: 'PIRA Platform Wallet',
        balance: {
          available: 0,
          frozen: 0,
          pending: 0
        },
        currency: 'VND',
        status: 'ACTIVE'
      });
    }

    systemWallet.balance.available += validAmount;
    await systemWallet.save({ session });

    // Calculate fee breakdown from orderInfo if available
    const feeBreakdown = {
      deposit: orderInfo.totalDeposit || 0,
      rental: orderInfo.totalRental || 0,
      shipping: orderInfo.totalShipping || 0
    };

    // Create transaction record for user (payment out)
    const userTransaction = new Transaction({
      user: userId,
      wallet: wallet._id,
      type: 'payment',
      amount: validAmount,
      status: 'success',
      paymentMethod: 'wallet',
      toSystemWallet: true,
      systemWalletAction: 'revenue',
      description: `Thanh toán đơn thuê #${orderInfo.orderNumber || 'N/A'}`,
      metadata: {
        orderInfo,
        balanceAfter: wallet.balance.available,
        feeBreakdown: feeBreakdown
      },
      processedAt: new Date()
    });

    await userTransaction.save({ session });

    // Create transaction record for system wallet (payment in)
    const systemTransaction = new Transaction({
      user: new mongoose.Types.ObjectId('000000000000000000000000'), // System user placeholder
      wallet: null,
      type: 'TRANSFER_IN',
      amount: validAmount,
      status: 'success',
      paymentMethod: 'wallet',
      fromSystemWallet: false,
      toSystemWallet: true,
      systemWalletAction: 'revenue',
      description: `Nhận thanh toán đơn thuê #${orderInfo.orderNumber || 'N/A'}`,
      metadata: {
        orderInfo,
        fromUser: userId,
        fromWallet: wallet._id,
        feeBreakdown: feeBreakdown,
        isSystemTransaction: true
      },
      processedAt: new Date()
    });

    await systemTransaction.save({ session });

    await session.commitTransaction();

    return {
      transactionId: userTransaction._id,
      systemTransactionId: systemTransaction._id,
      balanceAfter: wallet.balance.available,
      amount: validAmount,
      status: 'success'
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Process order payment webhook - complete the order when payment succeeds
const processOrderPaymentWebhook = async (webhookData) => {
  try {
    // Parse webhook data
    let parsedData = parseWebhookData(webhookData);

    // Verify webhook signature (optional for development)
    let verifiedData;
    try {
      verifiedData = await payos.webhooks.verify(parsedData);
    } catch (verifyError) {
      // Webhook verification failed, use raw data (development fallback)
      verifiedData = parsedData;
    }

    const orderCode = verifiedData.orderCode || verifiedData.orderId;
    const success =
      verifiedData.success || verifiedData.code === '00' || verifiedData.status === 'PAID';

    if (!orderCode) {
      throw new Error('No order code in webhook data');
    }

    // Find order payment transaction
    const transaction = await Transaction.findOne({
      externalId: orderCode.toString(),
      type: 'order_payment'
    }).populate('user wallet');

    if (!transaction) {
      throw new Error(`Order payment transaction not found for orderCode: ${orderCode}`);
    }

    // Prevent double processing
    if (transaction.status === 'success') {
      return { message: 'Order payment already processed', orderCompleted: true };
    }

    if (success) {
      // Update transaction status
      const updatedTransaction = await Transaction.findByIdAndUpdate(
        transaction._id,
        {
          status: 'success',
          processedAt: new Date(),
          metadata: {
            ...transaction.metadata,
            webhookData: verifiedData
          }
        },
        { new: true }
      );

      // TODO: Complete the rental order here
      // This is where you would update the rental order status to 'confirmed' or 'paid'
      // Example: await RentalOrder.findOneAndUpdate({orderNumber: transaction.metadata.orderInfo.orderNumber}, {status: 'confirmed', paymentStatus: 'paid'})

      return {
        message: 'Order payment processed successfully',
        orderCompleted: true,
        transaction: updatedTransaction
      };
    } else {
      // Payment failed
      await Transaction.findByIdAndUpdate(transaction._id, {
        status: 'failed',
        processedAt: new Date(),
        lastError: `Payment failed: ${verifiedData.description || 'Unknown error'}`,
        metadata: {
          ...transaction.metadata,
          webhookData: verifiedData
        }
      });

      return { message: 'Order payment failed', orderCompleted: false };
    }
  } catch (error) {
    console.error('Order payment webhook error:', error);
    throw new Error(`Failed to process order payment webhook: ${error.message}`);
  }
};

module.exports = {
  validateAmount,
  checkDailyLimit,
  createTopUpSession,
  createPaymentLink,
  processWebhook,
  parseWebhookData,
  verifyPayment,
  getWalletBalance,
  getTransactionHistory,
  createOrderPaymentSession,
  processWalletPaymentForOrder,
  processOrderPaymentWebhook
};
