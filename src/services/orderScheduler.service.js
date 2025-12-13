const cron = require('node-cron');
const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');

/**
 * Scheduled tasks for order status updates
 */
class OrderScheduler {
  constructor() {
    this.pendingCompletions = new Map(); // Store scheduled completions
  }

  /**
   * Schedule order completion after 24h from return delivery
   * @param {String} masterOrderId - Master order ID
   * @param {String} subOrderId - Sub order ID
   * @param {Number} delayHours - Hours to wait before completion (default 24)
   */
  async scheduleOrderCompletion(masterOrderId, subOrderId, delayHours = 24) {
    const completionTime = new Date(Date.now() + delayHours * 60 * 60 * 1000);
    
    console.log(`\n⏰ Scheduling order completion:`);
    console.log(`   MasterOrder: ${masterOrderId}`);
    console.log(`   SubOrder: ${subOrderId}`);
    console.log(`   Will complete at: ${completionTime.toLocaleString('vi-VN')} (${delayHours}h from now)`);

    // Store in memory (in production, should use Redis or database)
    const scheduleKey = `${masterOrderId}-${subOrderId}`;
    this.pendingCompletions.set(scheduleKey, {
      masterOrderId,
      subOrderId,
      scheduledAt: new Date(),
      completionTime,
      delayMs: delayHours * 60 * 60 * 1000
    });

    // Schedule the completion
    setTimeout(async () => {
      try {
        await this.completeOrder(masterOrderId, subOrderId);
        this.pendingCompletions.delete(scheduleKey);
      } catch (error) {
        console.error(`❌ Failed to auto-complete order ${masterOrderId}:`, error);
      }
    }, delayHours * 60 * 60 * 1000);

    console.log(`   ✅ Completion scheduled successfully`);
    
    return {
      scheduledAt: new Date(),
      completionTime,
      delayHours
    };
  }

  /**
   * Complete the order by setting status to COMPLETED
   * @param {String} masterOrderId - Master order ID
   * @param {String} subOrderId - Sub order ID
   */
  async completeOrder(masterOrderId, subOrderId) {
    console.log(`\n✅ Auto-completing order (24h after return delivery):`);
    console.log(`   MasterOrder: ${masterOrderId}`);
    console.log(`   SubOrder: ${subOrderId}`);

    try {
      // Update master order status
      const masterOrder = await MasterOrder.findById(masterOrderId);
      if (masterOrder && masterOrder.status !== 'COMPLETED') {
        const previousStatus = masterOrder.status;
        masterOrder.status = 'COMPLETED';
        masterOrder.completedAt = new Date();
        await masterOrder.save();
        
        console.log(`   📦 MasterOrder status: ${previousStatus} → COMPLETED`);
      } else if (masterOrder?.status === 'COMPLETED') {
        console.log(`   ℹ️  MasterOrder already COMPLETED`);
      }

      // Update sub order status if needed
      const subOrder = await SubOrder.findById(subOrderId);
      if (subOrder && subOrder.status !== 'COMPLETED') {
        const previousStatus = subOrder.status;
        subOrder.status = 'COMPLETED';
        subOrder.completedAt = new Date();
        await subOrder.save();
        
        console.log(`   📦 SubOrder status: ${previousStatus} → COMPLETED`);
      } else if (subOrder?.status === 'COMPLETED') {
        console.log(`   ℹ️  SubOrder already COMPLETED`);
      }

      console.log(`   ✅ Order completion successful at ${new Date().toLocaleString('vi-VN')}`);

      // Unlock frozen funds immediately when order completes (24h after return delivery)
      try {
        const Transaction = require('../models/Transaction');
        const Wallet = require('../models/Wallet');
        
        console.log('\n🔓 Unlocking frozen funds for this order...');
        
        // Find all frozen transactions for this order
        const frozenTransactions = await Transaction.find({
          type: 'TRANSFER_IN',
          status: 'success',
          'metadata.subOrderId': subOrderId,
          'metadata.action': { $in: ['RECEIVED_FROM_SYSTEM_FROZEN', 'RECEIVED_EXTENSION_FEE'] }
        }).populate('wallet');
        
        if (frozenTransactions.length > 0) {
          let totalUnlocked = 0;
          const wallet = frozenTransactions[0].wallet;
          
          console.log(`   Found ${frozenTransactions.length} frozen transaction(s) to unlock`);
          
          // Calculate total amount
          frozenTransactions.forEach(txn => {
            totalUnlocked += txn.amount;
          });
          
          // Move funds from frozen to available
          wallet.balance.frozen -= totalUnlocked;
          wallet.balance.available += totalUnlocked;
          await wallet.save();
          
          // Update transaction metadata
          await Transaction.updateMany(
            { _id: { $in: frozenTransactions.map(t => t._id) } },
            {
              $set: {
                'metadata.unlockedAt': new Date(),
                'metadata.unlockReason': 'ORDER_COMPLETED_AUTO'
              }
            }
          );
          
          console.log(`   ✅ Unlocked ${totalUnlocked.toLocaleString()} VND`);
          console.log(`   💰 Wallet balance:`);
          console.log(`      Available: ${wallet.balance.available.toLocaleString()} VND`);
          console.log(`      Frozen: ${wallet.balance.frozen.toLocaleString()} VND`);
          
          // Emit socket update if available
          if (global.chatGateway) {
            global.chatGateway.emitWalletUpdate(wallet.user.toString(), {
              type: 'FUNDS_UNLOCKED',
              amount: totalUnlocked,
              frozen: wallet.balance.frozen,
              available: wallet.balance.available
            });
          }
        } else {
          console.log(`   ℹ️  No frozen funds found for this order`);
        }
      } catch (unlockErr) {
        console.error('   ⚠️ Failed to unlock frozen funds:', unlockErr.message || unlockErr);
      }
      
      return { success: true, completedAt: new Date() };
    } catch (error) {
      console.error(`   ❌ Error completing order:`, error);
      throw error;
    }
  }

  /**
   * Get all pending completions (for debugging)
   */
  getPendingCompletions() {
    return Array.from(this.pendingCompletions.entries()).map(([key, value]) => ({
      key,
      ...value,
      remainingMs: value.completionTime - new Date(),
      remainingHours: Math.round((value.completionTime - new Date()) / (60 * 60 * 1000) * 10) / 10
    }));
  }

  /**
   * Cancel a scheduled completion (if needed)
   */
  cancelScheduledCompletion(masterOrderId, subOrderId) {
    const scheduleKey = `${masterOrderId}-${subOrderId}`;
    const deleted = this.pendingCompletions.delete(scheduleKey);
    
    if (deleted) {
      console.log(`   ⚠️  Cancelled scheduled completion for ${scheduleKey}`);
    }
    
    return deleted;
  }
}

// Singleton instance
const orderScheduler = new OrderScheduler();

module.exports = orderScheduler;
