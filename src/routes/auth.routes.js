const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const userController = require('../controllers/user.controller');
const { registerRoute } = require('./register.routes');
const globalAsyncHandler = require('../middleware/handler');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const { validateRegister, validateLogin, authLimiter } = require('../middleware/validation');

require('dotenv').config();

const storage = multer.memoryStorage();

globalAsyncHandler(router);

// Auth routes
router.post('/login', validateLogin, authController.loginUser);
router.post('/register', validateRegister, authController.registerUser);
router.post('/refresh', authController.refreshToken);
router.post('/googlelogin', authController.googleSignIn);
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerificationEmail);
router.post('/reset-password', authController.resetPassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/logout', authMiddleware.verifyToken, authController.logout);

registerRoute('/auth', router);

module.exports = router;
