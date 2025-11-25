const cartService = require('../services/cart.service');
const { SuccessResponse } = require('../core/success');
const { BadRequest } = require('../core/error');

// Async handler wrapper to catch errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

class CartController {
  /**
   * @desc Get user's cart
   * @route GET /api/cart
   * @access Private
   */
  getCart = asyncHandler(async (req, res) => {
    const cart = await cartService.getCart(req.user._id);

    new SuccessResponse(cart, 'Lấy giỏ hàng thành công').send(res);
  });

  /**
   * @desc Add item to cart
   * @route POST /api/cart
   * @access Private
   */
  addToCart = asyncHandler(async (req, res) => {
    const { productId, quantity = 1, rental } = req.body;

    if (!productId) {
      throw new BadRequest('Product ID là bắt buộc');
    }

    const cart = await cartService.addToCart(req.user._id, productId, quantity, rental);

    new SuccessResponse(cart, 'Đã thêm sản phẩm vào giỏ hàng').send(res);
  });

  /**
   * @desc Update item quantity
   * @route PUT /api/cart/:productId
   * @access Private
   */
  updateQuantity = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 0) {
      throw new BadRequest('Số lượng không hợp lệ');
    }

    const cart = await cartService.updateQuantity(req.user._id, productId, quantity);

    new SuccessResponse(cart, 'Đã cập nhật số lượng').send(res);
  });

  /**
   * @desc Update rental dates
   * @route PUT /api/cart/:productId/rental
   * @access Private
   */
  updateRental = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { rental } = req.body;

    if (!rental) {
      throw new BadRequest('Thông tin thuê là bắt buộc');
    }

    const cart = await cartService.updateRental(req.user._id, productId, rental);

    new SuccessResponse(cart, 'Đã cập nhật thông tin thuê').send(res);
  });

  /**
   * @desc Update item quantity by itemId
   * @route PUT /api/cart/item/:itemId
   * @access Private
   */
  updateQuantityByItemId = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 0) {
      throw new BadRequest('Số lượng không hợp lệ');
    }

    const cart = await cartService.updateQuantityByItemId(req.user._id, itemId, quantity);

    new SuccessResponse(cart, 'Đã cập nhật số lượng').send(res);
  });

  /**
   * @desc Update rental dates by itemId
   * @route PUT /api/cart/item/:itemId/rental
   * @access Private
   */
  updateRentalByItemId = asyncHandler(async (req, res) => {
    const { itemId } = req.params;
    const { rental } = req.body;

    if (!rental) {
      throw new BadRequest('Thông tin thuê là bắt buộc');
    }

    const cart = await cartService.updateRentalByItemId(req.user._id, itemId, rental);

    new SuccessResponse(cart, 'Đã cập nhật thông tin thuê').send(res);
  });

  /**
   * @desc Remove item from cart by itemId
   * @route DELETE /api/cart/item/:itemId
   * @access Private
   */
  removeItemById = asyncHandler(async (req, res) => {
    const { itemId } = req.params;

    const cart = await cartService.removeItemById(req.user._id, itemId);

    new SuccessResponse(cart, 'Đã xóa item khỏi giỏ hàng').send(res);
  });

  /**
   * @desc Remove item from cart
   * @route DELETE /api/cart/:productId
   * @access Private
   */
  removeItem = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    const cart = await cartService.removeItem(req.user._id, productId);

    new SuccessResponse(cart, 'Đã xóa sản phẩm khỏi giỏ hàng').send(res);
  });

  /**
   * @desc Clear cart
   * @route DELETE /api/cart
   * @access Private
   */
  clearCart = asyncHandler(async (req, res) => {
    const cart = await cartService.clearCart(req.user._id);

    new SuccessResponse(cart, 'Đã xóa toàn bộ giỏ hàng').send(res);
  });

  /**
   * @desc Sync cart from localStorage
   * @route POST /api/cart/sync
   * @access Private
   */
  syncCart = asyncHandler(async (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      throw new BadRequest('Items phải là một mảng');
    }

    const cart = await cartService.syncCart(req.user._id, items);

    new SuccessResponse(cart, 'Đã đồng bộ giỏ hàng').send(res);
  });

  /**
   * @desc Validate cart before checkout
   * @route POST /api/cart/validate
   * @access Private
   */
  validateCart = asyncHandler(async (req, res) => {
    const result = await cartService.validateCart(req.user._id);

    const message = result.valid ? 'Giỏ hàng hợp lệ' : 'Giỏ hàng có lỗi';
    new SuccessResponse(result, message).send(res);
  });

  /**
   * @desc Check product availability for dates (basic validation only)
   * @route POST /api/cart/check-availability
   * @access Public
   */
  checkAvailability = asyncHandler(async (req, res) => {
    const { productId, startDate, endDate } = req.body;

    if (!productId || !startDate || !endDate) {
      throw new BadRequest('Product ID và ngày thuê là bắt buộc');
    }

    const result = await cartService.checkDateAvailability(
      productId,
      startDate,
      endDate,
      req.user?._id
    );

    new SuccessResponse(result, 'Kiểm tra thành công').send(res);
  });

  /**
   * @desc Get month availability for product
   * @route GET /api/cart/month-availability/:productId/:year/:month
   * @access Public
   */
  getMonthAvailability = asyncHandler(async (req, res) => {
    const { productId, year, month } = req.params;

    if (!productId || !year || month === undefined) {
      throw new BadRequest('Product ID, năm và tháng là bắt buộc');
    }

    const result = await cartService.getMonthAvailability(
      productId,
      parseInt(year),
      parseInt(month)
    );

    new SuccessResponse(result, 'Lấy thông tin thành công').send(res);
  });

  /**
   * @desc Validate cart availability against real bookings
   * @route POST /api/cart/validate-availability
   * @access Private
   */
  validateCartAvailability = asyncHandler(async (req, res) => {
    const cartValidationService = require('../services/cartValidation.service');

    const result = await cartValidationService.validateCartItems(req.user._id);
    const suggestions = result.hasInvalidItems
      ? await cartValidationService.getSuggestionsForInvalidItems(req.user._id)
      : [];

    new SuccessResponse(
      {
        ...result,
        suggestions
      },
      result.message
    ).send(res);
  });
}

module.exports = new CartController();
