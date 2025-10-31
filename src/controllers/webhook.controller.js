const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const User = require('../models/User');

const webhookController = {
  // Simple webhook handler - just update transaction and wallet
  handlePayOSWebhook: async (req, res) => {
    try {
      // Get order code from webhook
      const webhookData = req.body;
      const orderCode = webhookData.orderCode || webhookData.orderId;
      const isSuccess =
        webhookData.success || webhookData.code === '00' || webhookData.status === 'PAID';

      if (!orderCode) {
        return res.status(400).json({ error: 'No order code' });
      }

      // Find the transaction
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
