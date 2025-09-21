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
require('./products.routes');

// Apply global async handler to router
globalAsyncHandler(router);

// Register all routes from the registry
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

module.exports = router;
