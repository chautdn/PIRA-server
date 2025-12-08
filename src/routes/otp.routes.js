const express = require('express');
const router = express.Router();
const OTPController = require('../controllers/otp.controller');
const { authMiddleware } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { body, param } = require('express-validator');

// Middleware xác thực cho tất cả routes
router.use(authMiddleware.verifyToken);

/**
 * Send OTP for contract signing
 * POST /api/otp/contract-signing/send
 */
router.post(
  '/contract-signing/send',
  [body('contractId').isMongoId().withMessage('Contract ID không hợp lệ'), validateRequest],
  OTPController.sendContractSigningOTP
);

/**
 * Verify OTP for contract signing
 * POST /api/otp/contract-signing/verify
 */
router.post(
  '/contract-signing/verify',
  [
    body('contractId').isMongoId().withMessage('Contract ID không hợp lệ'),
    body('otp')
      .isLength({ min: 6, max: 6 })
      .withMessage('Mã OTP phải có 6 chữ số')
      .isNumeric()
      .withMessage('Mã OTP chỉ chứa số'),
    validateRequest
  ],
  OTPController.verifyContractSigningOTP
);

/**
 * Get OTP status (for debugging)
 * GET /api/otp/contract-signing/status/:contractId
 */
router.get(
  '/contract-signing/status/:contractId',
  [param('contractId').isMongoId().withMessage('Contract ID không hợp lệ'), validateRequest],
  OTPController.getOTPStatus
);

module.exports = router;
