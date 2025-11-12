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

// ========== REPORT MANAGEMENT ==========
const createReport = async (reportData, reporterId) => {
  try {
    console.log('=== User Service createReport ===');
    console.log('Report data:', reportData);
    console.log('Reporter ID:', reporterId);

    // Validate required fields
    const { reportType, reportedItem, reason, description } = reportData;
    
    if (!reportType) {
      throw new ValidationError('Loại báo cáo là bắt buộc');
    }
    
    if (!reportedItem) {
      throw new ValidationError('Sản phẩm bị báo cáo là bắt buộc');
    }

    // Validate reportType
    const validTypes = ['SPAM', 'INAPPROPRIATE', 'HARASSMENT', 'OTHER'];
    if (!validTypes.includes(reportType)) {
      throw new ValidationError('Loại báo cáo không hợp lệ');
    }

    // Check if product exists
    const product = await Product.findById(reportedItem);
    if (!product) {
      throw new NotFoundError('Sản phẩm không tồn tại');
    }

    // Check if user already reported this product
    const existingReport = await Report.findOne({
      reporter: reporterId,
      reportedItem: reportedItem,
      status: { $in: ['PENDING', 'REVIEWED'] }
    });

    if (existingReport) {
      throw new ValidationError('Bạn đã báo cáo sản phẩm này rồi');
    }

    // Create new report
    const newReport = new Report({
      reporter: reporterId,
      reportType,
      reason: reason || '',
      description: description || '',
      reportedItem,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const savedReport = await newReport.save();
    
    // Populate report for response
    const populatedReport = await Report.findById(savedReport._id)
      .populate('reporter', 'fullName email')
      .populate('reportedItem', 'title images pricing status');

    console.log('Report created successfully:', populatedReport._id);
    return populatedReport;

  } catch (error) {
    console.error('Error creating report:', error);
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError('Lỗi khi tạo báo cáo');
  }
};

const getUserReports = async (userId, filters = {}) => {
  try {
    console.log('=== User Service getUserReports ===');
    console.log('User ID:', userId);
    console.log('Filters:', filters);

    const { page = 1, limit = 10, status } = filters;

    // Build query
    let query = { reporter: userId };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reports, total] = await Promise.all([
      Report.find(query)
        .populate('reportedItem', 'title images pricing status owner')
        .populate('reportedItem.owner', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Report.countDocuments(query)
    ]);

    return {
      reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    };

  } catch (error) {
    console.error('Error getting user reports:', error);
    throw new DatabaseError('Lỗi khi lấy danh sách báo cáo');
  }
};

const getReportById = async (reportId, userId) => {
  try {
    console.log('=== User Service getReportById ===');
    console.log('Report ID:', reportId);
    console.log('User ID:', userId);

    // Find report and verify ownership
    const report = await Report.findOne({
      _id: reportId,
      reporter: userId
    })
    .populate('reporter', 'fullName email')
    .populate('reportedItem', 'title description images pricing status owner location')
    .populate('reportedItem.owner', 'fullName email phone');

    if (!report) {
      throw new NotFoundError('Báo cáo không tồn tại hoặc bạn không có quyền xem');
    }

    return report;

  } catch (error) {
    console.error('Error getting report by ID:', error);
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError('Lỗi khi lấy chi tiết báo cáo');
  }
};

module.exports = {
  getAllUsers,
  createUser,
  deleteUser,
  getProfile,
  updateProfile,
  updateProfileByKyc,
  createReport,
  getUserReports,
  getReportById
};