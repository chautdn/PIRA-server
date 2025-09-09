const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const userController = require('../controllers/user.controller');
const { registerRoute } = require('./register.routes');
const globalAsyncHandler = require('../middleware/handler');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');

require('dotenv').config();



const storage = multer.memoryStorage();

globalAsyncHandler(router);
router.post('/register', authController.registerUser);
router.post('/refresh', authController.refreshToken);
router.post('/login', authController.loginUser);
router.delete('/deleteUser/:id', authMiddleware.verifyToken, userController.deleteUser);
router.get(
  '/getUsers',
  authMiddleware.verifyToken,
  authMiddleware.checkUserRole('admin'),
  userController.getUsers
);
router.post('/googlelogin', authController.googleSignIn);
router.get('/verify-email', authController.verifyEmail);
router.post('/reset-password', authController.resetPassword);
router.post('/forgot-password', authController.forgotPassword);

//router.get('/dashboard', authMiddleware, checkUserRole('admin'), authController.dashboard);
registerRoute('/auth', router);

module.exports = router;
