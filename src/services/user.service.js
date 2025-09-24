const User = require('../models/User');
const { NotFoundError, ValidationError, DatabaseError } = require('../core/error');

const getAllUsers = async () => {
  const users = await User.find();

  if (!users || users.length === 0) {
    throw new NotFoundError('Users');
  }

  return users;
};

const createUser = async (userParam) => {
  if (!userParam.email || !userParam.password) {
    throw new ValidationError('Email and password are required');
  }

  const user = new User(userParam);
  const savedUser = await user.save();

  if (!savedUser) {
    throw new DatabaseError('Failed to create user');
  }
  return savedUser;
};
const deleteUser = async (id) => {
  const user = await User.findByIdAndDelete(id);
  if (!user) {
    throw new NotFoundError('User');
  }
  return user;
};

module.exports = {
  getAllUsers,
  createUser,
  deleteUser
};
