const { SuccessResponse } = require('../core/success');
const { createUser, getAllUsers, deleteUser} = require('../services/user.service');

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

