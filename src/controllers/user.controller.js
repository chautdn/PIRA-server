const { SuccessResponse } = require('../core/success');
const responseUtils = require('../utils/response'); // Thêm dòng này
const {
  createUser,
  getAllUsers,
  deleteUser,
  getProfile,
  updateProfile,
  updateProfileByKyc,
  changePassword,
  verifyPassword,
  createReport,
  getUserReports,
  getReportById,
  addBankAccount,
  updateBankAccount,
  removeBankAccount,
  getBankAccount,
  VIETNAMESE_BANKS,
  uploadAvatar
} = require('../services/user.service');

exports.getUsers = async (req, res) => {
  const users = await getAllUsers();

  return SuccessResponse.ok(res, users, 'Users retrieved successfully');
};
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return responseUtils.error(res, 'Vui lòng chọn ảnh avatar', 400);
    }

    const avatarUrl = await uploadAvatar(req.user.id, req.file.buffer);
    return SuccessResponse.ok(res, { avatarUrl }, 'Upload avatar thành công');
  } catch (error) {
    console.error('Upload avatar error:', error);
    return responseUtils.error(res, error.message, 400);
  }
};

exports.createUser = async (req, res) => {
  const user = await createUser(req.body);
  return SuccessResponse.created(res, user, 'User created successfully');
};

exports.deleteUser = async (req, res) => {
  const user = await deleteUser(req.params.id);
  return SuccessResponse.ok(res, user, 'User deleted successfully');
};
exports.getProfile = async (req, res) => {
  const user = await getProfile(req.user.id);
  return SuccessResponse.ok(res, user, 'User profile retrieved successfully');
};
exports.updateProfile = async (req, res) => {
  const user = await updateProfile(req.user.id, req.body);
  return SuccessResponse.ok(res, user, 'User profile updated successfully');
};

exports.updateProfileByKyc = async (req, res) => {
  try {
    const user = await updateProfileByKyc(req.user.id);
    return SuccessResponse.ok(res, user, 'Đã áp dụng thông tin KYC vào profile thành công');
  } catch (error) {
    console.error('Update profile by KYC error:', error);
    return responseUtils.error(res, error.message, 400);
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return responseUtils.error(res, 'Mật khẩu hiện tại và mật khẩu mới là bắt buộc', 400);
    }

    if (newPassword.length < 6) {
      return responseUtils.error(res, 'Mật khẩu mới phải có ít nhất 6 ký tự', 400);
    }

    const result = await changePassword(req.user.id, currentPassword, newPassword);
    return SuccessResponse.ok(res, null, 'Đổi mật khẩu thành công');
  } catch (error) {
    console.error('Change password error:', error);
    return responseUtils.error(res, error.message, 400);
  }
};

exports.verifyPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return responseUtils.error(res, 'Mật khẩu là bắt buộc', 400);
    }

    const result = await verifyPassword(req.user.id, password);
    return SuccessResponse.ok(res, result, 'Xác thực mật khẩu thành công');
  } catch (error) {
    console.error('Verify password error:', error);
    return responseUtils.error(res, error.message, 400);
  }
};

// ========== REPORT MANAGEMENT ==========
exports.createReport = async (req, res) => {
  try {
    console.log('=== User Controller createReport ===');
    console.log('Request body:', req.body);
    console.log('User ID:', req.user.id);

    const report = await createReport(req.body, req.user.id);
    return responseUtils.success(res, report, 'Gửi báo cáo thành công');
  } catch (error) {
    console.error('Create report error:', error);

    if (
      error.name === 'ValidationError' ||
      error.message.includes('bắt buộc') ||
      error.message.includes('không hợp lệ')
    ) {
      return responseUtils.error(res, error.message, 400);
    } else if (error.name === 'NotFoundError' || error.message.includes('không tồn tại')) {
      return responseUtils.error(res, error.message, 404);
    } else {
      return responseUtils.error(res, 'Có lỗi xảy ra khi gửi báo cáo', 500);
    }
  }
};

exports.getUserReports = async (req, res) => {
  try {
    console.log('=== User Controller getUserReports ===');
    console.log('Query params:', req.query);
    console.log('User ID:', req.user.id);

    const { page = 1, limit = 10, status } = req.query;
    const filters = { page, limit, status };

    const result = await getUserReports(req.user.id, filters);
    return responseUtils.success(res, result, 'Lấy danh sách báo cáo thành công');
  } catch (error) {
    console.error('Get user reports error:', error);
    return responseUtils.error(res, 'Có lỗi xảy ra khi lấy danh sách báo cáo', 500);
  }
};

exports.getReportById = async (req, res) => {
  try {
    console.log('=== User Controller getReportById ===');
    console.log('Report ID:', req.params.reportId);
    console.log('User ID:', req.user.id);

    const report = await getReportById(req.params.reportId, req.user.id);
    return responseUtils.success(res, report, 'Lấy chi tiết báo cáo thành công');
  } catch (error) {
    console.error('Get report by ID error:', error);

    if (error.name === 'NotFoundError' || error.message.includes('không tồn tại')) {
      return responseUtils.error(res, error.message, 404);
    } else {
      return responseUtils.error(res, 'Có lỗi xảy ra khi lấy chi tiết báo cáo', 500);
    }
  }
};
// Bank Account Management
exports.getBankAccount = async (req, res) => {
  try {
    const bankAccount = await getBankAccount(req.user.id);
    return SuccessResponse.ok(res, { bankAccount }, 'Bank account retrieved successfully');
  } catch (error) {
    return responseUtils.error(res, error.message, 400);
  }
};

exports.addBankAccount = async (req, res) => {
  try {
    const user = await addBankAccount(req.user.id, req.body);
    return SuccessResponse.ok(
      res,
      { bankAccount: user.bankAccount },
      'Bank account added successfully'
    );
  } catch (error) {
    return responseUtils.error(res, error.message, 400);
  }
};

exports.updateBankAccount = async (req, res) => {
  try {
    const user = await updateBankAccount(req.user.id, req.body);
    return SuccessResponse.ok(
      res,
      { bankAccount: user.bankAccount },
      'Bank account updated successfully'
    );
  } catch (error) {
    return responseUtils.error(res, error.message, 400);
  }
};

exports.removeBankAccount = async (req, res) => {
  try {
    const result = await removeBankAccount(req.user.id);
    return SuccessResponse.ok(res, result, 'Bank account removed successfully');
  } catch (error) {
    return responseUtils.error(res, error.message, 400);
  }
};

exports.getVietnameseBanks = async (req, res) => {
  const banks = Object.entries(VIETNAMESE_BANKS).map(([code, data]) => ({
    code,
    name: data.name
  }));
  return SuccessResponse.ok(res, { banks }, 'Vietnamese banks retrieved successfully');
};
