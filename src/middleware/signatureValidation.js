const crypto = require('crypto');
const { BadRequestError, ForbiddenError } = require('../core/error');

/**
 * Middleware xác thực chữ ký số
 */
const validateSignature = (req, res, next) => {
  try {
    const { signature } = req.body;

    if (!signature) {
      throw new BadRequestError('Chữ ký là bắt buộc');
    }

    // Kiểm tra định dạng chữ ký base64
    if (!/^[A-Za-z0-9+/]+=*$/.test(signature)) {
      throw new BadRequestError('Định dạng chữ ký không hợp lệ');
    }

    // Kiểm tra độ dài chữ ký (tối thiểu 100 ký tự)
    if (signature.length < 100) {
      throw new BadRequestError('Chữ ký quá ngắn');
    }

    // Tạo hash của chữ ký để lưu trữ
    req.body.signatureHash = crypto.createHash('sha256').update(signature).digest('hex');

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware kiểm tra quyền ký hợp đồng
 */
const checkSigningPermission = async (req, res, next) => {
  try {
    const Contract = require('../models/Contract');
    const { contractId } = req.params;
    const userId = req.user.id;

    const contract = await Contract.findById(contractId);

    if (!contract) {
      throw new BadRequestError('Hợp đồng không tồn tại');
    }

    // Kiểm tra xem người dùng có quyền ký hợp đồng này không
    const isOwner = contract.owner.toString() === userId;
    const isRenter = contract.renter.toString() === userId;

    if (!isOwner && !isRenter) {
      throw new ForbiddenError('Không có quyền ký hợp đồng này');
    }

    // Kiểm tra trạng thái hợp đồng
    if (!['PENDING_OWNER', 'PENDING_RENTER'].includes(contract.status)) {
      throw new BadRequestError('Hợp đồng không ở trạng thái chờ ký');
    }

    // Kiểm tra xem người dùng đã ký chưa
    const userSigned = isOwner
      ? contract.signatures.owner.signed
      : contract.signatures.renter.signed;

    if (userSigned) {
      throw new BadRequestError('Bạn đã ký hợp đồng này rồi');
    }

    // Lưu thông tin để sử dụng trong controller
    req.contractInfo = {
      contract,
      isOwner,
      isRenter,
      userRole: isOwner ? 'owner' : 'renter'
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware rate limiting cho việc ký hợp đồng
 */
const rateLimit = require('express-rate-limit');

const contractSigningLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 phút
  max: 3, // Tối đa 3 lần ký trong 5 phút
  message: {
    success: false,
    message: 'Quá nhiều lần thử ký hợp đồng. Vui lòng thử lại sau 5 phút.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `contract_signing_${req.user.id}_${req.params.contractId}`;
  }
});

/**
 * Middleware kiểm tra IP address hợp lệ
 */
const validateIPAddress = (req, res, next) => {
  try {
    const ipAddress =
      req.ip ||
      req.connection.remoteAddress ||
      req.headers['x-forwarded-for']?.split(',')[0] ||
      '127.0.0.1';

    // Lưu IP address đã clean
    req.clientIP = ipAddress.replace(/^::ffff:/, '');

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateSignature,
  checkSigningPermission,
  contractSigningLimiter,
  validateIPAddress
};
