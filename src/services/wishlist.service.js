const Favorite = require('../models/Favorite');
const Product = require('../models/Product');

const WishlistService = {
  // Thêm sản phẩm vào wishlist
  async addItem(userId, productId) {
    // Kiểm tra đã tồn tại chưa
    let favorite = await Favorite.findOne({ user: userId, product: productId });
    if (!favorite) {
      favorite = await Favorite.create({ user: userId, product: productId });
    }
    return favorite;
  },

  // Lấy danh sách wishlist của user
  async getWishlist(userId) {
    return Favorite.find({ user: userId }).populate('product');
  },

  // Xóa sản phẩm khỏi wishlist
  async removeItem(userId, productId) {
    await Favorite.deleteOne({ user: userId, product: productId });
    return Favorite.find({ user: userId }).populate('product');
  },
};

module.exports = WishlistService;
