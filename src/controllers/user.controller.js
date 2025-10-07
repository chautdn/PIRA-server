const { SuccessResponse } = require('../core/success');
const responseUtils = require('../utils/response'); // Thêm dòng này
const {
  createUser,
  getAllUsers,
  deleteUser,
  getProfile,
  updateProfile,
  updateProfileByKyc
} = require('../services/user.service');

exports.getUsers = async (req, res) => {
  const users = await getAllUsers();

  return SuccessResponse.ok(res, users, 'Users retrieved successfully');
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
