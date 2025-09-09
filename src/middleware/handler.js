const { METHODS } = require('../utils/constant');

const handleError = (error, next) => {
  // Ensure error is an Error object
  if (!(error instanceof Error)) {
    error = new Error(typeof error === 'string' ? error : 'Unknown error!');
  }
  // Log error for debugging
  console.error('Error caught by global handler:', {
    name: error.name,
    message: error.message,
    stack: error.stack
  });

  next(error);
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);

      // Handle Promises and async functions
      if (result && typeof result.catch === 'function') {
        result.catch((error) => handleError(error, next));
      }

      // Handle EventEmitters and Streams
      if (result && typeof result.on === 'function') {
        result.on('error', (error) => handleError(error, next));
      }
    } catch (error) {
      handleError(error);
    }
  };
};

const globalAsyncHandler = (router) => {
  METHODS.forEach((method) => {
    const original = router[method].bind(router);

    router[method] = function (path, ...handlers) {
      // console.log({
      //   method,
      //   path,
      //   handlers
      // });

      // Handle middleware mounting (use case)
      if (method === 'use' && typeof path === 'function') {
        handlers.unshift(path);
        path = '/';
      }

      // Handle sub-router mounting
      if (method === 'use' && path.stack) {
        return original.call(this, path);
      }

      // Wrap handlers with asyncHandler
      const wrappedHandlers = handlers.map((handler) => {
        if (typeof handler === 'function') {
          return asyncHandler(handler);
        }
        return handler;
      });

      // domain-based error handling
      const domainHandler = (req, res, next) => {
        const domain = require('domain').create();

        domain.on('error', (error) => {
          handleError(error, next);
        });

        domain.run(() => {
          // Set unhandled rejection handler for this request
          const rejectHandler = (error) => handleError(error);

          process.once('unhandledRejection', rejectHandler);

          // Clean up after request is done
          res.on('finish', () => {
            process.removeAllListeners('unhandledRejection', rejectHandler);
            domain.exit();
          });

          next();
        });
      };

      // Add domain handler at the start
      wrappedHandlers.unshift(domainHandler);

      return original.call(this, path, ...wrappedHandlers);
    };
  });

  return router;
};

module.exports = globalAsyncHandler;
