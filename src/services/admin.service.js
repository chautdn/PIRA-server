const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
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

    const [users, total, stats] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query),
      // Get overall stats (not affected by search/role/status filters)
      User.aggregate([
        {
          $facet: {
            statusStats: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 }
                }
              }
            ],
            roleStats: [
              {
                $group: {
                  _id: '$role',
                  count: { $sum: 1 }
                }
              }
            ],
            total: [
              {
                $count: 'count'
              }
            ]
          }
        }
      ])
    ]);

    // Process stats
    const userStats = {
      total: 0,
      active: 0,
      inactive: 0,
      suspended: 0,
      owners: 0,
      renters: 0,
      admins: 0
    };

    if (stats && stats.length > 0) {
      const { statusStats, roleStats, total: totalCount } = stats[0];
      
      // Total users
      userStats.total = totalCount && totalCount.length > 0 ? totalCount[0].count : 0;
      
      // Status stats
      statusStats.forEach(stat => {
        if (stat._id === 'ACTIVE') {
          userStats.active = stat.count;
        } else if (stat._id === 'INACTIVE') {
          userStats.inactive = stat.count;
        } else if (stat._id === 'SUSPENDED') {
          userStats.suspended = stat.count;
        }
      });
      
      // Role stats
      roleStats.forEach(stat => {
        if (stat._id === 'OWNER') {
          userStats.owners = stat.count;
        } else if (stat._id === 'RENTER') {
          userStats.renters = stat.count;
        } else if (stat._id === 'ADMIN') {
          userStats.admins = stat.count;
        }
      });
    }

    return {
      users,
      stats: userStats,
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
    const { page = 1, limit = 10, status, search, category, sortBy = 'createdAt', sortOrder = 'desc' } = filters;
    
    let query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      query.category = category;
    }

     const skip = (parseInt(page) - 1) * parseInt(limit);

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    try {
      const [products, total] = await Promise.all([
        Product.find(query)
          .populate('owner', 'fullName username email phone profile')
          .populate('category', 'name slug level priority')
          .populate('subCategory', 'name slug level priority')
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit)),
        Product.countDocuments(query)
      ]);

      return {
        products,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalProducts: total,
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      console.error('Error in getAllProducts:', error);
      throw new Error(`Lỗi khi lấy danh sách sản phẩm: ${error.message}`);
    }
  }
  async getProductById(productId) {
    console.log('=== Admin Service getProductById ===');
    console.log('ProductId received:', productId);
    console.log('ProductId type:', typeof productId);
    
    // Validate productId
    if (!productId) {
      console.log('ProductId is missing');
      throw new Error('ID sản phẩm không hợp lệ');
    }

    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.log('ProductId is not a valid ObjectId:', productId);
      throw new Error('ID sản phẩm không hợp lệ');
    }

    try {
      console.log('Searching for product in database...');
      const product = await Product.findById(productId)
        .populate('owner', 'fullName username email phone profile createdAt')
        .populate('category', 'name slug description')
        .populate('subCategory', 'name slug description')
        .lean(); // Convert to plain object for better performance

      console.log('Database query completed');
      console.log('Product found:', !!product);
      
      if (!product) {
        console.log('Product not found in database');
        throw new Error('Không tìm thấy sản phẩm');
      }

      // Calculate real-time metrics from Review collection
      const Review = require('../models/Review');
      const reviewStats = await Review.aggregate([
        {
          $match: {
            product: new mongoose.Types.ObjectId(productId),
            status: 'APPROVED' // Only count approved reviews
          }
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            reviewCount: { $sum: 1 }
          }
        }
      ]);

      // Update product metrics with real data from reviews
      if (reviewStats.length > 0) {
        product.metrics = product.metrics || {};
        product.metrics.averageRating = Math.round(reviewStats[0].averageRating * 10) / 10; // Round to 1 decimal
        product.metrics.reviewCount = reviewStats[0].reviewCount;
        console.log('Updated metrics from reviews:', product.metrics);
      } else {
        // No reviews yet
        product.metrics = product.metrics || {};
        product.metrics.averageRating = 0;
        product.metrics.reviewCount = 0;
        console.log('No approved reviews found for this product');
      }

      console.log('Product data retrieved successfully');
      console.log('Product title:', product.title);
      console.log('Product status:', product.status);
      console.log('Product owner:', product.owner?.email);
      console.log('Product metrics:', product.metrics);
      
      return product;
    } catch (error) {
      console.error('=== Admin Service getProductById ERROR ===');
      console.error('Error during database query:', error.message);
      console.error('Error stack:', error.stack);
      console.error('========================================');
      
      if (error.message === 'Không tìm thấy sản phẩm') {
        throw error;
      }
      
      throw new Error('Lỗi khi truy xuất dữ liệu sản phẩm');
    }
  }

  async updateProductStatus(productId, status, adminId) {
    console.log('=== Admin Service updateProductStatus ===');
    console.log('Input params:', { productId, status, adminId });
    
    // Validate productId
    if (!productId) {
      throw new Error('ID sản phẩm không hợp lệ');
    }

    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new Error('ID sản phẩm không hợp lệ');
    }

    // Validate status
    const validStatuses = ['DRAFT', 'PENDING', 'ACTIVE', 'RENTED', 'INACTIVE', 'SUSPENDED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Trạng thái không hợp lệ. Trạng thái hợp lệ: ${validStatuses.join(', ')}`);
    }

    try {
      const updateData = { 
        status,
        updatedAt: new Date()
      };

      // Add moderation info based on status
      if (status === 'ACTIVE') {
        updateData['moderation.approvedBy'] = adminId;
        updateData['moderation.approvedAt'] = new Date();
      } else if (status === 'SUSPENDED') {
        updateData['moderation.suspendedBy'] = adminId;
        updateData['moderation.suspendedAt'] = new Date();
      }

      console.log('Updating product with data:', updateData);
      
      const product = await Product.findByIdAndUpdate(
        productId,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('owner', 'fullName username email phone')
      .populate('category', 'name slug');

      if (!product) {
        throw new Error('Không tìm thấy sản phẩm');
      }

      console.log('Product status updated successfully:', product.status);
      return product;
    } catch (error) {
      console.error('Error updating product status:', error.message);
      
      if (error.message === 'Không tìm thấy sản phẩm') {
        throw error;
      }
      
      throw new Error('Lỗi khi cập nhật trạng thái sản phẩm');
    }
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
      query.masterOrderNumber = { $regex: search, $options: 'i' };
    }

    const skip = (page - 1) * limit;

    const [orders, total, stats] = await Promise.all([
      Order.find(query)
        .populate('renter', 'fullName username email phone profile')
        .populate({
          path: 'subOrders',
          populate: [
            { path: 'owner', select: 'fullName username email' },
            { path: 'products.product', select: 'title images pricing' }
          ]
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(query),
      // Get overall stats (not affected by search/status filters)
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Process stats
    const statusStats = {
      total: 0,
      active: 0,
      pending: 0,
      completed: 0,
      cancelled: 0
    };

    stats.forEach(stat => {
      statusStats.total += stat.count;
      if (stat._id === 'ACTIVE') {
        statusStats.active = stat.count;
      } else if (stat._id === 'PENDING' || stat._id === 'PENDING_PAYMENT' || stat._id === 'PENDING_CONFIRMATION') {
        statusStats.pending += stat.count;
      } else if (stat._id === 'COMPLETED') {
        statusStats.completed = stat.count;
      } else if (stat._id === 'CANCELLED') {
        statusStats.cancelled = stat.count;
      }
    });

    return {
      orders,
      stats: statusStats,
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
      .populate('renter', 'fullName username email phone profile address')
      .populate({
        path: 'subOrders',
        populate: [
          { 
            path: 'owner', 
            select: 'fullName username email phone profile' 
          },
          { 
            path: 'products.product', 
            select: 'title description images pricing status category',
            populate: {
              path: 'category',
              select: 'name slug'
            }
          }
        ]
      });

    if (!order) {
      throw new Error('Không tìm thấy đơn hàng');
    }

    return order;
  }

  async updateOrderStatus(orderId, status) {
    const validStatuses = [
      'DRAFT',
      'PENDING_PAYMENT',
      'PAYMENT_COMPLETED',
      'PENDING_CONFIRMATION',
      'READY_FOR_CONTRACT',
      'CONTRACT_SIGNED',
      'PROCESSING',
      'DELIVERED',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED'
    ];

    if (!validStatuses.includes(status)) {
      throw new Error('Trạng thái không hợp lệ');
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    )
      .populate('renter', 'fullName username email')
      .populate('subOrders');

    if (!order) {
      throw new Error('Không tìm thấy đơn hàng');
    }

    return order;
  }

 // ========== REPORT MANAGEMENT ==========
  async getAllReports(filters) {
    try {
      const { page = 1, limit = 10, search, reportType, status } = filters;
      const skip = (page - 1) * limit;
      
      // Build filter query
      let query = {};
      
      if (search) {
        query.$or = [
          { reason: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { adminNotes: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (reportType) {
        query.reportType = reportType;
      }
      
      if (status) {
        query.status = status;
      }

      const [reports, total] = await Promise.all([
        Report.find(query)
          .populate('reporter', 'fullName email avatar')
          .populate('reportedItem', 'title images price status')
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
          total,
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy danh sách báo cáo: ${error.message}`);
    }
  }

  async getReportById(reportId) {
    try {
      const report = await Report.findById(reportId)
        .populate('reporter', 'fullName username email avatar phone address status createdAt isKycVerified profile')
        .populate('reportedItem', 'title description images price status owner category createdAt viewCount')
        .populate({
          path: 'reportedItem',
          populate: {
            path: 'owner',
            select: 'fullName username email avatar phone status createdAt isKycVerified profile'
          }
        })
        .populate({
          path: 'reportedItem',
          populate: {
            path: 'category',
            select: 'name'
          }
        });

      return report;
    } catch (error) {
      throw new Error(`Lỗi khi lấy chi tiết báo cáo: ${error.message}`);
    }
  }

  async updateReportStatus(reportId, status, adminNotes) {
    try {
      const validStatuses = ['PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED'];
      if (!validStatuses.includes(status)) {
        throw new Error('Trạng thái không hợp lệ');
      }

      const updateData = {
        status,
        updatedAt: new Date()
      };

      if (adminNotes) {
        updateData.adminNotes = adminNotes;
      }

      const updatedReport = await Report.findByIdAndUpdate(
        reportId,
        updateData,
        { new: true }
      )
        .populate('reporter', 'fullName email avatar')
        .populate('reportedItem', 'title images price status');

      if (!updatedReport) {
        throw new Error('Không tìm thấy báo cáo');
      }

      return updatedReport;
    } catch (error) {
      throw new Error(`Lỗi khi cập nhật trạng thái báo cáo: ${error.message}`);
    }
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