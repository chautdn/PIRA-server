/**
 * Payment Queue Service
 * Handles async payment transfers to avoid blocking main thread
 */

class PaymentQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  /**
   * Add payment transfer to queue and process in background
   * @param {Function} transferFn - Async function that performs the transfer
   * @param {Object} metadata - Metadata for logging
   */
  async add(transferFn, metadata = {}) {
    const job = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      transferFn,
      metadata,
      createdAt: new Date()
    };

    this.queue.push(job);

    // Process queue in background (non-blocking)
    setImmediate(() => this.processQueue());

    return job.id;
  }

  /**
   * Process all jobs in queue
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      
      try {
        const startTime = Date.now();
        
        await job.transferFn();
        
        const duration = Date.now() - startTime;
      } catch (error) {
        // Payment job failed
      }
    }

    this.processing = false;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing
    };
  }
}

// Singleton instance
const paymentQueue = new PaymentQueue();

module.exports = paymentQueue;
