const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const productPromotionService = require('../services/productPromotion.service');
const RentalOrderService = require('../services/rentalOrder.service');

const webhookController = {
  // Simple webhook handler - just update transaction and wallet
  handlePayOSWebhook: async (req, res) => {
    try {
      console.log('\n============ 🔔 PayOS WEBHOOK RECEIVED ============');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Headers:', JSON.stringify(req.headers, null, 2));
      console.log('Body:', JSON.stringify(req.body, null, 2));
      console.log('================================================\n');

      // Get order code from webhook
      const webhookData = req.body;
      const orderCode = webhookData.orderCode || webhookData.orderId;
      const isSuccess =
        webhookData.success || webhookData.code === '00' || webhookData.status === 'PAID';

      console.log('📝 Parsed webhook data:', { orderCode, isSuccess });

      if (!orderCode) {
        console.error('❌ No order code in webhook');
        return res.status(400).json({ error: 'No order code' });
      }

      // Check if this is a product promotion payment
      console.log('🔍 Checking if this is a promotion payment...');
      const promotionResult = await productPromotionService.processPayOSWebhook(
        orderCode,
        isSuccess
      );
      console.log('✅ Promotion result:', promotionResult);

      if (promotionResult.success || promotionResult.message === 'Promotion not found') {
        // If it's a promotion payment or not found (continue to regular flow)
        if (promotionResult.message !== 'Promotion not found') {
          // Emit socket update for promotion activation
          if (global.chatGateway && promotionResult.promotion) {
            global.chatGateway.emitToUser(
              promotionResult.promotion.user.toString(),
              'promotion-activated',
              {
                promotionId: promotionResult.promotion._id,
                productId: promotionResult.promotion.product
              }
            );
          }

          return res.status(200).json({
            message: promotionResult.message,
            orderCode
          });
        }
      }

      // Regular wallet top-up flow
      const transaction = await Transaction.findOne({
        externalId: orderCode.toString()
      }).populate('user wallet');

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      if (transaction.status === 'success') {
        return res.status(200).json({ message: 'Already processed' });
      }

      // Check if this is a rental order payment
      const isRentalOrderPayment =
        transaction.type === 'order_payment' && transaction.metadata?.orderType === 'rental_order';

      // Check if this is an early return upfront shipping payment
      const isEarlyReturnUpfrontPayment = 
        transaction.metadata?.orderType === 'early_return_upfront_shipping';

      console.log('🔍 Transaction type check:', {
        type: transaction.type,
        orderType: transaction.metadata?.orderType,
        isRentalOrderPayment,
        isEarlyReturnUpfrontPayment,
        masterOrderId: transaction.metadata?.masterOrderId,
        subOrderId: transaction.metadata?.subOrderId
      });

      if (isSuccess) {
        // Update transaction to success
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'success',
          processedAt: new Date()
        });
        console.log('✅ Transaction updated to success');

        if (isEarlyReturnUpfrontPayment) {
          // Handle early return upfront shipping payment
          console.log('🚚 Processing early return upfront shipping payment:', {
            subOrderId: transaction.metadata.subOrderId,
            amount: transaction.amount
          });

          // Credit system wallet
          const systemWallet = await Wallet.findOne({ isSystem: true });
          if (systemWallet) {
            systemWallet.balance.available += transaction.amount;
            await systemWallet.save();

            // Create transaction record for system wallet
            const systemTransaction = new Transaction({
              wallet: systemWallet._id,
              type: 'deposit',
              amount: transaction.amount,
              status: 'success',
              paymentMethod: 'payos',
              description: `Phí ship thêm - Trả hàng sớm từ renter`,
              metadata: {
                subOrderId: transaction.metadata.subOrderId,
                renterId: transaction.user._id,
                sourceTransaction: transaction._id
              }
            });
            await systemTransaction.save();

            console.log(`✅ Credited ${transaction.amount}đ to system wallet from PayOS`);
          }

          return res.status(200).json({
            message: 'Early return upfront shipping payment processed successfully',
            orderCode,
            amount: transaction.amount
          });
        } else if (isRentalOrderPayment) {
          // Handle rental order payment confirmation
          console.log('🏠 Processing rental order payment:', {
            masterOrderId: transaction.metadata.masterOrderId,
            orderCode
          });

          try {
            const result = await RentalOrderService.verifyAndCompletePayOSPayment(
              transaction.metadata.masterOrderId,
              orderCode
            );

            console.log('✅ Rental order payment confirmed:', result.message);

            // Emit socket notification to user
            if (global.chatGateway) {
              global.chatGateway.emitToUser(
                transaction.user.toString(),
                'rental-payment-confirmed',
                {
                  masterOrderId: transaction.metadata.masterOrderId,
                  orderNumber: transaction.metadata.orderNumber,
                  message: 'Thanh toán đơn hàng thành công'
                }
              );
            }

            return res.status(200).json({
              message: 'Rental order payment processed successfully',
              orderCode,
              masterOrderId: transaction.metadata.masterOrderId
            });
          } catch (error) {
            console.error('❌ Error confirming rental order payment:', error);
            // Still return 200 to PayOS to avoid retry
            return res.status(200).json({
              message: 'Payment received but order confirmation failed',
              orderCode,
              error: error.message
            });
          }
        } else {
          // Regular wallet top-up
          const wallet = await Wallet.findById(transaction.wallet);
          if (wallet) {
            wallet.balance.available += transaction.amount;
            await wallet.save();
          }

          return res.status(200).json({
            message: 'Payment processed successfully',
            orderCode,
            amount: transaction.amount
          });
        }
      } else {
        // Payment failed
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'failed',
          processedAt: new Date()
        });

        return res.status(200).json({ message: 'Payment failed', orderCode });
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
};

module.exports = webhookController;
