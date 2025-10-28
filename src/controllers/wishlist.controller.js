const WishlistService = require('../services/wishlist.service');

// Add item to wishlist
exports.addToWishlist = async (req, res) => {
	try {
		const { userId, productId } = req.body;
		const wishlist = await WishlistService.addItem(userId, productId);
		res.status(201).json({ message: 'Item added to wishlist', wishlist });
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
};

// Get user's wishlist
exports.getWishlist = async (req, res) => {
	try {
		const { userId } = req.params;
		const wishlist = await WishlistService.getWishlist(userId);
		res.status(200).json({ wishlist });
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
};

// Remove item from wishlist
exports.removeFromWishlist = async (req, res) => {
	try {
		const { userId, productId } = req.body;
		const wishlist = await WishlistService.removeItem(userId, productId);
		res.status(200).json({ message: 'Item removed from wishlist', wishlist });
	} catch (error) {
		res.status(500).json({ message: error.message });
	}
};
