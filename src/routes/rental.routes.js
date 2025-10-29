const { registerRoute } = require('./register.routes');
const rentalRouter = require('./rental');

// Đăng ký router cho rental system
registerRoute('/rental', rentalRouter);

module.exports = rentalRouter;
