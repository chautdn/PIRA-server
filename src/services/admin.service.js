const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const Report = require('../models/Report');

class AdminService {
  // ========== DASHBOARD STATISTICS ==========
  async getDashboardStats() {
    try {
      const [
        totalUsers,
        totalProducts,
        totalOrders,
        totalCategories,
        activeUsers,
        pendingProducts,
        monthlyUsers,
        monthlyRevenue
      ] = await Promise.all([
        User.countDocuments(),
        Product.countDocuments(),
        Order.countDocuments(),
        Category.countDocuments(),
        User.countDocuments({ status: 'ACTIVE' }),
        Product.countDocuments({ status: 'PENDING' }),
        this.getMonthlyUserStats(),
        this.getMonthlyRevenue()
      ]);

      const usersByRole = await User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]);

      const productsByStatus = await Product.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);

      return {
        overview: {
          totalUsers,
          totalProducts,
          totalOrders,
          totalCategories,
          activeUsers,
          pendingProducts
        },
        charts: {
          usersByRole,
          productsByStatus,
          monthlyUsers,
          monthlyRevenue
        }
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy thống kê dashboard: ${error.message}`);
    }
  }

  async getMonthlyUserStats() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    return await User.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  }

  async getMonthlyRevenue() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    return await Order.aggregate([
      { 
        $match: { 
          createdAt: { $gte: sixMonthsAgo },
          status: 'COMPLETED'
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
  }

  // ========== USER MANAGEMENT ==========
  async getAllUsers(filters) {
    const { page = 1, limit = 10, search, role, status } = filters;
    
    let query = {};

    // Search by name or email
    if (search) {
      query.$or = [
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by role
    if (role && role !== 'all') {
      query.role = role;
    }

    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    return {
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        limit: parseInt(limit)
      }
    };
  }

  async getUserById(userId) {
    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('ID người dùng không hợp lệ');
    }

    try {
      const user = await User.findById(userId).select('-password -address.coordinates -verification');
      
      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      return user;
      
    } catch (error) {
      if (error.message === 'Không tìm thấy người dùng' || error.message === 'ID người dùng không hợp lệ') {
        throw error;
      }
      
      throw new Error(`Lỗi server khi tải thông tin người dùng: ${error.message}`);
    }
  }

  async updateUserStatus(userId, status, adminId) {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
    if (!validStatuses.includes(status)) {
      throw new Error('Trạng thái không hợp lệ');
    }

    if (userId === adminId) {
      throw new Error('Không thể thay đổi trạng thái của chính mình');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        status,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      throw new Error('Không tìm thấy người dùng');
    }

    return user;
  }

  async updateUserRole(userId, role, adminId) {
    const validRoles = ['RENTER', 'OWNER', 'ADMIN', 'SHIPPER'];
    if (!validRoles.includes(role)) {
      throw new Error('Vai trò không hợp lệ');
    }

    if (userId === adminId) {
      throw new Error('Không thể thay đổi vai trò của chính mình');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        role,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      throw new Error('Không tìm thấy người dùng');
    }

    return user;
  }

  async updateUser(userId, updateData, adminId) {
    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('ID người dùng không hợp lệ');
    }

    try {
      // Find the user first
      const existingUser = await User.findById(userId);
      if (!existingUser) {
        throw new Error('Không tìm thấy người dùng');
      }

      // Prevent admin from changing their own role/status
      if (userId === adminId && (updateData.role || updateData.status)) {
        throw new Error('Không thể thay đổi vai trò hoặc trạng thái của chính mình');
      }

      // Prepare update object with nested fields
      const updateFields = {};
      
      // Handle direct fields
      if (updateData.email !== undefined) updateFields.email = updateData.email;
      if (updateData.phone !== undefined) updateFields.phone = updateData.phone;
      if (updateData.role !== undefined) updateFields.role = updateData.role;
      if (updateData.status !== undefined) updateFields.status = updateData.status;
      if (updateData.creditScore !== undefined) {
        // Validate creditScore range
        const score = parseInt(updateData.creditScore);
        if (score < 0 || score > 1000) {
          throw new Error('Điểm tín dụng phải từ 0 đến 1000');
        }
        updateFields.creditScore = score;
      }
      
      // Handle profile nested object
      if (updateData.profile) {
        if (updateData.profile.firstName !== undefined) updateFields['profile.firstName'] = updateData.profile.firstName;
        if (updateData.profile.lastName !== undefined) updateFields['profile.lastName'] = updateData.profile.lastName;
        if (updateData.profile.avatar !== undefined) updateFields['profile.avatar'] = updateData.profile.avatar;
        if (updateData.profile.dateOfBirth !== undefined) updateFields['profile.dateOfBirth'] = updateData.profile.dateOfBirth;
        if (updateData.profile.gender !== undefined) updateFields['profile.gender'] = updateData.profile.gender;
      }
      
      // Handle address nested object  
      if (updateData.address) {
        if (updateData.address.streetAddress !== undefined) updateFields['address.streetAddress'] = updateData.address.streetAddress;
        if (updateData.address.district !== undefined) updateFields['address.district'] = updateData.address.district;
        if (updateData.address.city !== undefined) updateFields['address.city'] = updateData.address.city;
        if (updateData.address.province !== undefined) updateFields['address.province'] = updateData.address.province;
        if (updateData.address.country !== undefined) updateFields['address.country'] = updateData.address.country;
      }

      updateFields.updatedAt = new Date();

      // Update user with nested fields
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { 
          new: true, 
          runValidators: true,
          select: '-password'
        }
      );

      if (!updatedUser) {
        throw new Error('Cập nhật người dùng thất bại');
      }

      return updatedUser;

    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => err.message);
        throw new Error(`Dữ liệu không hợp lệ: ${validationErrors.join(', ')}`);
      }
      
      throw new Error(`Lỗi cập nhật người dùng: ${error.message}`);
    }
  }

  async updateUserCreditScore(userId, creditScore, adminId) {
    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('ID người dùng không hợp lệ');
    }

    // Validate creditScore
    const score = parseInt(creditScore);
    if (isNaN(score) || score < 0 || score > 1000) {
      throw new Error('Điểm tín dụng phải là số từ 0 đến 1000');
    }

    if (userId === adminId) {
      throw new Error('Không thể thay đổi điểm tín dụng của chính mình');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        creditScore: score,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      throw new Error('Không tìm thấy người dùng');
    }

    return user;
  }

  async deleteUser(userId, adminId) {
    if (userId === adminId) {
      throw new Error('Không thể xóa tài khoản của chính mình');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Không tìm thấy người dùng');
    }

    // Check if user has active orders
    const activeOrders = await Order.countDocuments({ 
      user: userId, 
      status: { $in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] }
    });

    if (activeOrders > 0) {
      throw new Error('Không thể xóa người dùng có đơn hàng đang xử lý');
    }

    await User.findByIdAndDelete(userId);
  }

  async bulkUpdateUsers(userIds, updateData, adminId) {
    // Validate userIds
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new Error('Danh sách userIds không hợp lệ');
    }

    // Prevent admin from updating themselves
    if (userIds.includes(adminId)) {
      throw new Error('Không thể cập nhật tài khoản của chính mình trong bulk update');
    }

    // Validate updateData
    const allowedFields = ['status', 'role'];
    const filteredUpdateData = {};
    
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdateData[key] = updateData[key];
      }
    });

    if (Object.keys(filteredUpdateData).length === 0) {
      throw new Error('Không có trường hợp lệ để cập nhật');
    }

    // Add updatedAt timestamp
    filteredUpdateData.updatedAt = new Date();

    // Perform bulk update
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: filteredUpdateData }
    );

    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      userIds,
      updateData: filteredUpdateData
    };
  }

  // ========== PRODUCT MANAGEMENT ==========
  async getAllProducts(filters) {
    const { page = 1, limit = 10, status, search, category } = filters;
    
    let query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('owner', 'profile.firstName profile.lastName email')
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments(query)
    ]);

    return {
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProducts: total,
        limit: parseInt(limit)
      }
    };
  }

  async approveProduct(productId, adminId) {
    const product = await Product.findByIdAndUpdate(
      productId,
      { 
        status: 'APPROVED',
        'moderation.approvedBy': adminId,
        'moderation.approvedAt': new Date(),
        updatedAt: new Date()
      },
      { new: true }
    ).populate('owner', 'profile.firstName profile.lastName email');

    if (!product) {
      throw new Error('Không tìm thấy sản phẩm');
    }

    return product;
  }

  async rejectProduct(productId, reason, adminId) {
    if (!reason) {
      throw new Error('Vui lòng nhập lý do từ chối');
    }

    const product = await Product.findByIdAndUpdate(
      productId,
      { 
        status: 'REJECTED',
        'moderation.rejectedBy': adminId,
        'moderation.rejectedAt': new Date(),
        'moderation.rejectionReason': reason,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('owner', 'profile.firstName profile.lastName email');

    if (!product) {
      throw new Error('Không tìm thấy sản phẩm');
    }

    return product;
  }

  // ========== CATEGORY MANAGEMENT ==========
  async getAllCategories() {
    return await Category.find().sort({ name: 1 });
  }

  async createCategory(categoryData, adminId) {
    const category = new Category({
      ...categoryData,
      createdBy: adminId
    });

    await category.save();
    return category;
  }

  async updateCategory(categoryId, updateData, adminId) {
    const category = await Category.findByIdAndUpdate(
      categoryId,
      { 
        ...updateData,
        updatedBy: adminId,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    if (!category) {
      throw new Error('Không tìm thấy danh mục');
    }

    return category;
  }

  async deleteCategory(categoryId, adminId) {
    // Check if any products are using this category
    const productCount = await Product.countDocuments({ category: categoryId });
    
    if (productCount > 0) {
      throw new Error(`Không thể xóa danh mục vì có ${productCount} sản phẩm đang sử dụng`);
    }

    const category = await Category.findByIdAndDelete(categoryId);
    if (!category) {
      throw new Error('Không tìm thấy danh mục');
    }
  }

  // ========== ORDER MANAGEMENT ==========
  async getAllOrders(filters) {
    const { page = 1, limit = 10, status, search } = filters;
    
    let query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.orderNumber = { $regex: search, $options: 'i' };
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'profile.firstName profile.lastName email')
        .populate('items.product', 'name images price')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(query)
    ]);

    return {
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        limit: parseInt(limit)
      }
    };
  }

  async getOrderById(orderId) {
    const order = await Order.findById(orderId)
      .populate('user', 'profile.firstName profile.lastName email phone')
      .populate('items.product', 'name images price category')
      .populate('items.product.category', 'name');

    if (!order) {
      throw new Error('Không tìm thấy đơn hàng');
    }

    return order;
  }

  // ========== REPORT MANAGEMENT ==========
  async getAllReports(filters) {
    const { page = 1, limit = 10, type, status } = filters;
    
    let query = {};

    if (type && type !== 'all') {
      query.type = type;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      Report.find(query)
        .populate('reporter', 'profile.firstName profile.lastName email')
        .populate('reportedUser', 'profile.firstName profile.lastName email')
        .populate('reportedProduct', 'name images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Report.countDocuments(query)
    ]);

    return {
      reports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalReports: total,
        limit: parseInt(limit)
      }
    };
  }

  async resolveReport(reportId, action, note, adminId) {
    const validActions = ['DISMISS', 'WARNING', 'SUSPEND', 'BAN'];
    if (!validActions.includes(action)) {
      throw new Error('Hành động không hợp lệ');
    }

    const report = await Report.findByIdAndUpdate(
      reportId,
      { 
        status: 'RESOLVED',
        resolution: {
          action,
          note,
          resolvedBy: adminId,
          resolvedAt: new Date()
        },
        updatedAt: new Date()
      },
      { new: true }
    ).populate('reporter', 'profile.firstName profile.lastName email')
     .populate('reportedUser', 'profile.firstName profile.lastName email');

    if (!report) {
      throw new Error('Không tìm thấy báo cáo');
    }

    // Apply action to reported user if needed
    if (report.reportedUser && ['SUSPEND', 'BAN'].includes(action)) {
      await User.findByIdAndUpdate(
        report.reportedUser._id,
        { 
          status: action === 'SUSPEND' ? 'SUSPENDED' : 'INACTIVE',
          updatedAt: new Date()
        }
      );
    }

    return report;
  }

  // ========== SYSTEM SETTINGS ==========
  async getSystemSettings() {
    // This would typically come from a Settings model
    // For now, return default settings
    return {
      site: {
        name: 'PIRA',
        description: 'Platform for Rental and Services',
        logo: '/assets/logo.png'
      },
      business: {
        commissionRate: 0.05, // 5%
        minRentalDays: 1,
        maxRentalDays: 30
      },
      features: {
        enableChat: true,
        enableNotifications: true,
        enableReviews: true
      }
    };
  }

  async updateSystemSettings(settingsData, adminId) {
    // This would typically update a Settings model
    // For now, just return the updated settings
    return {
      ...settingsData,
      updatedBy: adminId,
      updatedAt: new Date()
    };
  }
}

module.exports = new AdminService();