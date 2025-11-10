const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');
const { authMiddleware } = require('../middleware/auth');
const { registerRoute } = require('./register.routes');
const globalAsyncHandler = require('../middleware/handler');

// Check availability (public - no auth required)
router.post('/check-availability', cartController.checkAvailability);

// Get month availability (public)
router.get('/month-availability/:productId/:year/:month', cartController.getMonthAvailability);

// All other cart routes require authentication
router.use(authMiddleware.verifyToken);

// Get cart
router.get('/', cartController.getCart);

// Add to cart
router.post('/', cartController.addToCart);

// Sync cart from localStorage
router.post('/sync', cartController.syncCart);

// Validate cart
router.post('/validate', cartController.validateCart);

// Validate cart against real bookings
router.post('/validate-availability', cartController.validateCartAvailability);

// Update quantity
router.put('/:productId', cartController.updateQuantity);

// Update rental dates
router.put('/:productId/rental', cartController.updateRental);

// Remove item
router.delete('/:productId', cartController.removeItem);

// Clear cart
router.delete('/', cartController.clearCart);

// Apply global async handler - COMMENTED OUT TO PREVENT SERVER CRASH
// globalAsyncHandler(router);

// Register routes
registerRoute('/cart', router);

module.exports = router;
