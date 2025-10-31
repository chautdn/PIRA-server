const express = require('express');
const WishlistController = require('../controllers/wishlist.controller');
const { registerRoute } = require('./register.routes');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Thêm sản phẩm vào wishlist
// router.post('/add', authMiddleware.isAuthenticated, WishlistController.addToWishlist);
// // Xóa sản phẩm khỏi wishlist
// router.post('/remove', authMiddleware.isAuthenticated, WishlistController.removeFromWishlist);
// // Lấy danh sách wishlist của user
// router.get('/:userId', authMiddleware.isAuthenticated, WishlistController.getWishlist);
router.post('/add', WishlistController.addToWishlist);
// Xóa sản phẩm khỏi wishlist
router.post('/remove', WishlistController.removeFromWishlist);
// Lấy danh sách wishlist của user
router.get('/:userId', WishlistController.getWishlist);

registerRoute('/wishlist', router);

module.exports = router;
