const mongoose = require('mongoose');
const { NotFoundError, ValidationError, DatabaseError } = require('../core/error');
const cloudinary = require('../config/cloudinary');
const crypto = require('crypto');
const streamifier = require('streamifier');

const User = mongoose.model('User');

const ENCRYPTION_KEY = process.env.IMAGE_ENCRYPTION_KEY;
const CCCD_ENCRYPTION_KEY = process.env.CCCD_ENCRYPTION_KEY; // Key riêng cho mã hóa CCCD
const IV_LENGTH = 16;

// Validate format số CCCD
const validateNationalIdFormat = (nationalId) => {
  if (!nationalId || typeof nationalId !== 'string') {
    return false;
  }
  const cccdPattern = /^\d{12}$/;
  return cccdPattern.test(nationalId);
};

// Validate ngày sinh
const validateDateOfBirth = (dateOfBirth) => {
  const date = new Date(dateOfBirth);
  const now = new Date();
  const age = now.getFullYear() - date.getFullYear();
  return date instanceof Date && !isNaN(date) && age >= 16 && age <= 120;
};

// Mã hóa CCCD Number
const encryptCCCDNumber = (cccdNumber) => {
  if (!CCCD_ENCRYPTION_KEY) {
    throw new Error('CCCD_ENCRYPTION_KEY is not configured');
  }
  if (!cccdNumber) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(CCCD_ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(cccdNumber, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

// Giải mã CCCD Number
const decryptCCCDNumber = (encryptedCCCD) => {
  if (!CCCD_ENCRYPTION_KEY) {
    throw new Error('CCCD_ENCRYPTION_KEY is not configured');
  }
  if (!encryptedCCCD || typeof encryptedCCCD !== 'string') {
    return null;
  }
  try {
    const textParts = encryptedCCCD.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(CCCD_ENCRYPTION_KEY, 'hex'),
      iv
    );
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt CCCD number:', error);
    return null;
  }
};

// Tạo CCCD ID từ số CCCD (dùng để track verification)
const generateCCCDId = (cccdNumber) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(cccdNumber).digest('hex');
};

// Kiểm tra CCCD đã được xác thực bởi user khác chưa
const checkCCCDExists = async (cccdNumber, excludeUserId = null) => {
  try {
    const cccdId = generateCCCDId(cccdNumber);

    const query = {
      'cccd.id': cccdId,
      'cccd.isVerified': true
    };

    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const existingUser = await User.findOne(query);

    if (existingUser) {
      
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking CCCD exists:', error);
    return false;
  }
};

// Encryption functions cho URL ảnh
const encryptUrl = (url) => {
  if (!ENCRYPTION_KEY) {
    throw new Error('IMAGE_ENCRYPTION_KEY is not configured');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(url, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

const decryptUrl = (encryptedUrl) => {
  if (!ENCRYPTION_KEY) {
    throw new Error('IMAGE_ENCRYPTION_KEY is not configured');
  }
  if (!encryptedUrl || typeof encryptedUrl !== 'string') {
    throw new Error('Invalid encrypted URL');
  }
  try {
    const textParts = encryptedUrl.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    throw new Error('Failed to decrypt URL');
  }
};

const uploadToCloudinary = (buffer, folder = 'cccd') => {
  return new Promise((resolve, reject) => {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      return reject(new Error('Invalid buffer provided'));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'image',
        quality: 'auto',
        fetch_format: 'auto',
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }, { quality: 'auto:good' }]
      },
      (error, result) => {
        if (error) {
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// OCR chỉ sử dụng FPT.AI
const extractCCCDInfo = async (imageBuffer) => {
  try {
    // Chỉ sử dụng FPT.AI OCR
    if (!process.env.FPT_AI_API_KEY) {
      return {
        success: false,
        message: 'FPT.AI API key không được cấu hình',
        data: null,
        source: 'None'
      };
    }

    try {
      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
      formData.append('image', blob);

      const fptResponse = await fetch('https://api.fpt.ai/vision/idr/vnm', {
        method: 'POST',
        headers: {
          'api-key': process.env.FPT_AI_API_KEY
        },
        body: formData
      });

      if (fptResponse.ok) {
        const result = await fptResponse.json();
        const data = result.data?.[0];

        if (data) {
          return {
            success: true,
            data: {
              // CHỈ LẤY CÁC FIELD CÓ TRONG USER MODEL
              cccdNumber: data.id || '',
              fullName: data.name || '',
              dateOfBirth: data.dob || '',
              address: data.address || '',
              gender: data.sex || ''
            },
            source: 'FPT.AI'
          };
        }
      } else {
        const errorData = await fptResponse.text();
        console.error('FPT.AI API error response:', errorData);
        return {
          success: false,
          message: 'FPT.AI API trả về lỗi',
          data: null,
          source: 'FPT.AI'
        };
      }
    } catch (fptError) {
      console.error('FPT.AI OCR error:', fptError);
      return {
        success: false,
        message: 'Lỗi khi gọi FPT.AI API',
        data: null,
        error: fptError.message,
        source: 'FPT.AI'
      };
    }

    return {
      success: false,
      message: 'Không thể đọc thông tin từ ảnh CCCD',
      data: null,
      source: 'FPT.AI'
    };
  } catch (error) {
    console.error('OCR extraction error:', error);
    return {
      success: false,
      message: 'Lỗi khi đọc thông tin từ ảnh CCCD',
      data: null,
      error: error.message
    };
  }
};

// Hàm chuẩn hóa địa chỉ từ IN HOA sang Title Case
const normalizeAddress = (address) => {
  if (!address || typeof address !== 'string') {
    return address;
  }

  // Danh sách các từ đặc biệt cần viết hoa đúng cách
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
    TT: 'TT'
  };

  return address
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      // Tìm từ đặc biệt trong danh sách
      for (const [upper, proper] of Object.entries(specialWords)) {
        if (trimmed.toUpperCase().startsWith(upper)) {
          const rest = trimmed.substring(upper.length).trim();
          if (rest) {
            // Capitalize từng từ trong phần còn lại
            const normalizedRest = rest
              .split(' ')
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
            return `${proper} ${normalizedRest}`;
          }
          return proper;
        }
      }
      // Nếu không có từ đặc biệt, capitalize từng từ
      return trimmed
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    })
    .join(', ');
};

// Chuẩn hóa dữ liệu OCR
const normalizeCCCDData = (ocrData) => {
  const normalized = { ...ocrData };

  // Chuẩn hóa ngày sinh
  if (normalized.dateOfBirth) {
    try {
      const dateFormats = [
        /(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
        /(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
        /(\d{4})-(\d{2})-(\d{2})/ // YYYY-MM-DD
      ];

      for (const format of dateFormats) {
        const match = normalized.dateOfBirth.match(format);
        if (match) {
          if (format === dateFormats[2]) {
            normalized.dateOfBirth = `${match[1]}-${match[2]}-${match[3]}`;
          } else {
            normalized.dateOfBirth = `${match[3]}-${match[2]}-${match[1]}`;
          }
          break;
        }
      }

      // Validate date sau khi parse
      const testDate = new Date(normalized.dateOfBirth);
      if (isNaN(testDate.getTime())) {
        console.warn('Invalid date of birth after parsing:', normalized.dateOfBirth);
        normalized.dateOfBirth = null;
      }
    } catch (error) {
      console.error('Date normalization error:', error);
      normalized.dateOfBirth = null;
    }
  }

  // Chuẩn hóa số CCCD (loại bỏ spaces và ký tự đặc biệt)
  if (normalized.cccdNumber) {
    normalized.cccdNumber = normalized.cccdNumber.replace(/\D/g, '');
  }

  // Chuẩn hóa tên (capitalize each word)
  if (normalized.fullName) {
    normalized.fullName = normalized.fullName
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Chuẩn hóa địa chỉ
  if (normalized.address) {
    normalized.address = normalizeAddress(normalized.address);
  }

  // Chuẩn hóa giới tính
  if (normalized.gender) {
    const genderUpper = normalized.gender.toUpperCase();
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
    normalized.gender = genderMap[genderUpper] || 'OTHER';
  }

  return normalized;
};

// Upload CCCD với mã hóa và kiểm tra trùng lặp
const uploadCCCD = async (userId, files) => {
  try {

    if (!files || Object.keys(files).length === 0) {
      throw new ValidationError('Cần upload ít nhất một ảnh CCCD');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    let frontImageUrl = null;
    let backImageUrl = null;
    let extractedInfo = null;

    // Xử lý file mặt trước
    if (files.frontImage && files.frontImage.length > 0) {
      const frontFile = files.frontImage[0];

      if (!frontFile.mimetype.startsWith('image/')) {
        throw new ValidationError(`File ${frontFile.originalname} không phải là ảnh`);
      }
      if (frontFile.size > 5 * 1024 * 1024) {
        throw new ValidationError(`File ${frontFile.originalname} quá lớn (tối đa 5MB)`);
      }

      const frontResult = await uploadToCloudinary(frontFile.buffer, `cccd/${userId}/front`);
      frontImageUrl = encryptUrl(frontResult.secure_url);

      const ocrResult = await extractCCCDInfo(frontFile.buffer);

      if (ocrResult.success && ocrResult.data) {
        extractedInfo = normalizeCCCDData(ocrResult.data);
      }
    }

    // Xử lý file mặt sau
    if (files.backImage && files.backImage.length > 0) {
      const backFile = files.backImage[0];

      if (!backFile.mimetype.startsWith('image/')) {
        throw new ValidationError(`File ${backFile.originalname} không phải là ảnh`);
      }
      if (backFile.size > 5 * 1024 * 1024) {
        throw new ValidationError(`File ${backFile.originalname} quá lớn (tối đa 5MB)`);
      }

      const backResult = await uploadToCloudinary(backFile.buffer, `cccd/${userId}/back`);
      backImageUrl = encryptUrl(backResult.secure_url);

      if (!extractedInfo) {
       
        const ocrResult = await extractCCCDInfo(backFile.buffer);

        if (ocrResult.success && ocrResult.data) {
          extractedInfo = normalizeCCCDData(ocrResult.data);
          
        }
      }
    }

    if (!frontImageUrl && !backImageUrl) {
      throw new ValidationError('Cần upload ít nhất một ảnh CCCD (mặt trước hoặc mặt sau)');
    }

    // Kiểm tra trùng lặp CCCD nếu OCR thành công
    if (
      extractedInfo &&
      extractedInfo.cccdNumber &&
      validateNationalIdFormat(extractedInfo.cccdNumber)
    ) {
      const cccdExists = await checkCCCDExists(extractedInfo.cccdNumber, userId);
      if (cccdExists) {
        throw new ValidationError('Số CCCD này đã được sử dụng bởi tài khoản khác');
      }
    }

    // **LƯU THÔNG TIN VÀO CÁC FIELD CHÍNH CỦA CCCD**
    // Reset CCCD data khi upload ảnh mới để tránh giữ lại data cũ
    const cccdData = {
      uploadedAt: new Date()
    };

    // Lưu ảnh
    if (frontImageUrl) {
      cccdData.frontImageHash = frontImageUrl;
    }
    if (backImageUrl) {
      cccdData.backImageHash = backImageUrl;
    }

    // **LƯU THÔNG TIN OCR VÀO CÁC FIELD CHÍNH**
    if (extractedInfo) {
      // Lưu thông tin trực tiếp vào các field chính
      if (extractedInfo.cccdNumber && validateNationalIdFormat(extractedInfo.cccdNumber)) {
        // Tạo CCCD ID để track verification
        cccdData.id = generateCCCDId(extractedInfo.cccdNumber);
        cccdData.cccdNumber = encryptCCCDNumber(extractedInfo.cccdNumber);
      }
      if (extractedInfo.fullName) {
        cccdData.fullName = extractedInfo.fullName;
      }
      if (extractedInfo.dateOfBirth) {
        try {
          const dobDate = new Date(extractedInfo.dateOfBirth);
          if (!isNaN(dobDate.getTime())) {
            cccdData.dateOfBirth = dobDate;
          }
        } catch (error) {
          console.warn('Invalid date of birth:', extractedInfo.dateOfBirth);
        }
      }
      if (extractedInfo.address) {
        cccdData.address = extractedInfo.address;
      }
      if (extractedInfo.gender) {
        cccdData.gender = extractedInfo.gender;
      }

      // Tự động xác thực
      cccdData.isVerified = true;
      cccdData.verifiedAt = new Date();
      cccdData.verificationSource = 'FPT.AI Auto-verification';

      // Cập nhật profile.gender nếu có gender từ OCR
      if (extractedInfo.gender) {
        if (!user.profile) {
          user.profile = {};
        }
        user.profile.gender = extractedInfo.gender;
      }

    } else {
      // Nếu không có OCR data, đánh dấu là chưa xác thực
      cccdData.isVerified = false;
      cccdData.verifiedAt = null;
      cccdData.verificationSource = null;
    }

    user.cccd = cccdData;
    await user.save();

    // **TRẢ VỀ THÔNG TIN ĐÃ LƯU (GIẢI MÃ CCCD NUMBER)**
    const responseData = {
      cccdNumber: extractedInfo?.cccdNumber || null, // Plain text cho client
      fullName: cccdData.fullName || null,
      dateOfBirth: cccdData.dateOfBirth || null,
      address: cccdData.address || null,
      gender: cccdData.gender || null
    };

    return {
      message: 'Upload và xác thực CCCD thành công',
      cccd: {
        frontImageUploaded: !!cccdData.frontImageHash,
        backImageUploaded: !!cccdData.backImageHash,
        uploadedAt: cccdData.uploadedAt,
        isVerified: cccdData.isVerified,
        extractedInfo: responseData // Thông tin đã lưu để hiển thị
      },
      ocrResult: extractedInfo
        ? {
            success: true,
            message: 'Đã tự động đọc và lưu thông tin từ ảnh CCCD'
          }
        : {
            success: false,
            message: 'Không thể đọc thông tin từ ảnh'
          }
    };
  } catch (error) {
    throw error;
  }
};

// Cập nhật thông tin CCCD thủ công với mã hóa và kiểm tra trùng lặp
const updateCCCDInfo = async (userId, cccdInfo) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (!user.cccd || (!user.cccd.frontImageHash && !user.cccd.backImageHash)) {
      throw new ValidationError('Cần upload ảnh CCCD trước khi cập nhật thông tin');
    }

    // CHỈ LẤY CÁC FIELD CÓ TRONG MODEL
    const { cccdNumber, fullName, dateOfBirth, address, gender } = cccdInfo;

    // Validate thông tin bắt buộc
    if (!cccdNumber || !fullName || !dateOfBirth) {
      throw new ValidationError('Cần có đầy đủ số CCCD, họ tên và ngày sinh');
    }

    if (!validateNationalIdFormat(cccdNumber)) {
      throw new ValidationError('Số CCCD không đúng định dạng (phải có 12 số)');
    }

    if (!validateDateOfBirth(dateOfBirth)) {
      throw new ValidationError('Ngày sinh không hợp lệ (phải từ 16 tuổi trở lên)');
    }

    // Validate gender nếu có
    if (gender && !['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
      throw new ValidationError('Giới tính không hợp lệ (MALE, FEMALE, OTHER)');
    }

    // Kiểm tra trùng lặp CCCD
    const cccdExists = await checkCCCDExists(cccdNumber, userId);
    if (cccdExists) {
      throw new ValidationError('Số CCCD này đã được sử dụng bởi tài khoản khác');
    }

    // Chuẩn hóa address và gender trước khi lưu
    const normalizedAddress = address ? normalizeAddress(address) : user.cccd.address;
    const normalizedGender = gender || user.cccd.gender;

    // Cập nhật thông tin CCCD - CHỈ CÁC FIELD CÓ TRONG MODEL
    user.cccd.id = generateCCCDId(cccdNumber); // Tạo CCCD ID
    user.cccd.cccdNumber = encryptCCCDNumber(cccdNumber); // Mã hóa CCCD
    user.cccd.fullName = fullName;
    user.cccd.dateOfBirth = new Date(dateOfBirth);
    user.cccd.address = normalizedAddress;
    user.cccd.gender = normalizedGender;
    user.cccd.isVerified = true;
    user.cccd.verifiedAt = new Date();
    user.cccd.verificationSource = 'Manual Update';

    // Cập nhật profile.gender nếu có gender từ CCCD
    if (normalizedGender) {
      if (!user.profile) {
        user.profile = {};
      }
      user.profile.gender = normalizedGender;
    }

    await user.save();

    return {
      message: 'Cập nhật thông tin CCCD thành công',
      cccd: {
        cccdNumber: cccdNumber, // Trả về plain text cho client
        fullName: user.cccd.fullName,
        dateOfBirth: user.cccd.dateOfBirth,
        address: user.cccd.address,
        gender: user.cccd.gender,
        isVerified: user.cccd.isVerified,
        verifiedAt: user.cccd.verifiedAt,
        verificationSource: user.cccd.verificationSource
      }
    };
  } catch (error) {
    throw error;
  }
};

const getCCCDImages = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    if (!user.cccd) {
      throw new NotFoundError('CCCD data not found');
    }

    const images = {};
    if (user.cccd.frontImageHash) {
      images.frontImage = decryptUrl(user.cccd.frontImageHash);
    }
    if (user.cccd.backImageHash) {
      images.backImage = decryptUrl(user.cccd.backImageHash);
    }
    return images;
  } catch (error) {
    throw error;
  }
};

// Lấy thông tin CCCD - Giải mã CCCD Number khi trả về
const getUserCCCD = async (userId) => {
  try {
    const user = await User.findById(userId).select('cccd');
    if (!user) {
      throw new NotFoundError('User not found');
    }
    if (!user.cccd) {
      return null;
    }

    // **GIẢI MÃ VÀ TRẢ VỀ THÔNG TIN TỪ CÁC FIELD CHÍNH**
    const decryptedCCCDNumber = user.cccd.cccdNumber
      ? decryptCCCDNumber(user.cccd.cccdNumber)
      : null;

    // Chuẩn hóa address và gender trước khi trả về
    const normalizedAddress = user.cccd.address ? normalizeAddress(user.cccd.address) : null;

    let normalizedGender = user.cccd.gender;
    if (normalizedGender) {
      const genderUpper = normalizedGender.toUpperCase();
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
      normalizedGender = genderMap[genderUpper] || normalizedGender;
    }

    return {
      cccdNumber: decryptedCCCDNumber, // Trả về plain text
      fullName: user.cccd.fullName,
      dateOfBirth: user.cccd.dateOfBirth,
      address: normalizedAddress,
      gender: normalizedGender,
      isVerified: user.cccd.isVerified,
      uploadedAt: user.cccd.uploadedAt,
      verifiedAt: user.cccd.verifiedAt,
      verificationSource: user.cccd.verificationSource,
      hasImages: !!(user.cccd.frontImageHash || user.cccd.backImageHash)
    };
  } catch (error) {
    throw error;
  }
};

const deleteCCCDImages = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.cccd) {
      throw new NotFoundError('CCCD data not found');
    }

    const deletePromises = [];

    if (user.cccd.frontImageHash) {
      try {
        const frontUrl = decryptUrl(user.cccd.frontImageHash);
        const publicId = frontUrl.split('/').slice(-2).join('/').split('.')[0];
        deletePromises.push(cloudinary.uploader.destroy(publicId));
      } catch (error) {
        console.error('Error deleting front image:', error);
      }
    }

    if (user.cccd.backImageHash) {
      try {
        const backUrl = decryptUrl(user.cccd.backImageHash);
        const publicId = backUrl.split('/').slice(-2).join('/').split('.')[0];
        deletePromises.push(cloudinary.uploader.destroy(publicId));
      } catch (error) {
        console.error('Error deleting back image:', error);
      }
    }

    await Promise.allSettled(deletePromises);

    user.cccd = undefined;
    await user.save();

    return { message: 'Xóa ảnh CCCD thành công' };
  } catch (error) {
    throw error;
  }
};

// Lấy trạng thái KYC của user
const getKYCStatus = async (userId) => {
  try {
    const user = await User.findById(userId).select('cccd');
    if (!user) {
      return {
        isVerified: false
      };
    }

    const cccd = user.cccd || {};


    return {
      isVerified: cccd.isVerified || false,
      hasImages: !!(cccd.frontImageHash || cccd.backImageHash),
      status: cccd.isVerified
        ? 'verified'
        : cccd.frontImageHash || cccd.backImageHash
          ? 'pending'
          : 'not_started',
      verifiedAt: cccd.verifiedAt,
      verificationSource: cccd.verificationSource,
      uploadedAt: cccd.uploadedAt
    };
  } catch (error) {
    console.error('Get KYC status error:', error);
    throw error;
  }
};

module.exports = {
  uploadCCCD,
  updateCCCDInfo,
  getCCCDImages,
  getUserCCCD,
  deleteCCCDImages,
  getKYCStatus,
  extractCCCDInfo,
  validateNationalIdFormat,
  validateDateOfBirth,
  checkCCCDExists,
  generateCCCDId,
  encryptCCCDNumber,
  decryptCCCDNumber
};
