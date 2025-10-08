const cartService = require('../services/cart.service');
const { SuccessResponse } = require('../core/success');
const { BadRequestError } = require('../core/error');

class CartController {
  /**
   * @desc Get user's cart
   * @route GET /api/cart
   * @access Private
   */
  async getCart(req, res) {
    const cart = await cartService.getCart(req.user._id);
    
    new SuccessResponse({
      message: 'Lấy giỏ hàng thành công',
      data: cart
    }).send(res);
  }

  /**
   * @desc Add item to cart
   * @route POST /api/cart
   * @access Private
   */
  async addToCart(req, res) {
    const { productId, quantity = 1, rental } = req.body;

    if (!productId) {
      throw new BadRequestError('Product ID là bắt buộc');
    }

    const cart = await cartService.addToCart(
      req.user._id,
      productId,
      quantity,
      rental
    );

    new SuccessResponse({
      message: 'Đã thêm sản phẩm vào giỏ hàng',
      data: cart
    }).send(res);
  }

  /**
   * @desc Update item quantity
   * @route PUT /api/cart/:productId
   * @access Private
   */
  async updateQuantity(req, res) {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 0) {
      throw new BadRequestError('Số lượng không hợp lệ');
    }

    const cart = await cartService.updateQuantity(
      req.user._id,
      productId,
      quantity
    );

    new SuccessResponse({
      message: 'Đã cập nhật số lượng',
      data: cart
    }).send(res);
  }

  /**
   * @desc Update rental dates
   * @route PUT /api/cart/:productId/rental
   * @access Private
   */
  async updateRental(req, res) {
    const { productId } = req.params;
    const { rental } = req.body;

    if (!rental) {
      throw new BadRequestError('Thông tin thuê là bắt buộc');
    }

    const cart = await cartService.updateRental(
      req.user._id,
      productId,
      rental
    );

    new SuccessResponse({
      message: 'Đã cập nhật thông tin thuê',
      data: cart
    }).send(res);
  }

  /**
   * @desc Remove item from cart
   * @route DELETE /api/cart/:productId
   * @access Private
   */
  async removeItem(req, res) {
    const { productId } = req.params;

    const cart = await cartService.removeItem(req.user._id, productId);

    new SuccessResponse({
      message: 'Đã xóa sản phẩm khỏi giỏ hàng',
      data: cart
    }).send(res);
  }

  /**
   * @desc Clear cart
   * @route DELETE /api/cart
   * @access Private
   */
  async clearCart(req, res) {
    const cart = await cartService.clearCart(req.user._id);

    new SuccessResponse({
      message: 'Đã xóa toàn bộ giỏ hàng',
      data: cart
    }).send(res);
  }

  /**
   * @desc Sync cart from localStorage
   * @route POST /api/cart/sync
   * @access Private
   */
  async syncCart(req, res) {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      throw new BadRequestError('Items phải là một mảng');
    }

    const cart = await cartService.syncCart(req.user._id, items);

    new SuccessResponse({
      message: 'Đã đồng bộ giỏ hàng',
      data: cart
    }).send(res);
  }

  /**
   * @desc Validate cart before checkout
   * @route POST /api/cart/validate
   * @access Private
   */
  async validateCart(req, res) {
    const result = await cartService.validateCart(req.user._id);

    if (!result.valid) {
      new SuccessResponse({
        message: 'Giỏ hàng có lỗi',
        data: result
      }).send(res);
    } else {
      new SuccessResponse({
        message: 'Giỏ hàng hợp lệ',
        data: result
      }).send(res);
    }
  }
}

module.exports = new CartController();

