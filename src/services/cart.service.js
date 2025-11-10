const Cart = require('../models/Cart');
const Product = require('../models/Product');

class CartService {
  /**
   * Check if product is available for rental dates
   * Returns: { available: boolean, reason: string, availableCount: number }
   */
  async checkDateAvailability(productId, startDate, endDate, excludeUserId = null) {
    const product = await Product.findById(productId);
    if (!product) {
      return { available: false, reason: 'Sản phẩm không tồn tại' };
    }

    const totalStock = product.availability?.quantity || 0;

    // Check if dates are valid (not in the past)
    const now = new Date();
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    // Kiểm tra thời gian: trước 12h trưa có thể chọn hôm nay, sau 12h phải chọn ngày mai
    const minStartDate = new Date();
    if (now.getHours() >= 12) {
      minStartDate.setDate(minStartDate.getDate() + 1);
    }
    minStartDate.setHours(0, 0, 0, 0);

    let reason = null;
    if (totalStock <= 0) {
      reason = 'Sản phẩm hiện không có sẵn';
    } else if (startDateObj < minStartDate) {
      const timeMessage =
        now.getHours() >= 12
          ? 'Sau 12h trưa, ngày bắt đầu phải từ ngày mai trở đi'
          : 'Ngày bắt đầu phải từ hôm nay trở đi';
      reason = timeMessage;
    } else if (endDateObj <= startDateObj) {
      reason = 'Ngày kết thúc phải sau ngày bắt đầu';
    }

    // Check confirmed bookings with buffer day logic
    const SubOrder = require('../models/SubOrder');

    // Add 1 day buffer after rental end date for inspection
    const extendedStartDate = new Date(startDateObj);
    extendedStartDate.setDate(extendedStartDate.getDate() - 1);

    const extendedEndDate = new Date(endDateObj);
    extendedEndDate.setDate(extendedEndDate.getDate() + 1);

    const overlappingOrders = await SubOrder.find({
      'products.product': productId,
      status: { $in: ['CONFIRMED', 'PICKED_UP', 'IN_USE', 'RETURNED'] }, // Include returned for buffer
      $or: [
        {
          // Order overlaps with requested period (including buffer)
          'rentalPeriod.startDate': { $lte: extendedEndDate },
          'rentalPeriod.endDate': { $gte: extendedStartDate }
        }
      ]
    });

    // Calculate minimum available quantity across all requested days
    let minAvailableCount = totalStock;

    // Check each day in the requested period to find the minimum availability
    for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
      let dailyBookedQuantity = 0;

      for (const order of overlappingOrders) {
        const orderStart = new Date(order.rentalPeriod.startDate);
        const orderEnd = new Date(order.rentalPeriod.endDate);

        // Add buffer day after rental end
        const orderEndWithBuffer = new Date(orderEnd);
        orderEndWithBuffer.setDate(orderEndWithBuffer.getDate() + 1);

        // Check if current day conflicts with this order (including buffer)
        if (d >= orderStart && d <= orderEndWithBuffer) {
          const productInOrder = order.products.find((p) => p.product.toString() === productId);
          if (productInOrder) {
            dailyBookedQuantity += productInOrder.quantity;
          }
        }
      }

      // Calculate available count for this specific day
      const dailyAvailableCount = Math.max(0, totalStock - dailyBookedQuantity);

      // Track the minimum availability across all days
      minAvailableCount = Math.min(minAvailableCount, dailyAvailableCount);

      // If any day has 0 availability, we can break early
      if (minAvailableCount === 0) {
        break;
      }
    }

    const availableCount = minAvailableCount;
    const maxBookedQuantity = totalStock - availableCount;
    const available = availableCount > 0 && !reason;

    if (!reason && availableCount === 0) {
      reason = 'Sản phẩm đã được đặt hết cho khung thời gian này';
    }

