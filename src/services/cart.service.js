const Cart = require('../models/Cart');
const Product = require('../models/Product');

class CartService {
  /**
   * Check if product is available for rental dates
   * Returns: { available: boolean, inCartCount: number, reason: string }
   */
  async checkDateAvailability(productId, startDate, endDate, excludeUserId = null) {
    const product = await Product.findById(productId);
    if (!product) {
      return { available: false, inCartCount: 0, reason: 'Sản phẩm không tồn tại' };
    }

    const totalStock = product.availability?.quantity || 0;

    // Get all carts that have this product with overlapping dates
    const carts = await Cart.find({
      'items.product': productId,
      ...(excludeUserId && { user: { $ne: excludeUserId } })
    });

    let inCartCount = 0;
    const requestStart = new Date(startDate);
    const requestEnd = new Date(endDate);

    for (const cart of carts) {
      const cartItem = cart.items.find(item => item.product.toString() === productId);
      if (!cartItem || !cartItem.rental?.startDate || !cartItem.rental?.endDate) {
        continue;
      }

      const cartStart = new Date(cartItem.rental.startDate);
      const cartEnd = new Date(cartItem.rental.endDate);

      // Check if dates overlap
      if (requestStart <= cartEnd && requestEnd >= cartStart) {
        inCartCount += cartItem.quantity;
      }
    }

    const available = (totalStock - inCartCount) > 0;
    const availableCount = totalStock - inCartCount;

    return {
      available,
      inCartCount,
      availableCount: Math.max(0, availableCount),
      totalStock,
      reason: available ? null : `Sản phẩm đã hết cho khung thời gian này. Có ${inCartCount} người đang đặt.`
    };
  }

  /**
   * Get availability for entire month (based on total stock only)
   * Returns object with dates as keys and availability info as values
   */
  async getMonthAvailability(productId, year, month) {
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Sản phẩm không tồn tại');
    }

    const totalStock = product.availability?.quantity || 0;
    
    // Get number of days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const availability = {};

    // All days have same availability (no booking check for soft reservation)
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const checkDate = new Date(year, month, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Only check if date is in past
      const isPast = checkDate < today;
      
      availability[dateStr] = {
        available: !isPast && totalStock > 0,
        availableCount: totalStock,
        bookedCount: 0, // Not tracking for soft reservation
        totalStock,
        status: isPast ? 'unavailable' : (totalStock > 0 ? 'available' : 'unavailable')
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
      select: 'title images pricing availability status'
    });

    if (!cart) {
      // Create new cart if doesn't exist
      cart = await Cart.create({ user: userId, items: [] });
    }

    // Filter out items with deleted products
    cart.items = cart.items.filter(item => item.product);

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

    // Find existing item in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    let newQuantity = quantity;
    if (existingItemIndex > -1) {
      newQuantity = cart.items[existingItemIndex].quantity + quantity;
    }

    // Validate total quantity against stock
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

      // Add warning if stock is running low
      if (dateCheck.availableCount <= 2 && dateCheck.inCartCount > 0) {
        availabilityWarning = `⚠️ Chỉ còn ${dateCheck.availableCount} sản phẩm cho ngày này. Có ${dateCheck.inCartCount} người khác đang đặt.`;
      }
    }

    if (existingItemIndex > -1) {
      // Update existing item
      cart.items[existingItemIndex].quantity = newQuantity;
      if (rental) {
        cart.items[existingItemIndex].rental = rental;
      }
      cart.items[existingItemIndex].addedAt = new Date();
    } else {
      // Add new item
      cart.items.push({
        product: productId,
        quantity: newQuantity,
        rental: rental || {
          startDate: null,
          endDate: null,
          duration: 1
        }
      });
    }

    await cart.save();
    
    // Populate and return
    await cart.populate({
      path: 'items.product',
      select: 'title images pricing availability status'
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

    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

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
      throw new Error(`Chỉ còn ${availableStock} sản phẩm trong kho`);
    }

    cart.items[itemIndex].quantity = quantity;
    await cart.save();

    await cart.populate({
      path: 'items.product',
      select: 'title images pricing availability status'
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

    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (itemIndex === -1) {
      throw new Error('Sản phẩm không có trong giỏ hàng');
    }

    cart.items[itemIndex].rental = rental;
    await cart.save();

    await cart.populate({
      path: 'items.product',
      select: 'title images pricing availability status'
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

    cart.items = cart.items.filter(
      item => item.product.toString() !== productId
    );

    await cart.save();

    await cart.populate({
      path: 'items.product',
      select: 'title images pricing availability status'
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
        item => item.product.toString() === productId
      );

      if (existingItemIndex > -1) {
        // Update quantity (take max of local and server)
        const newQuantity = Math.max(
          cart.items[existingItemIndex].quantity,
          quantity
        );
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
      select: 'title images pricing availability status'
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

