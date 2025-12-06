const Product = require('../models/Product');
const SubOrder = require('../models/SubOrder');

/**
 * Service for validating product quantity changes
 * Ensures that reducing quantity doesn't break existing confirmed orders
 */
class ProductQuantityValidationService {
  /**
   * Check if reducing quantity will affect existing orders
   * @param {string} productId - Product ID
   * @param {number} newQuantity - New quantity to set
   * @returns {Object} Validation result with conflicts if any
   */
  async validateQuantityChange(productId, newQuantity) {
    try {
      const product = await Product.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const currentQuantity = product.availability?.quantity || 0;

      // If increasing or maintaining quantity, no validation needed
      if (newQuantity >= currentQuantity) {
        return {
          canChange: true,
          currentQuantity,
          newQuantity,
          message: 'Quantity can be changed safely'
        };
      }

      // Get all confirmed orders for this product
      const confirmedOrders = await SubOrder.find({
        'products.product': productId,
        status: {
          $in: [
            'OWNER_CONFIRMED',
            'READY_FOR_CONTRACT',
            'CONTRACT_SIGNED',
            'DELIVERED',
            'ACTIVE',
            'PARTIALLY_CONFIRMED',
            'RENTER_ACCEPTED_PARTIAL'
          ]
        }
      })
        .populate('masterOrder', 'renter masterOrderNumber')
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.firstName profile.lastName email phone'
          }
        })
        .sort({ 'products.rentalPeriod.startDate': 1 });

      // Group orders by date range and calculate required quantity per day
      const dateQuantityMap = new Map();
      const affectedOrders = [];

      for (const subOrder of confirmedOrders) {
        for (const productItem of subOrder.products) {
          if (
            productItem.product.toString() === productId &&
            productItem.productStatus !== 'REJECTED' &&
            productItem.productStatus !== 'CANCELLED'
          ) {
            const startDate = new Date(productItem.rentalPeriod.startDate);
            const endDate = new Date(productItem.rentalPeriod.endDate);

            // Add buffer day for inspection
            const endWithBuffer = new Date(endDate);
            endWithBuffer.setDate(endWithBuffer.getDate() + 1);

            // Track each day's quantity requirement
            for (let d = new Date(startDate); d <= endWithBuffer; d.setDate(d.getDate() + 1)) {
              const dateKey = d.toISOString().split('T')[0];
              const currentCount = dateQuantityMap.get(dateKey) || 0;
              dateQuantityMap.set(dateKey, currentCount + productItem.quantity);
            }

            // Track order details for reporting
            affectedOrders.push({
              subOrderId: subOrder._id,
              subOrderNumber: subOrder.subOrderNumber,
              masterOrderNumber: subOrder.masterOrder?.masterOrderNumber,
              renter: {
                name: subOrder.masterOrder?.renter?.profile?.firstName
                  ? `${subOrder.masterOrder.renter.profile.firstName} ${subOrder.masterOrder.renter.profile.lastName || ''}`.trim()
                  : 'N/A',
                email: subOrder.masterOrder?.renter?.email,
                phone: subOrder.masterOrder?.renter?.phone
              },
              quantity: productItem.quantity,
              startDate: startDate.toISOString().split('T')[0],
              endDate: endDate.toISOString().split('T')[0],
              productStatus: productItem.productStatus
            });
          }
        }
      }

      // Find dates where required quantity exceeds new quantity
      const conflicts = [];
      for (const [date, requiredQuantity] of dateQuantityMap.entries()) {
        if (requiredQuantity > newQuantity) {
          // Find which orders contribute to this date
          const ordersOnDate = affectedOrders.filter((order) => {
            const orderStart = new Date(order.startDate);
            const orderEnd = new Date(order.endDate);
            const orderEndWithBuffer = new Date(orderEnd);
            orderEndWithBuffer.setDate(orderEndWithBuffer.getDate() + 1);
            const checkDate = new Date(date);

            return checkDate >= orderStart && checkDate <= orderEndWithBuffer;
          });

          conflicts.push({
            date,
            requiredQuantity,
            newQuantity,
            deficit: requiredQuantity - newQuantity,
            ordersOnDate
          });
        }
      }

      // Calculate summary
      const canChange = conflicts.length === 0;
      const totalAffectedOrders = new Set(affectedOrders.map((o) => o.subOrderId.toString())).size;

      return {
        canChange,
        currentQuantity,
        newQuantity,
        totalAffectedOrders,
        affectedOrders: affectedOrders.length > 0 ? affectedOrders : [],
        conflicts: conflicts.length > 0 ? conflicts : [],
        message: canChange
          ? 'Quantity can be changed safely'
          : `Cannot reduce quantity to ${newQuantity}. There are ${conflicts.length} date(s) with insufficient quantity for existing orders.`,
        recommendation: canChange
          ? null
          : this._generateRecommendation(conflicts, currentQuantity, newQuantity, affectedOrders)
      };
    } catch (error) {
      throw new Error(`Error validating quantity change: ${error.message}`);
    }
  }

  /**
   * Get detailed availability timeline for a product
   * @param {string} productId - Product ID
   * @param {number} daysAhead - Number of days to check ahead (default 90)
   * @returns {Object} Timeline with daily quantity usage
   */
  async getQuantityTimeline(productId, daysAhead = 90) {
    try {
      const product = await Product.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const totalStock = product.availability?.quantity || 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + daysAhead);

      // Get confirmed orders
      const confirmedOrders = await SubOrder.find({
        'products.product': productId,
        status: {
          $in: ['OWNER_CONFIRMED', 'READY_FOR_CONTRACT', 'CONTRACT_SIGNED', 'DELIVERED', 'ACTIVE']
        },
        'products.rentalPeriod.startDate': { $lte: endDate }
      });

      const timeline = {};
      for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        let bookedQuantity = 0;

        for (const subOrder of confirmedOrders) {
          for (const productItem of subOrder.products) {
            if (
              productItem.product.toString() === productId &&
              productItem.productStatus !== 'REJECTED' &&
              productItem.productStatus !== 'CANCELLED'
            ) {
              const orderStart = new Date(productItem.rentalPeriod.startDate);
              const orderEnd = new Date(productItem.rentalPeriod.endDate);
              const orderEndWithBuffer = new Date(orderEnd);
              orderEndWithBuffer.setDate(orderEndWithBuffer.getDate() + 1);

              if (d >= orderStart && d <= orderEndWithBuffer) {
                bookedQuantity += productItem.quantity;
              }
            }
          }
        }

        timeline[dateKey] = {
          totalStock,
          bookedQuantity,
          availableQuantity: Math.max(0, totalStock - bookedQuantity),
          utilizationPercentage:
            totalStock > 0 ? Math.round((bookedQuantity / totalStock) * 100) : 0
        };
      }

      return {
        productId,
        currentQuantity: totalStock,
        startDate: today.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        timeline
      };
    } catch (error) {
      throw new Error(`Error getting quantity timeline: ${error.message}`);
    }
  }

  /**
   * Generate recommendation for owner on how to handle conflicts
   * @private
   */
  _generateRecommendation(conflicts, currentQuantity, newQuantity, affectedOrders) {
    const earliestConflict = conflicts[0];
    const latestConflict = conflicts[conflicts.length - 1];

    const recommendation = {
      options: [],
      conflictPeriod: {
        start: earliestConflict.date,
        end: latestConflict.date,
        daysAffected: conflicts.length
      }
    };

    // Option 1: Keep current quantity
    recommendation.options.push({
      option: 'keep_current',
      title: 'Keep current quantity',
      description: `Maintain quantity at ${currentQuantity} to satisfy all existing orders`,
      action: 'No changes needed'
    });

    // Option 2: Wait until orders complete
    const lastConflictDate = new Date(latestConflict.date);
    recommendation.options.push({
      option: 'wait',
      title: 'Wait for orders to complete',
      description: `Reduce quantity to ${newQuantity} after ${latestConflict.date}`,
      action: `Wait until ${lastConflictDate.toLocaleDateString('vi-VN')} when all conflicting orders are completed`
    });

    // Option 3: Contact customers (if reducing significantly)
    if (conflicts.length > 0) {
      const uniqueCustomers = new Set(affectedOrders.map((o) => o.renter.email)).size;
      recommendation.options.push({
        option: 'negotiate',
        title: 'Contact customers to negotiate',
        description: `Contact ${uniqueCustomers} customer(s) with ${affectedOrders.length} affected order(s)`,
        action: 'Negotiate with customers to modify or cancel their orders (may require refunds)',
        warning: 'This may damage your reputation and result in negative reviews'
      });
    }

    // Option 4: Find minimum safe quantity
    const maxRequired = Math.max(...conflicts.map((c) => c.requiredQuantity));
    if (maxRequired < currentQuantity) {
      recommendation.options.push({
        option: 'reduce_to_safe',
        title: 'Reduce to minimum safe quantity',
        description: `You can reduce to ${maxRequired} without affecting existing orders`,
        action: `Set quantity to ${maxRequired} instead of ${newQuantity}`
      });
    }

    return recommendation;
  }
}

module.exports = new ProductQuantityValidationService();
