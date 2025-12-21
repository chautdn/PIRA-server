const User = require('../models/User');
const bcrypt = require('bcrypt');
const cloudinary = require('../config/cloudinary');
const { NotFoundError, ValidationError, DatabaseError } = require('../core/error');
const { encryptCCCDNumber, validateNationalIdFormat } = require('./kyc.service');

// Hàm chuẩn hóa địa chỉ từ IN HOA sang Title Case
const normalizeAddress = (address) => {
  if (!address || typeof address !== 'string') {
    return address;
  }

  const specialWords = {
    THÔN: 'Thôn',
    XÃ: 'Xã',
    PHƯỜNG: 'Phường',
    'THỊ TRẤN': 'Thị Trấn',
    QUẬN: 'Quận',
    HUYỆN: 'Huyện',
    'THÀNH PHỐ': 'Thành Phố',
    TỈNH: 'Tỉnh',
    TP: 'TP',
    TT: 'TT',
    TỔ: 'Tổ'
  };

  return address
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      for (const [upper, proper] of Object.entries(specialWords)) {
        if (trimmed.toUpperCase().startsWith(upper)) {
          const rest = trimmed.substring(upper.length).trim();
          if (rest) {
            const normalizedRest = rest
              .split(' ')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
            return `${proper} ${normalizedRest}`;
          }
          return proper;
        }
      }
      return trimmed
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    })
    .join(', ');
};

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
  const user = await User.findById(id).populate('wallet');
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

const changePassword = async (id, currentPassword, newPassword) => {
  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw new ValidationError('Mật khẩu hiện tại không đúng');
  }

  // Check if new password is different from current password
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw new ValidationError('Mật khẩu mới phải khác với mật khẩu hiện tại');
  }

  // Update password (will be hashed by pre-save middleware in User model)
  user.password = newPassword;
  await user.save();

  return { message: 'Password changed successfully' };
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

    // Applying CCCD data to profile

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

    // Cập nhật giới tính từ CCCD (chuẩn hóa NAM -> MALE, NỮ -> FEMALE)
    if (cccdData.gender) {
      const genderUpper = cccdData.gender.toUpperCase();
      const genderMap = {
        NAM: 'MALE',
        MALE: 'MALE',
        NỮ: 'FEMALE',
        NU: 'FEMALE',
        FEMALE: 'FEMALE',
        KHÁC: 'OTHER',
        KHAC: 'OTHER',
        OTHER: 'OTHER'
      };
      updates['profile.gender'] = genderMap[genderUpper] || cccdData.gender;
    }

    // Cập nhật địa chỉ từ CCCD (chuẩn hóa từ IN HOA sang Title Case)
    if (cccdData.address) {
      updates['address.streetAddress'] = normalizeAddress(cccdData.address);
    }

    // Updates to apply

    // Áp dụng các thay đổi
    const updatedUser = await User.findByIdAndUpdate(id, { $set: updates }, { new: true });

    // Profile updated successfully from CCCD data

    return updatedUser;
  } catch (error) {
    // Update profile by KYC error
    throw error;
  }
};

// Bank Account Management
const VIETNAMESE_BANKS = {
  VCB: { name: 'Vietcombank', accountLength: [13, 14] },
  TCB: { name: 'Techcombank', accountLength: [12, 19] },
  BIDV: { name: 'BIDV', accountLength: [12, 14] },
  VTB: { name: 'Vietinbank', accountLength: [12, 13] },
  ACB: { name: 'ACB', accountLength: [9, 14] },
  MB: { name: 'MB Bank', accountLength: [12, 13] },
  TPB: { name: 'TPBank', accountLength: [10, 12] },
  STB: { name: 'Sacombank', accountLength: [13, 16] },
  VPB: { name: 'VPBank', accountLength: [12, 13] },
  AGR: { name: 'Agribank', accountLength: [13, 14] },
  EIB: { name: 'Eximbank', accountLength: [12, 16] },
  MSB: { name: 'MSB', accountLength: [12, 13] },
  SCB: { name: 'SCB', accountLength: [12, 13] },
  SHB: { name: 'SHB', accountLength: [12, 13] },
  OCB: { name: 'OCB', accountLength: [12, 14] }
};

