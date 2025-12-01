const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Report = require('../models/Report');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const SystemWallet = require('../models/SystemWallet');
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');

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

  // async updateUserCreditScore(userId, creditScore, adminId) {
  //   // Validate ObjectId format
  //   const mongoose = require('mongoose');
  //   if (!mongoose.Types.ObjectId.isValid(userId)) {
  //     throw new Error('ID người dùng không hợp lệ');
  //   }

  //   // Validate creditScore
  //   const score = parseInt(creditScore);
  //   if (isNaN(score) || score < 0 || score > 1000) {
  //     throw new Error('Điểm tín dụng phải là số từ 0 đến 1000');
  //   }

  //   if (userId === adminId) {
  //     throw new Error('Không thể thay đổi điểm tín dụng của chính mình');
  //   }

  //   const user = await User.findByIdAndUpdate(
  //     userId,
  //     { 
  //       creditScore: score,
  //       updatedAt: new Date()
  //     },
  //     { new: true, runValidators: true }
  //   ).select('-password');

  //   if (!user) {
  //     throw new Error('Không tìm thấy người dùng');
  //   }

  //   return user;
  // }

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

  // ========== USER DETAILS (Orders, Products, Bank) ==========
  async getUserOrders(userId) {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('ID người dùng không hợp lệ');
    }

    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      // If user is OWNER, get orders containing their products through SubOrders
      if (user.role === 'OWNER') {
        const SubOrder = require('../models/SubOrder');
        
        // Find all SubOrders where the product belongs to this owner
        const subOrders = await SubOrder.find({})
          .populate({
            path: 'product',
            match: { owner: userId },
            select: 'title images pricing status condition'
          })
          .populate({
            path: 'masterOrder',
            populate: {
              path: 'renter',
              select: 'profile.firstName profile.lastName email phone'
            }
          })
          .sort({ createdAt: -1 })
          .limit(50);

        // Filter out subOrders where product didn't match (owner is different)
        const filteredSubOrders = subOrders.filter(subOrder => subOrder.product);

        return filteredSubOrders;
      } else {
        // If user is RENTER, get their rental orders
        const orders = await Order.find({ renter: userId })
          .populate('subOrders')
          .populate({
            path: 'subOrders',
            populate: {
              path: 'product',
              select: 'title images pricing status owner',
              populate: {
                path: 'owner',
                select: 'profile.firstName profile.lastName email'
              }
            }
          })
          .sort({ createdAt: -1 })
          .limit(50);

        return orders;
      }
    } catch (error) {
      if (error.message === 'Không tìm thấy người dùng' || error.message === 'ID người dùng không hợp lệ') {
        throw error;
      }
      throw new Error(`Lỗi khi lấy đơn hàng: ${error.message}`);
    }
  }

  async getUserProducts(userId) {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('ID người dùng không hợp lệ');
    }

    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      // Only get products for OWNER role
      if (user.role === 'OWNER') {
        const products = await Product.find({ owner: userId })
          .populate('category', 'name icon')
          .populate('subCategory', 'name')
          .sort({ createdAt: -1 })
          .limit(50);

        return products;
      }

      return [];
    } catch (error) {
      if (error.message === 'Không tìm thấy người dùng' || error.message === 'ID người dùng không hợp lệ') {
        throw error;
      }
      throw new Error(`Lỗi khi lấy sản phẩm: ${error.message}`);
    }
  }

  async getUserBankAccount(userId) {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('ID người dùng không hợp lệ');
    }

    try {
      const user = await User.findById(userId).select('bankAccount');
      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      return {
        bankAccount: user.bankAccount || null,
        verified: user.bankAccount?.isVerified || false,
        status: user.bankAccount?.status || 'PENDING'
      };
    } catch (error) {
      if (error.message === 'Không tìm thấy người dùng' || error.message === 'ID người dùng không hợp lệ') {
        throw error;
      }
      throw new Error(`Lỗi khi lấy thông tin ngân hàng: ${error.message}`);
    }
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

      // Gửi email thông báo nếu sản phẩm bị đình chỉ
      if (status === 'SUSPENDED' && product.owner && product.owner.email) {
        try {
          const sendMail = require('../utils/mailer');
          const emailTemplates = require('../utils/emailTemplates');
          
          const ownerName = product.owner.fullName || product.owner.username || 'Chủ sản phẩm';
          const suspendedAt = new Date().toLocaleString('vi-VN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          const suspensionReason = product.moderation?.suspensionReason || 'Sản phẩm vi phạm quy định của hệ thống';
          
          await sendMail({
            email: product.owner.email,
            subject: '⚠️ Thông báo: Sản phẩm của bạn đã bị đình chỉ',
            html: emailTemplates.productSuspendedEmail(
              ownerName,
              product.title,
              suspensionReason,
              suspendedAt
            )
          });
          
          console.log('Suspension notification email sent to:', product.owner.email);
        } catch (emailError) {
          console.error('Error sending suspension email:', emailError.message);
          // Không throw error để không ảnh hưởng đến việc đình chỉ sản phẩm
        }
      }

      return product;
    } catch (error) {
      console.error('Error updating product status:', error.message);
      
      if (error.message === 'Không tìm thấy sản phẩm') {
        throw error;
      }
      
      throw new Error('Lỗi khi cập nhật trạng thái sản phẩm');
    }
  }

  // async approveProduct(productId, adminId) {
  //   const product = await Product.findByIdAndUpdate(
  //     productId,
  //     { 
  //       status: 'APPROVED',
  //       'moderation.approvedBy': adminId,
  //       'moderation.approvedAt': new Date(),
  //       updatedAt: new Date()
  //     },
  //     { new: true }
  //   ).populate('owner', 'profile.firstName profile.lastName email');

  //   if (!product) {
  //     throw new Error('Không tìm thấy sản phẩm');
  //   }

  //   return product;
  // }

  // async rejectProduct(productId, reason, adminId) {
  //   if (!reason) {
  //     throw new Error('Vui lòng nhập lý do từ chối');
  //   }

  //   const product = await Product.findByIdAndUpdate(
  //     productId,
  //     { 
  //       status: 'REJECTED',
  //       'moderation.rejectedBy': adminId,
  //       'moderation.rejectedAt': new Date(),
  //       'moderation.rejectionReason': reason,
  //       updatedAt: new Date()
  //     },
  //     { new: true }
  //   ).populate('owner', 'profile.firstName profile.lastName email');

  //   if (!product) {
  //     throw new Error('Không tìm thấy sản phẩm');
  //   }

  //   return product;
  // }

  async suspendProduct(productId, adminId, reason = '') {
    console.log('=== Admin Service suspendProduct ===');
    console.log('Input params:', { productId, adminId, reason });
    
    // Validate productId
    if (!productId) {
      throw new Error('ID sản phẩm không hợp lệ');
    }

    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new Error('ID sản phẩm không hợp lệ');
    }

    try {
      const updateData = { 
        status: 'SUSPENDED',
        updatedAt: new Date(),
        'moderation.suspendedBy': adminId,
        'moderation.suspendedAt': new Date()
      };

      if (reason) {
        updateData['moderation.suspensionReason'] = reason;
      }

      console.log('Suspending product with data:', updateData);
      
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

      console.log('Product suspended successfully:', product._id);

      // Gửi email thông báo cho chủ sản phẩm
      if (product.owner && product.owner.email) {
        try {
          const sendMail = require('../utils/mailer');
          const emailTemplates = require('../utils/emailTemplates');
          
          const ownerName = product.owner.fullName || product.owner.username || 'Chủ sản phẩm';
          const suspendedAt = new Date().toLocaleString('vi-VN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          await sendMail({
            email: product.owner.email,
            subject: '⚠️ Thông báo: Sản phẩm của bạn đã bị đình chỉ',
            html: emailTemplates.productSuspendedEmail(
              ownerName,
              product.title,
              reason || 'Sản phẩm vi phạm quy định của hệ thống',
              suspendedAt
            )
          });
          
          console.log('Suspension notification email sent to:', product.owner.email);
        } catch (emailError) {
          console.error('Error sending suspension email:', emailError.message);
          // Không throw error để không ảnh hưởng đến việc đình chỉ sản phẩm
        }
      }

      return product;
    } catch (error) {
      console.error('Error suspending product:', error.message);
      
      if (error.message === 'Không tìm thấy sản phẩm') {
        throw error;
      }
      
      throw new Error('Lỗi khi đình chỉ sản phẩm');
    }
  }

  // // ========== CATEGORY MANAGEMENT ==========
  // async getAllCategories() {
  //   return await Category.find().sort({ name: 1 });
  // }

  // async createCategory(categoryData, adminId) {
  //   const category = new Category({
  //     ...categoryData,
  //     createdBy: adminId
  //   });

  //   await category.save();
  //   return category;
  // }

  // async updateCategory(categoryId, updateData, adminId) {
  //   const category = await Category.findByIdAndUpdate(
  //     categoryId,
  //     { 
  //       ...updateData,
  //       updatedBy: adminId,
  //       updatedAt: new Date()
  //     },
  //     { new: true, runValidators: true }
  //   );

  //   if (!category) {
  //     throw new Error('Không tìm thấy danh mục');
  //   }

  //   return category;
  // }

  // async deleteCategory(categoryId, adminId) {
  //   // Check if any products are using this category
  //   const productCount = await Product.countDocuments({ category: categoryId });
    
  //   if (productCount > 0) {
  //     throw new Error(`Không thể xóa danh mục vì có ${productCount} sản phẩm đang sử dụng`);
  //   }

  //   const category = await Category.findByIdAndDelete(categoryId);
  //   if (!category) {
  //     throw new Error('Không tìm thấy danh mục');
  //   }
  // }

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

  // ========== BANK ACCOUNT VERIFICATION ==========
  /**
   * Get all bank accounts with filters
   */
  async getAllBankAccounts(filters = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        status,
        bankCode
      } = filters;

      const skip = (page - 1) * limit;
      const query = {
        'bankAccount.accountNumber': { $exists: true, $ne: null }
      };

      // Filter by verification status
      if (status) {
        query['bankAccount.status'] = status.toUpperCase();
      }

      // Filter by bank code
      if (bankCode) {
        query['bankAccount.bankCode'] = bankCode.toUpperCase();
      }

      // Search by account number, account holder name, or user email
      if (search) {
        query.$or = [
          { 'bankAccount.accountNumber': { $regex: search, $options: 'i' } },
          { 'bankAccount.accountHolderName': { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      // Get bank accounts with pagination
      const [bankAccounts, total] = await Promise.all([
        User.find(query)
          .select('email profile.firstName profile.lastName bankAccount role status')
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ 'bankAccount.addedAt': -1 })
          .lean(),
        User.countDocuments(query)
      ]);

      // Get statistics
      const stats = await User.aggregate([
        {
          $match: {
            'bankAccount.accountNumber': { $exists: true, $ne: null }
          }
        },
        {
          $facet: {
            statusStats: [
              {
                $group: {
                  _id: '$bankAccount.status',
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
      ]);

      const statusCounts = {};
      if (stats[0]?.statusStats) {
        stats[0].statusStats.forEach(stat => {
          statusCounts[stat._id?.toLowerCase() || 'pending'] = stat.count;
        });
      }

      return {
        bankAccounts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalBankAccounts: total,
          limit: parseInt(limit)
        },
        stats: {
          total: stats[0]?.total[0]?.count || 0,
          pending: statusCounts.pending || 0,
          verified: statusCounts.verified || 0,
          rejected: statusCounts.rejected || 0
        }
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy danh sách tài khoản ngân hàng: ${error.message}`);
    }
  }

  /**
   * Get bank account detail by user ID
   */
  async getBankAccountById(userId) {
    try {
      const user = await User.findById(userId)
        .select('email profile bankAccount role status verification cccd')
        .lean();

      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      if (!user.bankAccount || !user.bankAccount.accountNumber) {
        throw new Error('Người dùng chưa có tài khoản ngân hàng');
      }

      return user;
    } catch (error) {
      throw new Error(`Lỗi khi lấy chi tiết tài khoản ngân hàng: ${error.message}`);
    }
  }

  /**
   * Verify bank account
   */
  async verifyBankAccount(userId, adminNote = '') {
    try {
      console.log('verifyBankAccount service called with:', { userId, adminNote });
      
      const user = await User.findById(userId);
      console.log('User found:', user ? 'Yes' : 'No');

      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      console.log('User bankAccount:', user.bankAccount);

      if (!user.bankAccount || !user.bankAccount.accountNumber) {
        throw new Error('Người dùng chưa có tài khoản ngân hàng');
      }

      if (user.bankAccount.status === 'VERIFIED') {
        throw new Error('Tài khoản ngân hàng đã được xác minh');
      }

      // Update bank account status
      user.bankAccount.status = 'VERIFIED';
      user.bankAccount.isVerified = true;
      user.bankAccount.verifiedAt = new Date();
      user.bankAccount.adminNote = adminNote;

      // Clean invalid gender value if exists
      if (user.profile && user.profile.gender && !['MALE', 'FEMALE', 'OTHER'].includes(user.profile.gender)) {
        console.log('Cleaning invalid gender value:', user.profile.gender);
        user.profile.gender = undefined;
      }

      console.log('Saving user with updated bank account...');
      await user.save();
      console.log('User saved successfully');

      return user;
    } catch (error) {
      console.error('Error in verifyBankAccount service:', error);
      throw new Error(`Lỗi khi xác minh tài khoản ngân hàng: ${error.message}`);
    }
  }

  /**
   * Reject bank account verification
   */
  async rejectBankAccount(userId, rejectionReason) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      if (!user.bankAccount || !user.bankAccount.accountNumber) {
        throw new Error('Người dùng chưa có tài khoản ngân hàng');
      }

      if (user.bankAccount.status === 'REJECTED') {
        throw new Error('Tài khoản ngân hàng đã bị từ chối');
      }

      // Update bank account status
      user.bankAccount.status = 'REJECTED';
      user.bankAccount.isVerified = false;
      user.bankAccount.rejectionReason = rejectionReason;
      user.bankAccount.rejectedAt = new Date();

      // Clean invalid gender value if exists
      if (user.profile && user.profile.gender && !['MALE', 'FEMALE', 'OTHER'].includes(user.profile.gender)) {
        user.profile.gender = undefined;
      }

      await user.save();

      return user;
    } catch (error) {
      throw new Error(`Lỗi khi từ chối xác minh tài khoản ngân hàng: ${error.message}`);
    }
  }

  /**
   * Update bank account status
   */
  async updateBankAccountStatus(userId, status, note = '') {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw new Error('Không tìm thấy người dùng');
      }

      if (!user.bankAccount || !user.bankAccount.accountNumber) {
        throw new Error('Người dùng chưa có tài khoản ngân hàng');
      }

      const validStatuses = ['PENDING', 'VERIFIED', 'REJECTED'];
      if (!validStatuses.includes(status.toUpperCase())) {
        throw new Error('Trạng thái không hợp lệ');
      }

      // Update bank account status
      user.bankAccount.status = status.toUpperCase();
      user.bankAccount.isVerified = status.toUpperCase() === 'VERIFIED';
      
      if (status.toUpperCase() === 'VERIFIED') {
        user.bankAccount.verifiedAt = new Date();
        user.bankAccount.adminNote = note;
      } else if (status.toUpperCase() === 'REJECTED') {
        user.bankAccount.rejectedAt = new Date();
        user.bankAccount.rejectionReason = note;
      }

      // Clean invalid gender value if exists
      if (user.profile && user.profile.gender && !['MALE', 'FEMALE', 'OTHER'].includes(user.profile.gender)) {
        user.profile.gender = undefined;
      }

      await user.save();

      return user;
    } catch (error) {
      throw new Error(`Lỗi khi cập nhật trạng thái tài khoản ngân hàng: ${error.message}`);
    }
  }

  // ========== WITHDRAWAL FINANCIAL ANALYSIS ==========
  
  /**
   * Get detailed financial analysis for a withdrawal request
   * @param {string} withdrawalId - Withdrawal request ID
   * @returns {Object} Comprehensive financial data for admin review
   */
  async getWithdrawalFinancialAnalysis(withdrawalId) {
    try {
      // Get withdrawal request with full user data
      const withdrawal = await Withdrawal.findById(withdrawalId)
        .populate('user', 'email profile bankAccount cccd role createdAt')
        .populate('wallet')
        .populate('processedBy', 'email profile')
        .lean();

      if (!withdrawal) {
        throw new Error('Withdrawal request not found');
      }

      const userId = withdrawal.user._id;
      const userWallet = withdrawal.wallet;

      // 1. User's current wallet status
      const currentWalletStatus = await this.getUserWalletAnalysis(userId);

      // 2. Transaction history analysis (last 90 days)
      const transactionAnalysis = await this.getUserTransactionAnalysis(userId);

      // 3. Withdrawal history
      const withdrawalHistory = await this.getUserWithdrawalHistory(userId);

      // 4. System wallet interactions
      const systemInteractions = await this.getUserSystemWalletInteractions(userId);

      // 5. PayOS transaction verification codes
      const payosVerificationCodes = await this.getPayOSVerificationCodes(userId);

      // 6. Risk assessment
      const riskAssessment = await this.calculateWithdrawalRiskScore(userId, withdrawal.amount);

      // 7. Account activity timeline
      const activityTimeline = await this.getUserActivityTimeline(userId);

      return {
        withdrawal: {
          ...withdrawal,
          requestedAmount: withdrawal.amount,
          formattedAmount: withdrawal.amount.toLocaleString('vi-VN') + ' VND'
        },
        user: {
          ...withdrawal.user,
          accountAge: this.calculateAccountAge(withdrawal.user.createdAt),
          verificationStatus: {
            kyc: withdrawal.user.cccd?.isVerified || false,
            bankAccount: withdrawal.user.bankAccount?.isVerified || false
          }
        },
        currentWalletStatus,
        transactionAnalysis,
        withdrawalHistory,
        systemInteractions,
        payosVerificationCodes,
        riskAssessment,
        activityTimeline,
        recommendedAction: this.getWithdrawalRecommendation(riskAssessment),
        generatedAt: new Date()
      };
    } catch (error) {
      throw new Error(`Error generating financial analysis: ${error.message}`);
    }
  }

  /**
   * Get user's wallet analysis
   */
  async getUserWalletAnalysis(userId) {
    const wallet = await Wallet.findOne({ user: userId }).lean();
    
    if (!wallet) {
      return {
        exists: false,
        balance: { available: 0, frozen: 0, pending: 0, total: 0 }
      };
    }

    const total = (wallet.balance.available || 0) + (wallet.balance.frozen || 0) + (wallet.balance.pending || 0);

    return {
      exists: true,
      balance: {
        available: wallet.balance.available || 0,
        frozen: wallet.balance.frozen || 0,
        pending: wallet.balance.pending || 0,
        total,
        formattedAvailable: (wallet.balance.available || 0).toLocaleString('vi-VN') + ' VND',
        formattedTotal: total.toLocaleString('vi-VN') + ' VND'
      },
      lastActivity: wallet.updatedAt,
      createdAt: wallet.createdAt
    };
  }

  /**
   * Get comprehensive transaction analysis
   */
  async getUserTransactionAnalysis(userId) {
    const last90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    
    // Get all transactions in last 90 days
    const transactions = await Transaction.find({
      user: userId,
      createdAt: { $gte: last90Days }
    })
    .sort({ createdAt: -1 })
    .lean();

    // Categorize transactions
    const categories = {
      deposits: transactions.filter(t => ['deposit', 'DEPOSIT'].includes(t.type)),
      withdrawals: transactions.filter(t => ['withdrawal', 'WITHDRAWAL'].includes(t.type)),
      payments: transactions.filter(t => ['payment', 'order_payment'].includes(t.type)),
      refunds: transactions.filter(t => t.type === 'refund'),
      penalties: transactions.filter(t => t.type === 'penalty'),
      promotionRevenue: transactions.filter(t => t.type === 'PROMOTION_REVENUE'),
      transfers: transactions.filter(t => ['TRANSFER_IN', 'TRANSFER_OUT'].includes(t.type))
    };

    // Calculate totals and statistics
    const stats = {};
    for (const [category, txns] of Object.entries(categories)) {
      const amounts = txns.map(t => t.amount);
      stats[category] = {
        count: txns.length,
        total: amounts.reduce((sum, amt) => sum + amt, 0),
        average: amounts.length > 0 ? amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length : 0,
        largest: amounts.length > 0 ? Math.max(...amounts) : 0,
        smallest: amounts.length > 0 ? Math.min(...amounts) : 0,
        successRate: txns.length > 0 ? txns.filter(t => t.status === 'success').length / txns.length * 100 : 0
      };
    }

    // Monthly breakdown
    const monthlyBreakdown = this.groupTransactionsByMonth(transactions);

    return {
      totalTransactions: transactions.length,
      period: '90 days',
      categories,
      statistics: stats,
      monthlyBreakdown,
      recentTransactions: transactions.slice(0, 10) // Latest 10
    };
  }

  /**
   * Get user's withdrawal history and patterns
   */
  async getUserWithdrawalHistory(userId) {
    const withdrawals = await Withdrawal.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const stats = {
      totalRequests: withdrawals.length,
      successful: withdrawals.filter(w => w.status === 'completed').length,
      rejected: withdrawals.filter(w => w.status === 'rejected').length,
      pending: withdrawals.filter(w => w.status === 'pending').length,
      processing: withdrawals.filter(w => w.status === 'processing').length,
      cancelled: withdrawals.filter(w => w.status === 'cancelled').length
    };

    const amounts = withdrawals.filter(w => w.status === 'completed').map(w => w.amount);
    const totalWithdrawn = amounts.reduce((sum, amt) => sum + amt, 0);

    // Pattern analysis
    const patterns = {
      averageAmount: amounts.length > 0 ? totalWithdrawn / amounts.length : 0,
      largestWithdrawal: amounts.length > 0 ? Math.max(...amounts) : 0,
      totalWithdrawn,
      averageProcessingTime: this.calculateAverageProcessingTime(withdrawals),
      frequencyPattern: this.analyzeWithdrawalFrequency(withdrawals)
    };

    return {
      history: withdrawals,
      statistics: stats,
      patterns,
      successRate: stats.totalRequests > 0 ? (stats.successful / stats.totalRequests * 100).toFixed(2) : 0
    };
  }

  /**
   * Get system wallet interactions
   */
  async getUserSystemWalletInteractions(userId) {
    const systemInteractions = await Transaction.find({
      user: userId,
      $or: [
        { fromSystemWallet: true },
        { toSystemWallet: true },
        { systemWalletAction: { $exists: true } }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

    const summary = {
      totalInteractions: systemInteractions.length,
      receivedFromSystem: systemInteractions.filter(t => t.fromSystemWallet).reduce((sum, t) => sum + t.amount, 0),
      paidToSystem: systemInteractions.filter(t => t.toSystemWallet).reduce((sum, t) => sum + t.amount, 0),
      recentInteractions: systemInteractions.slice(0, 10)
    };

    return summary;
  }

  /**
   * Get PayOS verification codes for bank verification
   */
  async getPayOSVerificationCodes(userId) {
    // Get PayOS transactions including deposits and promotion payments
    const payosTransactions = await Transaction.find({
      $or: [
        // Direct PayOS deposits
        {
          user: userId,
          provider: 'payos',
          status: 'success',
          type: { $in: ['deposit', 'DEPOSIT'] }
        },
        // PayOS promotion payments (these go to system wallet but show user as payer)
        {
          user: userId,
          status: 'success',
          type: 'PROMOTION_REVENUE',
          description: { $regex: 'PayOS', $options: 'i' }
        }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('amount externalId orderCode createdAt description paymentMethod metadata type')
    .lean();

    // Also get promotion payments from orders using PayOS
    const promotionOrders = await Order.find({
      customer: userId,
      paymentMethod: 'payos',
      paymentStatus: 'COMPLETED'
    })
    .select('totalAmount masterOrderNumber paymentInfo createdAt')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

    // Combine and format all PayOS-related transactions
    const allPayOSActivity = [
      ...payosTransactions.map(t => ({
        amount: t.amount,
        orderCode: t.externalId || t.orderCode || 'N/A',
        date: t.createdAt,
        formattedAmount: t.amount.toLocaleString('vi-VN') + ' VND',
        description: t.description,
        type: t.type === 'PROMOTION_REVENUE' ? 'Promotion Payment' : 'Deposit',
        source: 'transaction',
        metadata: t.metadata
      })),
      ...promotionOrders.map(o => ({
        amount: o.totalAmount,
        orderCode: o.paymentInfo?.orderCode || o.masterOrderNumber,
        date: o.createdAt,
        formattedAmount: o.totalAmount.toLocaleString('vi-VN') + ' VND',
        description: `Order payment: ${o.masterOrderNumber}`,
        type: 'Order Payment',
        source: 'order',
        metadata: o.paymentInfo
      }))
    ];

    // Sort by date and return most recent
    return allPayOSActivity
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20);
  }

  /**
   * Calculate withdrawal risk score
   */
  async calculateWithdrawalRiskScore(userId, requestedAmount) {
    let riskScore = 0;
    const riskFactors = [];

    // 1. Account age (newer accounts = higher risk)
    const user = await User.findById(userId).select('createdAt').lean();
    const accountAgeDays = (Date.now() - user.createdAt) / (24 * 60 * 60 * 1000);
    
    if (accountAgeDays < 7) {
      riskScore += 30;
      riskFactors.push('Tài khoản mới (< 7 ngày)');
    } else if (accountAgeDays < 30) {
      riskScore += 20;
      riskFactors.push('Tài khoản mới (< 30 ngày)');
    } else if (accountAgeDays < 90) {
      riskScore += 10;
      riskFactors.push('Tài khoản tương đối mới (< 90 ngày)');
    }

    // 2. Transaction history
    const transactionCount = await Transaction.countDocuments({ user: userId, status: 'success' });
    if (transactionCount < 5) {
      riskScore += 25;
      riskFactors.push('Lịch sử giao dịch hạn chế (< 5 giao dịch thành công)');
    } else if (transactionCount < 15) {
      riskScore += 15;
      riskFactors.push('Hoạt động giao dịch thấp (< 15 giao dịch)');
    }

    // 3. Withdrawal amount vs. typical activity
    const wallet = await Wallet.findOne({ user: userId }).lean();
    const balanceRatio = wallet ? (requestedAmount / (wallet.balance.available + requestedAmount)) : 1;
    
    if (balanceRatio > 0.8) {
      riskScore += 20;
      riskFactors.push('Rút số tiền lớn so với số dư (>80%)');
    } else if (balanceRatio > 0.5) {
      riskScore += 10;
      riskFactors.push('Rút số tiền vừa phải so với số dư (>50%)');
    }

    // 4. Recent failed transactions
    const recentFailures = await Transaction.countDocuments({
      user: userId,
      status: 'failed',
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    if (recentFailures > 3) {
      riskScore += 25;
      riskFactors.push('Nhiều giao dịch thất bại gần đây');
    } else if (recentFailures > 1) {
      riskScore += 15;
      riskFactors.push('Một số giao dịch thất bại gần đây');
    }

    // 5. Previous rejection rate
    const withdrawals = await Withdrawal.find({ user: userId }).lean();
    const rejectionRate = withdrawals.length > 0 ? 
      withdrawals.filter(w => w.status === 'rejected').length / withdrawals.length : 0;
    
    if (rejectionRate > 0.5) {
      riskScore += 30;
      riskFactors.push('Tỷ lệ từ chối rút tiền cao (>50%)');
    } else if (rejectionRate > 0.2) {
      riskScore += 15;
      riskFactors.push('Tỷ lệ từ chối rút tiền vừa phải (>20%)');
    }

    // Determine risk level
    let riskLevel;
    if (riskScore <= 20) riskLevel = 'LOW';
    else if (riskScore <= 50) riskLevel = 'MEDIUM';
    else if (riskScore <= 75) riskLevel = 'HIGH';
    else riskLevel = 'VERY_HIGH';

    return {
      score: riskScore,
      level: riskLevel,
      factors: riskFactors,
      recommendation: this.getRiskRecommendation(riskLevel, riskScore)
    };
  }

  /**
   * Get user activity timeline
   */
  async getUserActivityTimeline(userId) {
    const activities = [];

    // Get key activities from last 30 days
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Recent transactions
    const recentTransactions = await Transaction.find({
      user: userId,
      createdAt: { $gte: last30Days }
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('type amount status createdAt description')
    .lean();

    recentTransactions.forEach(t => {
      activities.push({
        type: 'transaction',
        action: t.type,
        amount: t.amount,
        status: t.status,
        timestamp: t.createdAt,
        description: t.description
      });
    });

    // Recent withdrawals
    const recentWithdrawals = await Withdrawal.find({
      user: userId,
      createdAt: { $gte: last30Days }
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('amount status createdAt')
    .lean();

    recentWithdrawals.forEach(w => {
      activities.push({
        type: 'withdrawal',
        action: 'withdrawal_request',
        amount: w.amount,
        status: w.status,
        timestamp: w.createdAt,
        description: `Withdrawal request: ${w.amount.toLocaleString('vi-VN')} VND`
      });
    });

    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return activities.slice(0, 30); // Latest 30 activities
  }

  // Helper methods
  calculateAccountAge(createdAt) {
    const days = Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000));
    if (days < 30) return `${days} days`;
    if (days < 365) return `${Math.floor(days / 30)} months`;
    return `${Math.floor(days / 365)} years`;
  }

  groupTransactionsByMonth(transactions) {
    const monthlyData = {};
    
    transactions.forEach(t => {
      const month = new Date(t.createdAt).toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { count: 0, total: 0, types: {} };
      }
      monthlyData[month].count++;
      monthlyData[month].total += t.amount;
      monthlyData[month].types[t.type] = (monthlyData[month].types[t.type] || 0) + 1;
    });

    return monthlyData;
  }

  calculateAverageProcessingTime(withdrawals) {
    const completed = withdrawals.filter(w => w.status === 'completed' && w.processedAt);
    if (completed.length === 0) return null;

    const totalTime = completed.reduce((sum, w) => {
      return sum + (new Date(w.processedAt) - new Date(w.createdAt));
    }, 0);

    const avgMs = totalTime / completed.length;
    const avgHours = Math.round(avgMs / (1000 * 60 * 60));
    
    return `${avgHours} hours`;
  }

  analyzeWithdrawalFrequency(withdrawals) {
    if (withdrawals.length < 2) return 'Dữ liệu không đủ';

    const intervals = [];
    for (let i = 1; i < withdrawals.length; i++) {
      const interval = new Date(withdrawals[i-1].createdAt) - new Date(withdrawals[i].createdAt);
      intervals.push(interval);
    }

    const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
    const avgDays = Math.round(avgInterval / (24 * 60 * 60 * 1000));

    if (avgDays < 7) return 'Rất thường xuyên (< 1 tuần)';
    if (avgDays < 30) return 'Thường xuyên (< 1 tháng)';
    if (avgDays < 90) return 'Đều đặn (< 3 tháng)';
    return 'Không thường xuyên (> 3 tháng)';
  }

  getRiskRecommendation(riskLevel, riskScore) {
    switch (riskLevel) {
      case 'LOW':
        return 'DUYỆT - Hồ sơ rủi ro thấp, khuyến nghị phê duyệt';
      case 'MEDIUM':
        return 'KIỂM TRA - Rủi ro vừa phải, khuyến nghị xác minh bổ sung';
      case 'HIGH':
        return 'ĐIỀU TRA - Rủi ro cao, cần điều tra kỹ lưỡng';
      case 'VERY_HIGH':
        return 'TỪ CHỐI - Rủi ro rất cao, khuyến nghị từ chối trừ khi có hoàn cảnh đặc biệt';
      default:
        return 'KHÔNG XÁC ĐỊNH';
    }
  }

  getWithdrawalRecommendation(riskAssessment) {
    const { level, score, factors } = riskAssessment;
    
    return {
      action: level === 'LOW' ? 'DUYỆT' : 
              level === 'MEDIUM' ? 'ĐIỀU TRA' : 
              level === 'HIGH' ? 'KIỂM TRA THỦ CÔNG' : 'TỪ CHỐI',
      confidence: level === 'LOW' ? 'CAO' : 
                  level === 'MEDIUM' ? 'TRUNG BÌNH' : 'THẤP',
      reasoning: factors.length > 0 ? factors.join(', ') : 'Không có yếu tố rủi ro đáng kể nào được xác định',
      priority: level === 'VERY_HIGH' ? 'KHẨN CẤP' : 
                level === 'HIGH' ? 'CAO' : 'BÌNH THƯỜNG'
    };
  }

  // ========== TRANSACTION MANAGEMENT ==========
  async getAllTransactions(filters) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        type,
        status,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      // Build query conditions
      const query = {};

      // Search by transaction ID, user email, or description
      if (search) {
        query.$or = [
          { externalId: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { reference: { $regex: search, $options: 'i' } }
        ];
      }

      // Filter by transaction type
      if (type) {
        query.type = type;
      }

      // Filter by transaction status
      if (status) {
        query.status = status;
      }

      // Filter by date range
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      // Filter by amount range
      if (minAmount || maxAmount) {
        query.amount = {};
        if (minAmount) {
          query.amount.$gte = parseFloat(minAmount);
        }
        if (maxAmount) {
          query.amount.$lte = parseFloat(maxAmount);
        }
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Sort options
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute queries
      const [transactions, total] = await Promise.all([
        Transaction.find(query)
          .populate('user', 'email profile.firstName profile.lastName')
          .populate('wallet', 'balance')
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Transaction.countDocuments(query)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(total / parseInt(limit));

      // Get summary stats for current filter
      const stats = await Transaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalTransactions: { $sum: 1 },
            avgAmount: { $avg: '$amount' },
            successfulTransactions: {
              $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
            },
            failedTransactions: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            }
          }
        }
      ]);

      return {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        },
        stats: stats[0] || {
          totalAmount: 0,
          totalTransactions: 0,
          avgAmount: 0,
          successfulTransactions: 0,
          failedTransactions: 0
        }
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy danh sách giao dịch: ${error.message}`);
    }
  }

  async getTransactionById(transactionId) {
    try {
      const transaction = await Transaction.findById(transactionId)
        .populate('user', 'email profile.firstName profile.lastName profile.phone')
        .populate('wallet', 'balance user')
        .lean();

      if (!transaction) {
        throw new Error('Không tìm thấy giao dịch');
      }

      return transaction;
    } catch (error) {
      throw new Error(`Lỗi khi lấy thông tin giao dịch: ${error.message}`);
    }
  }

  async getTransactionStats(filters) {
    try {
      const { startDate, endDate, period = 'day' } = filters;

      // Build date range query
      const dateQuery = {};
      if (startDate || endDate) {
        dateQuery.createdAt = {};
        if (startDate) {
          dateQuery.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          dateQuery.createdAt.$lte = new Date(endDate);
        }
      }

      // Determine date grouping format based on period
      let dateFormat;
      switch (period) {
        case 'hour':
          dateFormat = { $dateToString: { format: "%Y-%m-%d %H:00", date: "$createdAt" } };
          break;
        case 'day':
          dateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
          break;
        case 'week':
          dateFormat = { $dateToString: { format: "%Y-W%V", date: "$createdAt" } };
          break;
        case 'month':
          dateFormat = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
          break;
        default:
          dateFormat = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
      }

      // Aggregate transaction stats
      const [overallStats, timeSeriesStats, typeStats, statusStats] = await Promise.all([
        // Overall statistics
        Transaction.aggregate([
          { $match: dateQuery },
          {
            $group: {
              _id: null,
              totalTransactions: { $sum: 1 },
              totalAmount: { $sum: '$amount' },
              avgAmount: { $avg: '$amount' },
              maxAmount: { $max: '$amount' },
              minAmount: { $min: '$amount' },
              successfulTransactions: {
                $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
              },
              failedTransactions: {
                $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
              },
              pendingTransactions: {
                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
              }
            }
          }
        ]),

        // Time series data
        Transaction.aggregate([
          { $match: dateQuery },
          {
            $group: {
              _id: dateFormat,
              count: { $sum: 1 },
              amount: { $sum: '$amount' },
              avgAmount: { $avg: '$amount' },
              successful: {
                $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
              },
              failed: {
                $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
              }
            }
          },
          { $sort: { _id: 1 } }
        ]),

        // Transaction type breakdown
        Transaction.aggregate([
          { $match: dateQuery },
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              amount: { $sum: '$amount' },
              avgAmount: { $avg: '$amount' }
            }
          },
          { $sort: { count: -1 } }
        ]),

        // Status breakdown
        Transaction.aggregate([
          { $match: dateQuery },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              amount: { $sum: '$amount' }
            }
          }
        ])
      ]);

      return {
        overall: overallStats[0] || {
          totalTransactions: 0,
          totalAmount: 0,
          avgAmount: 0,
          maxAmount: 0,
          minAmount: 0,
          successfulTransactions: 0,
          failedTransactions: 0,
          pendingTransactions: 0
        },
        timeSeries: timeSeriesStats,
        byType: typeStats,
        byStatus: statusStats,
        period
      };
    } catch (error) {
      throw new Error(`Lỗi khi lấy thống kê giao dịch: ${error.message}`);
    }
  }

  async exportTransactions(filters, format = 'csv') {
    try {
      const { type, status, startDate, endDate } = filters;

      // Build query
      const query = {};
      if (type) query.type = type;
      if (status) query.status = status;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Get transactions
      const transactions = await Transaction.find(query)
        .populate('user', 'email profile.firstName profile.lastName')
        .sort({ createdAt: -1 })
        .lean();

      if (format === 'csv') {
        // Generate CSV
        const csvHeaders = [
          'Transaction ID',
          'User Email',
          'User Name',
          'Type',
          'Status',
          'Amount (VND)',
          'Description',
          'Created At',
          'Updated At'
        ];

        const csvRows = transactions.map(transaction => [
          transaction.externalId || transaction._id,
          transaction.user?.email || 'N/A',
          `${transaction.user?.profile?.firstName || ''} ${transaction.user?.profile?.lastName || ''}`.trim() || 'N/A',
          transaction.type,
          transaction.status,
          transaction.amount.toLocaleString('vi-VN'),
          transaction.description || '',
          new Date(transaction.createdAt).toLocaleString('vi-VN'),
          new Date(transaction.updatedAt).toLocaleString('vi-VN')
        ]);

        const csvContent = [csvHeaders, ...csvRows]
          .map(row => row.map(field => `"${field}"`).join(','))
          .join('\n');

        return csvContent;
      }

      // For Excel format, you would need a library like xlsx
      // This is a simplified JSON export for now
      return JSON.stringify(transactions, null, 2);
    } catch (error) {
      throw new Error(`Lỗi khi xuất dữ liệu giao dịch: ${error.message}`);
    }
  }
}

module.exports = new AdminService();