    return {
      available,
      totalStock,
      availableCount,
      bookedQuantity: maxBookedQuantity,
      reason
    };
  }

  /**
   * Get availability for entire month (checking real confirmed bookings)
   * Returns object with dates as keys and availability info as values
   */
  async getMonthAvailability(productId, year, month) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Sản phẩm không tồn tại');
    }

    const totalStock = product.availability?.quantity || 0;

    // Get confirmed bookings for this month
    const SubOrder = require('../models/SubOrder');
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const confirmedOrders = await SubOrder.find({
      'products.product': productId,
      status: { $in: ['CONFIRMED', 'PICKED_UP', 'IN_USE'] },
      $or: [
        {
          'rentalPeriod.startDate': {
            $gte: monthStart,
            $lte: monthEnd
          }
        },
        {
          'rentalPeriod.endDate': {
            $gte: monthStart,
            $lte: monthEnd
          }
        },
        {
          'rentalPeriod.startDate': { $lte: monthStart },
          'rentalPeriod.endDate': { $gte: monthEnd }
        }
      ]
    });

    // Get number of days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const availability = {};

    // Check availability for each day
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const checkDate = new Date(year, month, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if date is in past
      const isPast = checkDate < today;

      // Calculate booked quantity for this specific date (with buffer day)
      let bookedQuantity = 0;
      for (const order of confirmedOrders) {
        const orderStart = new Date(order.rentalPeriod.startDate);
        const orderEnd = new Date(order.rentalPeriod.endDate);

        // Add 1 day buffer after rental end for inspection
        const orderEndWithBuffer = new Date(orderEnd);
        orderEndWithBuffer.setDate(orderEndWithBuffer.getDate() + 1);

        // Check if this date falls within the rental period (including buffer)
        if (checkDate >= orderStart && checkDate <= orderEndWithBuffer) {
          const productInOrder = order.products.find((p) => p.product.toString() === productId);
          if (productInOrder) {
            bookedQuantity += productInOrder.quantity;
          }
        }
      }

      const availableCount = Math.max(0, totalStock - bookedQuantity);

      availability[dateStr] = {
        available: !isPast && availableCount > 0,
        availableCount,
        bookedQuantity,
        totalStock,
        status: isPast ? 'past' : availableCount > 0 ? 'available' : 'booked'
      };
    }

    return availability;
  }

  /**
   * Get user's cart
   */
  async getCart(userId) {
    let cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      select: 'title images pricing availability status owner',
      populate: {
        path: 'owner',
        select: 'profile.firstName email phone address'
      }
    });

    if (!cart) {
      // Create new cart if doesn't exist
      cart = await Cart.create({ user: userId, items: [] });
    }

    // Filter out items with deleted products
    cart.items = cart.items.filter((item) => item.product);

    return cart;
  }

  /**
   * Add item to cart with stock validation
   */
  async addToCart(userId, productId, quantity = 1, rental = null) {
    // Validate product
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Sản phẩm không tồn tại');
    }

    if (product.status !== 'ACTIVE') {
      throw new Error('Sản phẩm không khả dụng');
    }

    // Check stock availability
    const availableStock = product.availability?.quantity || 0;

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
    }

    // Check if product already exists in cart (simple check by productId only)
    const existingItemIndex = cart.items.findIndex((item) => item.product.toString() === productId);

    // If product already exists in cart, throw error
    if (existingItemIndex > -1) {
      throw new Error(
        'Sản phẩm đã có trong giỏ hàng, vui lòng chọn lại ngày và số lượng từ giỏ hàng'
      );
    }

    const newQuantity = quantity;

    // Validate quantity against stock (simple validation since only one item per product)
    if (newQuantity > availableStock) {
      throw new Error(`Chỉ còn ${availableStock} sản phẩm trong kho`);
    }

    // Check date availability if rental dates provided
    let availabilityWarning = null;
    if (rental?.startDate && rental?.endDate) {
      const dateCheck = await this.checkDateAvailability(
        productId,
        rental.startDate,
        rental.endDate,
        userId
      );

      if (!dateCheck.available) {
        throw new Error(dateCheck.reason);
      }

      // Check if requested quantity is available for the selected dates
      if (newQuantity > dateCheck.availableCount) {
        throw new Error(`Chỉ còn ${dateCheck.availableCount} sản phẩm cho thời gian này`);
      }

      // Add warning if availability is limited
      if (dateCheck.availableCount <= 5) {
        availabilityWarning = `Còn ${dateCheck.availableCount} sản phẩm cho thời gian này`;
      }
    }

    // Add new item (no update logic since product can only exist once)
    cart.items.push({
      product: productId,
      quantity: newQuantity,
      rental: rental || {
        startDate: null,
        endDate: null,
        duration: 1
      }
    });

    await cart.save();

    // Populate and return
    await cart.populate({
      path: 'items.product',
      select: 'title images pricing availability status owner',
      populate: {
        path: 'owner',
        select: 'profile.firstName email phone address'
      }
    });

    // Add warning to response if exists
    if (availabilityWarning) {
      cart.availabilityWarning = availabilityWarning;
    }

    return cart;
  }

  /**
   * Update item quantity
   */
  async updateQuantity(userId, productId, quantity) {
    if (quantity < 1) {
      return this.removeItem(userId, productId);
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      throw new Error('Giỏ hàng không tồn tại');
    }

    const itemIndex = cart.items.findIndex((item) => item.product.toString() === productId);

    if (itemIndex === -1) {
      throw new Error('Sản phẩm không có trong giỏ hàng');
    }

    // Validate stock
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Sản phẩm không tồn tại');
    }

    const availableStock = product.availability?.quantity || 0;
    if (quantity > availableStock) {
      throw new Error(`Chỉ còn ${availableStock} sản phẩm trong kho này thôi`);
    }

    cart.items[itemIndex].quantity = quantity;
    await cart.save();

    await cart.populate({
      path: 'items.product',
      select: 'title images pricing availability status owner',
      populate: {
        path: 'owner',
        select: 'profile.firstName email phone address'
      }
    });

    return cart;
  }

  /**
   * Update rental dates
   */
  async updateRental(userId, productId, rental) {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      throw new Error('Giỏ hàng không tồn tại');
    }

    const itemIndex = cart.items.findIndex((item) => item.product.toString() === productId);

    if (itemIndex === -1) {
      throw new Error('Sản phẩm không có trong giỏ hàng');
    }

    // Validate rental dates if provided
    if (rental?.startDate && rental?.endDate) {
      const dateCheck = await this.checkDateAvailability(
        productId,
        rental.startDate,
        rental.endDate,
        userId
      );

      if (!dateCheck.available) {
        throw new Error(dateCheck.reason);
      }

      const currentQuantity = cart.items[itemIndex].quantity;
      if (currentQuantity > dateCheck.availableCount) {
        throw new Error(`Chỉ còn ${dateCheck.availableCount} sản phẩm cho thời gian này`);
      }
    }

    cart.items[itemIndex].rental = rental;
    await cart.save();

    await cart.populate({
      path: 'items.product',
      select: 'title images pricing availability status owner',
      populate: {
        path: 'owner',
        select: 'profile.firstName email phone address'
      }
    });

    return cart;
  }

  /**
   * Remove item from cart
   */
  async removeItem(userId, productId) {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      throw new Error('Giỏ hàng không tồn tại');
    }

    cart.items = cart.items.filter((item) => item.product.toString() !== productId);

    await cart.save();

    await cart.populate({
      path: 'items.product',
      select: 'title images pricing availability status owner',
      populate: {
        path: 'owner',
        select: 'profile.firstName email phone address'
      }
    });

    return cart;
  }

  /**
   * Clear cart
   */
  async clearCart(userId) {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      throw new Error('Giỏ hàng không tồn tại');
    }

    cart.items = [];
    await cart.save();

    return cart;
  }

  /**
   * Sync cart from localStorage to database (when user logs in)
   */
  async syncCart(userId, localCartItems) {
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
    }

    // Merge local cart with server cart
    for (const localItem of localCartItems) {
      const productId = localItem.product._id || localItem.product;

      // Validate product and stock
      const product = await Product.findById(productId);
      if (!product || product.status !== 'ACTIVE') {
        continue; // Skip invalid products
      }

      const availableStock = product.availability?.quantity || 0;
      const quantity = Math.min(localItem.quantity, availableStock);

      if (quantity < 1) continue;

      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(
        (item) => item.product.toString() === productId
      );

      if (existingItemIndex > -1) {
        // Update quantity (take max of local and server)
        const newQuantity = Math.max(cart.items[existingItemIndex].quantity, quantity);
        cart.items[existingItemIndex].quantity = Math.min(newQuantity, availableStock);
        cart.items[existingItemIndex].rental = localItem.rental;
      } else {
        // Add new item
        cart.items.push({
          product: productId,
          quantity: quantity,
          rental: localItem.rental || {
            startDate: null,
            endDate: null,
            duration: 1
          }
        });
      }
    }

    await cart.save();

    await cart.populate({
      path: 'items.product',
      select: 'title images pricing availability status owner',
      populate: {
        path: 'owner',
        select: 'profile.firstName email phone address'
      }
    });

    return cart;
  }

  /**
   * Validate cart before checkout
   */
  async validateCart(userId) {
    const cart = await this.getCart(userId);
    const errors = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.product._id);

      if (!product) {
        errors.push({
          productId: item.product._id,
          message: 'Sản phẩm không còn tồn tại'
        });
        continue;
      }

      if (product.status !== 'ACTIVE') {
        errors.push({
          productId: item.product._id,
          message: 'Sản phẩm không còn khả dụng'
        });
        continue;
      }

      const availableStock = product.availability?.quantity || 0;
      if (item.quantity > availableStock) {
        errors.push({
          productId: item.product._id,
          message: `Chỉ còn ${availableStock} sản phẩm trong kho (bạn đang chọn ${item.quantity})`
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      cart: cart
    };
  }
}

module.exports = new CartService();
