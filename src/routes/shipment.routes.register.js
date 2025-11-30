const router = require('./shipment.routes');
const { registerRoute } = require('./register.routes');

registerRoute('/shipments', router);

module.exports = router;
