const router = require('./earlyReturn.routes');
const { registerRoute } = require('./register.routes');

// Register early return routes
registerRoute('/early-returns', router);

module.exports = router;
