const { registerRoute } = require('./register.routes');
const router = require('./upload.routes');

registerRoute('/upload', router);
