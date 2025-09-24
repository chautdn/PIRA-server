const User = require('../models/User');
const { NotFoundError, ValidationError, DatabaseError } = require('../core/error');
const { encryptCCCDNumber, validateNationalIdFormat } = require('./kyc.service');

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
const getProfile = async (id) => {
  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User');
  }
  return user;
};
const updateProfile = async (id, userParam) => {
  const user = await User.findByIdAndUpdate(id, userParam, { new: true });
  if (!user) {
    throw new NotFoundError('User');
  }
  return user;
};
const updateProfileByKyc = async (id) => {
  try {
    const user = await User.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Kiểm tra có thông tin KYC đã xác thực không
    if (!user.cccd || !user.cccd.isVerified) {
      throw new ValidationError('Chưa có thông tin KYC được xác thực');
    }

    // **LẤY THÔNG TIN TỪ CÁC FIELD CHÍNH CỦA CCCD**
    const cccdData = user.cccd;

    // Kiểm tra có thông tin cần thiết không
    if (!cccdData.fullName) {
      throw new ValidationError('Không tìm thấy thông tin họ tên trong CCCD');
    }

    const updates = {};

    console.log('🔄 Applying CCCD data to profile:', {
      fullName: cccdData.fullName,
      dateOfBirth: cccdData.dateOfBirth,
      gender: cccdData.gender,
      address: cccdData.address
    });

    // **CẬP NHẬT PROFILE TỪ THÔNG TIN CCCD**

    // Cập nhật tên từ CCCD
    if (cccdData.fullName) {
      const nameParts = cccdData.fullName.trim().split(' ');
      if (nameParts.length >= 2) {
        updates['profile.lastName'] = nameParts[nameParts.length - 1]; // Tên
        updates['profile.firstName'] = nameParts.slice(0, -1).join(' '); // Họ và tên đệm
      } else {
        updates['profile.firstName'] = cccdData.fullName;
      }
    }

    // Cập nhật ngày sinh từ CCCD
    if (cccdData.dateOfBirth) {
      updates['profile.dateOfBirth'] = cccdData.dateOfBirth;
    }

    // Cập nhật giới tính từ CCCD
    if (cccdData.gender) {
      updates['profile.gender'] = cccdData.gender;
    }

    // Cập nhật địa chỉ từ CCCD
    if (cccdData.address) {
      updates['address.streetAddress'] = cccdData.address;
    }

    console.log('📝 Updates to apply:', updates);

    // Áp dụng các thay đổi
    const updatedUser = await User.findByIdAndUpdate(id, { $set: updates }, { new: true });

    console.log('✅ Profile updated successfully from CCCD data');

    return updatedUser;
  } catch (error) {
    console.error('❌ Update profile by KYC error:', error);
    throw error;
  }
};

module.exports = {
  getAllUsers,
  createUser,
  deleteUser,
  getProfile,
  updateProfile,
  updateProfileByKyc
};
