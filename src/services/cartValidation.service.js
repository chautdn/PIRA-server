const cartService = require('../services/cart.service');
const { SuccessResponse } = require('../core/success');
const { BadRequest } = require('../core/error');

/**
 * Cart Validation Service - Validate cart items against real bookings
 */
class CartValidationService {
  /**
   * Validate all items in user's cart against current bookings
   * Called when: user opens cart, before checkout, after order confirmation
   */
  async validateCartItems(userId) {
    const cart = await cartService.getCart(userId);
    const validationResults = [];
    let hasInvalidItems = false;

    for (const item of cart.items) {
      const result = await this.validateCartItem(item);
      validationResults.push({
        productId: item.product._id,
        productTitle: item.product.title,
        ...result
      });

      if (!result.isValid) {
        hasInvalidItems = true;
      }
    }

    return {
      hasInvalidItems,
      results: validationResults,
      message: hasInvalidItems
        ? 'Một số sản phẩm trong giỏ hàng không còn khả dụng cho thời gian đã chọn'
        : 'Tất cả sản phẩm trong giỏ hàng đều khả dụng'
    };
  }

  /**
   * Validate single cart item
   */
  async validateCartItem(cartItem) {
    const { product, quantity, rental } = cartItem;

    if (!rental?.startDate || !rental?.endDate) {
      return {
        isValid: true,
        reason: null,
        availableCount: product.availability?.quantity || 0
      };
    }

    try {
      const availability = await cartService.checkDateAvailability(
        product._id,
        rental.startDate,
        rental.endDate
      );

      const isValid = availability.available && quantity <= availability.availableCount;

      return {
        isValid,
        reason: isValid
          ? null
          : quantity > availability.availableCount
            ? `Chỉ còn ${availability.availableCount} sản phẩm cho thời gian này`
            : availability.reason,
        availableCount: availability.availableCount,
        requestedQuantity: quantity
      };
    } catch (error) {
      return {
        isValid: false,
        reason: error.message,
        availableCount: 0,
        requestedQuantity: quantity
      };
    }
  }

  /**
   * Get suggestions for invalid cart items
   */
  async getSuggestionsForInvalidItems(userId) {
    const validation = await this.validateCartItems(userId);
    const suggestions = [];

    for (const result of validation.results) {
      if (!result.isValid && result.availableCount > 0) {
        suggestions.push({
          productId: result.productId,
          productTitle: result.productTitle,
          suggestion: `Có thể giảm số lượng xuống ${result.availableCount} hoặc chọn ngày khác`,
          maxAvailableQuantity: result.availableCount
        });
      } else if (!result.isValid) {
        suggestions.push({
          productId: result.productId,
          productTitle: result.productTitle,
          suggestion: 'Vui lòng chọn ngày khác hoặc xóa sản phẩm khỏi giỏ hàng',
          maxAvailableQuantity: 0
        });
      }
    }

    return suggestions;
  }
}

module.exports = new CartValidationService();
