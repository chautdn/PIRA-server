const User = require('../models/User');
const Report = require('../models/Report');
const Product = require('../models/Product');
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
    isVerified: false,
    addedAt: new Date()
  };

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

  // Only allow updating account holder name
  if (bankData.accountHolderName) {
    if (bankData.accountHolderName.trim().length < 2) {
      throw new ValidationError('Account holder name is required');
    }
    user.bankAccount.accountHolderName = bankData.accountHolderName.trim().toUpperCase();
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

module.exports = {
  getAllUsers,
  createUser,
  deleteUser,
  getProfile,
  updateProfile,
  updateProfileByKyc,
  addBankAccount,
  updateBankAccount,
  removeBankAccount,
  getBankAccount,
  VIETNAMESE_BANKS
};
