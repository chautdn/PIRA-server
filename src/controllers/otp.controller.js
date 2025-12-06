const OTPService = require('../services/otp.service');
const Contract = require('../models/Contract');
const User = require('../models/User');
const { SuccessResponse } = require('../core/success');
const { BadRequest, NotFoundError, ForbiddenError } = require('../core/error');

class OTPController {
  /**
   * Send OTP for contract signing
   * POST /api/otp/contract-signing/send
   * Body: { contractId }
   */
  async sendContractSigningOTP(req, res) {
    try {
      const { contractId } = req.body;
      const userId = req.user._id;

      // Validate contract ID
      if (!contractId) {
        throw new BadRequest('Contract ID là bắt buộc');
      }

      // Find contract
      const contract = await Contract.findById(contractId)
        .populate('renter', 'firstName lastName email')
        .populate('owner', 'firstName lastName email')
        .populate('subOrder', 'subOrderNumber');

      if (!contract) {
        throw new NotFoundError('Không tìm thấy hợp đồng');
      }

      // Check if contract is already signed
      if (contract.status === 'SIGNED') {
        throw new BadRequest('Hợp đồng đã được ký bởi cả hai bên');
      }

      // Determine user role (owner or renter)
      let userRole = null;
      let userName = null;
      let userEmail = null;

      if (contract.owner._id.toString() === userId.toString()) {
        userRole = 'owner';
        userName = `${contract.owner.firstName} ${contract.owner.lastName}`.trim();
        userEmail = contract.owner.email;

        // Check if owner has already signed
        if (contract.signatures?.owner?.signature) {
          throw new BadRequest('Bạn đã ký hợp đồng này rồi');
        }
      } else if (contract.renter._id.toString() === userId.toString()) {
        userRole = 'renter';
        userName = contract.renter.fullName;
        userEmail = contract.renter.email;

        // Check if renter has already signed
        if (contract.signatures?.renter?.signature) {
          throw new BadRequest('Bạn đã ký hợp đồng này rồi');
        }
      } else {
        throw new ForbiddenError('Bạn không có quyền ký hợp đồng này');
      }

      // Send OTP
      const result = await OTPService.sendOTP({
        userId: userId.toString(),
        contractId: contractId.toString(),
        userEmail,
        userName,
        userRole,
        orderId: contract.masterOrder?.masterOrderNumber || contractId.toString().slice(-6)
      });

      return new SuccessResponse({
        message: result.message,
        data: {
          expiresAt: result.expiresAt,
          sentCount: result.sentCount,
          remainingAttempts: result.remainingAttempts
        }
      }).send(res);
    } catch (error) {
      console.error('❌ Error sending contract signing OTP:', error);
      // Return error response instead of throwing
      return res.status(error.statusCode || 500).json({
        status: error.status || 'error',
        message: error.message
      });
    }
  }

  /**
   * Verify OTP for contract signing
   * POST /api/otp/contract-signing/verify
   * Body: { contractId, otp }
   */
  async verifyContractSigningOTP(req, res) {
    try {
      const { contractId, otp } = req.body;
      const userId = req.user._id;

      // Validate input
      if (!contractId || !otp) {
        throw new BadRequest('Contract ID và mã OTP là bắt buộc');
      }

      // Verify contract exists and user has permission
      const contract = await Contract.findById(contractId);
      if (!contract) {
        throw new NotFoundError('Không tìm thấy hợp đồng');
      }

      const isOwner = contract.owner.toString() === userId.toString();
      const isRenter = contract.renter.toString() === userId.toString();

      if (!isOwner && !isRenter) {
        throw new ForbiddenError('Bạn không có quyền xác minh OTP cho hợp đồng này');
      }

      // Verify OTP
      const result = await OTPService.verifyOTP({
        userId: userId.toString(),
        contractId: contractId.toString(),
        otp
      });

      return new SuccessResponse({
        message: result.message,
        data: { verified: true }
      }).send(res);
    } catch (error) {
      console.error('❌ Error verifying contract signing OTP:', error);
      // Return error response instead of throwing
      return res.status(error.statusCode || 400).json({
        status: error.status || 'fail',
        message: error.message
      });
    }
  }

  /**
   * Get OTP status (for debugging)
   * GET /api/otp/contract-signing/status/:contractId
   */
  async getOTPStatus(req, res) {
    try {
      const { contractId } = req.params;
      const userId = req.user._id;

      const status = OTPService.getOTPStatus(userId.toString(), contractId);

      return new SuccessResponse({
        message: 'OTP status retrieved',
        data: status
      }).send(res);
    } catch (error) {
      console.error('❌ Error getting OTP status:', error);
      // Return error response instead of throwing
      return res.status(error.statusCode || 500).json({
        status: error.status || 'error',
        message: error.message
      });
    }
  }
}

module.exports = new OTPController();
