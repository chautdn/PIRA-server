const router = require('./returnShipment.routes');
const { registerRoute } = require('./register.routes');

registerRoute('/return-shipments', router);

module.exports = router;
