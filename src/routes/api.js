const express = require('express');
const router = express.Router();
const globalAsyncHandler = require('../middleware/handler');
const getRoutes = require('./register.routes').getRoutes;

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'PIRA Server is running',
    timestamp: new Date().toISOString(),
    services: {
      chat: 'enabled',
      socketio: 'enabled'
    }
  });
});

//import router

require('./user.routes');
require('./auth.routes');
require('./chat.routes');
require('./category.routes');
require('./products.routes');
require('./kyc.routes');
require('./ownerProduct.routes');
require('./admin.routes');
require('./payment.routes');
require('./cart.routes');
require('./rating.routes');
require('./productPromotion.routes');
require('./rentalOrder.routes');
require('./report.routes');
require('./wishlist.routes');
require('./systemWallet.routes');
require('./earlyReturn.routes.register');
require('./systemPromotion.routes');
require('./shipment.routes.register');
require('./upload.routes.register');

// Withdrawal routes
const withdrawalRoutes = require('./withdrawal.routes');
router.use('/withdrawals', withdrawalRoutes);

// Notification routes
const notificationRoutes = require('./notification.routes');
router.use('/notifications', notificationRoutes);

// System Promotion routes
const systemPromotionRoutes = require('./systemPromotion.routes');
router.use('/system-promotions', systemPromotionRoutes);

// Voucher routes
const voucherRoutes = require('./voucher.routes');
router.use('/vouchers', voucherRoutes);

// User Wallet routes
const userWalletRoutes = require('./userWallet.routes');
router.use('/wallets', userWalletRoutes);

// Register all routes from the registry FIRST
getRoutes()?.forEach(({ path, router: moduleRouter }) => {
  if (!path || typeof path !== 'string') {
    throw new Error(`Invalid route path: ${path}`);
  }

  if (!moduleRouter || !moduleRouter.stack) {
    throw new Error(`Invalid router for path: ${path}`);
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  router.use(normalizedPath, moduleRouter);
});

// Apply global async handler to router AFTER registering routes
// globalAsyncHandler(router); // COMMENTED OUT - Causing issues with requests hanging

module.exports = router;