const validateBankAccount = (bankCode, accountNumber) => {
  const bank = VIETNAMESE_BANKS[bankCode];
  if (!bank) {
    throw new ValidationError('Invalid bank code');
  }

  const cleanNumber = accountNumber.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(cleanNumber)) {
    throw new ValidationError('Account number must contain only digits');
  }

  const [minLen, maxLen] = bank.accountLength;
  if (cleanNumber.length < minLen || cleanNumber.length > maxLen) {
    throw new ValidationError(`${bank.name} account number must be ${minLen}-${maxLen} digits`);
  }

  return { bankName: bank.name, cleanNumber };
};

const addBankAccount = async (userId, bankData) => {
  const { bankCode, accountNumber, accountHolderName } = bankData;

  // Validate bank account
  const { bankName, cleanNumber } = validateBankAccount(bankCode, accountNumber);

  // Validate account holder name
  if (!accountHolderName || accountHolderName.trim().length < 2) {
    throw new ValidationError('Account holder name is required');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Update user with bank account info
  user.bankAccount = {
    bankCode,
    bankName,
    accountNumber: cleanNumber,
    accountHolderName: accountHolderName.trim().toUpperCase(),
    status: 'PENDING',
    isVerified: false,
    addedAt: new Date()
  };

  // Clean invalid gender value if exists
  if (
    user.profile &&
    user.profile.gender &&
    !['MALE', 'FEMALE', 'OTHER'].includes(user.profile.gender)
  ) {
    user.profile.gender = undefined;
  }

  await user.save();
  return user;
};

const updateBankAccount = async (userId, bankData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (!user.bankAccount) {
    throw new NotFoundError('No bank account found');
  }

  let needsReVerification = false;

  // If updating bank code or account number, validate and reset verification
  if (bankData.bankCode || bankData.accountNumber) {
    const bankCode = bankData.bankCode || user.bankAccount.bankCode;
    const accountNumber = bankData.accountNumber || user.bankAccount.accountNumber;

    const { bankName, cleanNumber } = validateBankAccount(bankCode, accountNumber);

    user.bankAccount.bankCode = bankCode;
    user.bankAccount.bankName = bankName;
    user.bankAccount.accountNumber = cleanNumber;
    needsReVerification = true;
  }

  // Update account holder name
  if (bankData.accountHolderName) {
    if (bankData.accountHolderName.trim().length < 2) {
      throw new ValidationError('Account holder name is required');
    }
    user.bankAccount.accountHolderName = bankData.accountHolderName.trim().toUpperCase();
    needsReVerification = true;
  }

  // Reset verification status if any critical field changed
  if (needsReVerification) {
    user.bankAccount.status = 'PENDING';
    user.bankAccount.isVerified = false;
    user.bankAccount.verifiedAt = undefined;
    user.bankAccount.rejectedAt = undefined;
    user.bankAccount.adminNote = undefined;
    user.bankAccount.rejectionReason = undefined;
  }

  // Clean invalid gender value if exists
  if (
    user.profile &&
    user.profile.gender &&
    !['MALE', 'FEMALE', 'OTHER'].includes(user.profile.gender)
  ) {
    user.profile.gender = undefined;
  }

  await user.save();
  return user;
};

const removeBankAccount = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  user.bankAccount = undefined;
  await user.save();

  return { message: 'Bank account removed successfully' };
};

const getBankAccount = async (userId) => {
  const user = await User.findById(userId).select('bankAccount');
  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user.bankAccount || null;
};

// Verify password - dùng để xác thực trước khi xem thông tin nhạy cảm
const verifyPassword = async (id, password) => {
  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new ValidationError('Mật khẩu không đúng');
  }

  return { verified: true };
};

// Upload avatar to Cloudinary
const uploadAvatar = async (userId, buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `avatars/${userId}`,
        resource_type: 'image',
        transformation: [
          { width: 500, height: 500, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      async (error, result) => {
        if (error) {
          // Cloudinary upload error
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          try {
            // Update user avatar URL
            await User.findByIdAndUpdate(userId, {
              $set: { 'profile.avatar': result.secure_url }
            });
            resolve(result.secure_url);
          } catch (dbError) {
            // Database update error
            reject(new Error('Failed to update avatar in database'));
          }
        }
      }
    );
    uploadStream.end(buffer);
  });
};

module.exports = {
  getAllUsers,
  createUser,
  deleteUser,
  getProfile,
  updateProfile,
  updateProfileByKyc,
  changePassword,
  verifyPassword,
  uploadAvatar,
  addBankAccount,
  updateBankAccount,
  removeBankAccount,
  getBankAccount,
  VIETNAMESE_BANKS
};
