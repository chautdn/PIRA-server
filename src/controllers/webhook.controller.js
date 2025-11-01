const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const productPromotionService = require('../services/productPromotion.service');

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

      if (isSuccess) {
        // Update transaction to success
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'success',
          processedAt: new Date()
        });

        // Update wallet balance
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
