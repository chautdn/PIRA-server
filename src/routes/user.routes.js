const express = require('express');
const router = express.Router();
const { createUser, getUsers } = require('../controllers/user.controller');
const { registerRoute } = require('./register.routes');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware.checkUserRole('admin'), getUsers); // Lấy danh sách user
router.post('/create', authMiddleware.checkUserRole('admin'), createUser); // Tạo user mới

registerRoute('/users', router);

module.exports = router;
