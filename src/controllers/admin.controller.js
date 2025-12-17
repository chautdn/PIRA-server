const adminService = require('../services/admin.service');
const responseUtils = require('../utils/response');

class AdminController {
  // ========== DASHBOARD ==========
  async getDashboard(req, res) {
    try {
      const dashboard = await adminService.getDashboardStats();
      return responseUtils.success(res, dashboard, 'Lấy thống kê dashboard thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getRevenueStatistics(req, res) {
    try {
      const { period, startDate, endDate } = req.query;
      const statistics = await adminService.getRevenueStatistics({ period, startDate, endDate });
      return responseUtils.success(res, statistics, 'Lấy thống kê doanh thu thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getProfitStatistics(req, res) {
    try {
      const { period, startDate, endDate } = req.query;
      const statistics = await adminService.getProfitStatistics({ period, startDate, endDate });
      return responseUtils.success(res, statistics, 'Lấy thống kê lợi nhuận thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== SUBORDER STATISTICS ==========
  async getRevenueByOwner(req, res) {
    try {
      const { period, startDate, endDate, limit = 10 } = req.query;
      const dateRange = adminService.getDateRange(period, startDate, endDate);
      const statistics = await adminService.getRevenueByOwner(dateRange, parseInt(limit));
      return responseUtils.success(res, statistics, 'Lấy thống kê doanh thu theo owner thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getDepositStatistics(req, res) {
    try {
      const { period, startDate, endDate } = req.query;
      const dateRange = adminService.getDateRange(period, startDate, endDate);
      const statistics = await adminService.getDepositStatistics(dateRange);
      return responseUtils.success(res, statistics, 'Lấy thống kê tiền cọc thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getTopRentalProducts(req, res) {
    try {
      const { period, startDate, endDate, limit = 10 } = req.query;
      const dateRange = adminService.getDateRange(period, startDate, endDate);
      const statistics = await adminService.getTopRentalProducts(dateRange, parseInt(limit));
      return responseUtils.success(res, statistics, 'Lấy sản phẩm được thuê nhiều nhất thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getSubOrderStatusBreakdown(req, res) {
    try {
      const { period, startDate, endDate } = req.query;
      const dateRange = adminService.getDateRange(period, startDate, endDate);
      const statistics = await adminService.getSubOrderStatusBreakdown(dateRange);
      return responseUtils.success(res, statistics, 'Lấy thống kê trạng thái SubOrder thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== USER MANAGEMENT ==========
  async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 10, search, role, status } = req.query;
      const filters = { page, limit, search, role, status };

      const result = await adminService.getAllUsers(filters);
      return responseUtils.success(res, result, 'Lấy danh sách người dùng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getUserById(req, res) {
    console.log('=== Admin Controller getUserById ===');
    console.log('Request params:', req.params);
    console.log('Request URL:', req.originalUrl);
    console.log('Request method:', req.method);

    try {
      const { userId } = req.params;
      console.log('Extracted userId from params:', userId);
      console.log('UserId type:', typeof userId);
      console.log('UserId length:', userId?.length);

      const user = await adminService.getUserById(userId);
      console.log('Service returned user successfully');

      return responseUtils.success(res, user, 'Lấy thông tin người dùng thành công');
    } catch (error) {
      console.error('=== Admin Controller ERROR ===');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('============================');

      // Handle specific errors with appropriate status codes
      if (error.message === 'ID người dùng không hợp lệ') {
        return responseUtils.error(res, error.message, 400);
      } else if (error.message === 'Không tìm thấy người dùng') {
        return responseUtils.error(res, error.message, 404);
      } else {
        return responseUtils.error(res, 'Lỗi server khi tải thông tin người dùng', 500);
      }
    }
  }

  async updateUserStatus(req, res) {
    try {
      const { userId } = req.params;
      const { status } = req.body;
      const adminId = req.user.id;

      const user = await adminService.updateUserStatus(userId, status, adminId);
      return responseUtils.success(res, user, 'Cập nhật trạng thái người dùng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const adminId = req.user.id;

      const user = await adminService.updateUserRole(userId, role, adminId);
      return responseUtils.success(res, user, 'Cập nhật vai trò người dùng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async updateUser(req, res) {
    try {
      const { userId } = req.params;
      const updateData = req.body;
      const adminId = req.user.id;

      const user = await adminService.updateUser(userId, updateData, adminId);
      return responseUtils.success(res, user, 'Cập nhật thông tin người dùng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // async updateUserCreditScore(req, res) {
  //   try {
  //     const { userId } = req.params;
  //     const { creditScore } = req.body;
  //     const adminId = req.user.id;

  //     if (creditScore === undefined || creditScore === null) {
  //       return responseUtils.error(res, 'Vui lòng cung cấp điểm tín dụng', 400);
  //     }

  //     const user = await adminService.updateUserCreditScore(userId, creditScore, adminId);
  //     return responseUtils.success(res, user, 'Cập nhật điểm tín dụng thành công');
  //   } catch (error) {
  //     return responseUtils.error(res, error.message, 500);
  //   }
  // }

  async bulkUpdateUsers(req, res) {
    try {
      const { userIds, updateData } = req.body;
      const adminId = req.user.id;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return responseUtils.error(res, 'Danh sách userIds không hợp lệ', 400);
      }

      if (!updateData || typeof updateData !== 'object') {
        return responseUtils.error(res, 'Dữ liệu cập nhật không hợp lệ', 400);
      }

      const result = await adminService.bulkUpdateUsers(userIds, updateData, adminId);
      return responseUtils.success(
        res,
        result,
        `Cập nhật ${result.modifiedCount} người dùng thành công`
      );
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== USER DETAILS (Orders, Products, Bank) ==========
  async getUserOrders(req, res) {
    try {
      const { userId } = req.params;
      const orders = await adminService.getUserOrders(userId);
      return responseUtils.success(res, orders, 'Lấy đơn hàng của người dùng thành công');
    } catch (error) {
      if (error.message === 'ID người dùng không hợp lệ') {
        return responseUtils.error(res, error.message, 400);
      } else if (error.message === 'Không tìm thấy người dùng') {
        return responseUtils.error(res, error.message, 404);
      }
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getUserProducts(req, res) {
    try {
      const { userId } = req.params;
      const products = await adminService.getUserProducts(userId);
      return responseUtils.success(res, products, 'Lấy sản phẩm của người dùng thành công');
    } catch (error) {
      if (error.message === 'ID người dùng không hợp lệ') {
        return responseUtils.error(res, error.message, 400);
      } else if (error.message === 'Không tìm thấy người dùng') {
        return responseUtils.error(res, error.message, 404);
      }
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getUserBankAccount(req, res) {
    try {
      const { userId } = req.params;
      const bankAccount = await adminService.getUserBankAccount(userId);
      return responseUtils.success(
        res,
        bankAccount,
        'Lấy thông tin ngân hàng của người dùng thành công'
      );
    } catch (error) {
      if (error.message === 'ID người dùng không hợp lệ') {
        return responseUtils.error(res, error.message, 400);
      } else if (error.message === 'Không tìm thấy người dùng') {
        return responseUtils.error(res, error.message, 404);
      }
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== PRODUCT MANAGEMENT ==========
  async getAllProducts(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        search,
        category,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const filters = {
        page,
        limit,
        status,
        search,
        category,
        sortBy,
        sortOrder
      };

      console.log('Admin getAllProducts - filters:', filters);

      const result = await adminService.getAllProducts(filters);
      console.log('Admin getAllProducts - result pagination:', result.pagination);

      return responseUtils.success(res, result, 'Lấy danh sách sản phẩm thành công');
    } catch (error) {
      console.error('Admin getAllProducts - error:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getProductById(req, res) {
    console.log('=== Admin Controller getProductById ===');
    console.log('Request params:', req.params);
    console.log('Request URL:', req.originalUrl);
    console.log('Request method:', req.method);

    try {
      const { productId } = req.params;
      console.log('Extracted productId from params:', productId);
      console.log('ProductId type:', typeof productId);
      console.log('ProductId length:', productId?.length);

      const product = await adminService.getProductById(productId);
      console.log('Service returned product successfully');
      console.log('Product title:', product?.title);

      return responseUtils.success(res, product, 'Lấy thông tin sản phẩm thành công');
    } catch (error) {
      console.error('=== Admin Controller getProductById ERROR ===');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('===========================================');

      // Handle specific errors with appropriate status codes
      if (error.message === 'ID sản phẩm không hợp lệ') {
        return responseUtils.error(res, error.message, 400);
      } else if (error.message === 'Không tìm thấy sản phẩm') {
        return responseUtils.error(res, error.message, 404);
      } else {
        return responseUtils.error(res, error.message, 500);
      }
    }
  }

  async updateProductStatus(req, res) {
    console.log('=== Admin Controller updateProductStatus ===');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);

    try {
      const { productId } = req.params;
      const { status } = req.body;
      const adminId = req.user.id;

      console.log('Updating product status:', { productId, status, adminId });

      const product = await adminService.updateProductStatus(productId, status, adminId);
      console.log('Product status updated successfully');

      return responseUtils.success(res, product, `Cập nhật trạng thái sản phẩm thành công`);
    } catch (error) {
      console.error('=== Admin Controller updateProductStatus ERROR ===');
      console.error('Error message:', error.message);
      console.error('===============================================');

      if (error.message === 'ID sản phẩm không hợp lệ') {
        return responseUtils.error(res, error.message, 400);
      } else if (error.message === 'Không tìm thấy sản phẩm') {
        return responseUtils.error(res, error.message, 404);
      } else if (error.message.includes('Trạng thái không hợp lệ')) {
        return responseUtils.error(res, error.message, 400);
      } else {
        return responseUtils.error(res, error.message, 500);
      }
    }
  }

  // async approveProduct(req, res) {
  //   try {
  //     const { productId } = req.params;
  //     const adminId = req.user.id;

  //     const product = await adminService.approveProduct(productId, adminId);
  //     return responseUtils.success(res, product, 'Phê duyệt sản phẩm thành công');
  //   } catch (error) {
  //     return responseUtils.error(res, error.message, 500);
  //   }
  // }

  // async rejectProduct(req, res) {
  //   try {
  //     const { productId } = req.params;
  //     const { reason } = req.body;
  //     const adminId = req.user.id;

  //     const product = await adminService.rejectProduct(productId, reason, adminId);
  //     return responseUtils.success(res, product, 'Từ chối sản phẩm thành công');
  //   } catch (error) {
  //     return responseUtils.error(res, error.message, 500);
  //   }
  // }

  // ========== ORDER MANAGEMENT ==========
  async getAllOrders(req, res) {
    try {
      const { page = 1, limit = 10, status, search } = req.query;
      const filters = { page, limit, status, search };

      const result = await adminService.getAllOrders(filters);
      return responseUtils.success(res, result, 'Lấy danh sách đơn hàng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getOrderById(req, res) {
    try {
      const { orderId } = req.params;
      const order = await adminService.getOrderById(orderId);
      return responseUtils.success(res, order, 'Lấy thông tin đơn hàng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async updateOrderStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { status } = req.body;

      if (!status) {
        return responseUtils.error(res, 'Trạng thái đơn hàng là bắt buộc', 400);
      }

      const result = await adminService.updateOrderStatus(orderId, status);
      return responseUtils.success(res, result, 'Cập nhật trạng thái đơn hàng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== SYSTEM SETTINGS ==========
  async getSystemSettings(req, res) {
    try {
      const settings = await adminService.getSystemSettings();
      return responseUtils.success(res, settings, 'Lấy cài đặt hệ thống thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async updateSystemSettings(req, res) {
    try {
      const settingsData = req.body;
      const adminId = req.user.id;

      const settings = await adminService.updateSystemSettings(settingsData, adminId);
      return responseUtils.success(res, settings, 'Cập nhật cài đặt hệ thống thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // // ========== CATEGORY MANAGEMENT ==========
  // async getAllCategories(req, res) {
  //   try {
  //     const categories = await adminService.getAllCategories();
  //     return responseUtils.success(res, categories, 'Lấy danh sách danh mục thành công');
  //   } catch (error) {
  //     return responseUtils.error(res, error.message, 500);
  //   }
  // }

  // async createCategory(req, res) {
  //   try {
  //     const categoryData = req.body;
  //     const adminId = req.user.id;

  //     const category = await adminService.createCategory(categoryData, adminId);
  //     return responseUtils.success(res, category, 'Tạo danh mục thành công');
  //   } catch (error) {
  //     return responseUtils.error(res, error.message, 500);
  //   }
  // }

  // async updateCategory(req, res) {
  //   try {
  //     const { categoryId } = req.params;
  //     const updateData = req.body;
  //     const adminId = req.user.id;

  //     const category = await adminService.updateCategory(categoryId, updateData, adminId);
  //     return responseUtils.success(res, category, 'Cập nhật danh mục thành công');
  //   } catch (error) {
  //     return responseUtils.error(res, error.message, 500);
  //   }
  // }

  // async deleteCategory(req, res) {
  //   try {
  //     const { categoryId } = req.params;
  //     const adminId = req.user.id;

  //     await adminService.deleteCategory(categoryId, adminId);
  //     return responseUtils.success(res, null, 'Xóa danh mục thành công');
  //   } catch (error) {
  //     return responseUtils.error(res, error.message, 500);
  //   }
  // }

  // ========== SYSTEM SETTINGS ==========
  async getSystemSettings(req, res) {
    try {
      const settings = await adminService.getSystemSettings();
      return responseUtils.success(res, settings, 'Lấy cài đặt hệ thống thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async updateSystemSettings(req, res) {
    try {
      const settingsData = req.body;
      const adminId = req.user.id;

      const settings = await adminService.updateSystemSettings(settingsData, adminId);
      return responseUtils.success(res, settings, 'Cập nhật cài đặt hệ thống thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== REPORT MANAGEMENT ==========
  async getAllReports(req, res) {
    try {
      const { page = 1, limit = 10, search, reportType, status } = req.query;
      const filters = { page, limit, search, reportType, status };

      const result = await adminService.getAllReports(filters);
      return responseUtils.success(res, result, 'Lấy danh sách báo cáo thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getReportById(req, res) {
    try {
      const { reportId } = req.params;
      const report = await adminService.getReportById(reportId);

      if (!report) {
        return responseUtils.error(res, 'Không tìm thấy báo cáo', 404);
      }

      return responseUtils.success(res, report, 'Lấy chi tiết báo cáo thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async updateReportStatus(req, res) {
    try {
      const { reportId } = req.params;
      const { status, adminNotes } = req.body;

      const updatedReport = await adminService.updateReportStatus(reportId, status, adminNotes);
      return responseUtils.success(res, updatedReport, 'Cập nhật trạng thái báo cáo thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async suspendReportedProduct(req, res) {
    console.log('=== Admin Controller suspendReportedProduct ===');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);

    try {
      const { reportId } = req.params;
      const { productId } = req.body;
      const adminId = req.user.id;

      console.log('Suspending reported product:', { reportId, productId, adminId });

      // Suspend the product
      await adminService.suspendProduct(
        productId,
        adminId,
        'Sản phẩm bị đình chỉ do vi phạm quy định'
      );

      // Update report status to RESOLVED
      await adminService.updateReportStatus(
        reportId,
        'RESOLVED',
        'Sản phẩm đã bị đình chỉ bởi admin'
      );

      console.log('Product suspended and report updated successfully');

      return responseUtils.success(res, null, 'Đình chỉ sản phẩm bị báo cáo thành công');
    } catch (error) {
      console.error('=== Admin Controller suspendReportedProduct ERROR ===');
      console.error('Error message:', error.message);
      console.error('=========================================');

      if (error.message === 'ID sản phẩm không hợp lệ') {
        return responseUtils.error(res, error.message, 400);
      } else if (error.message === 'Không tìm thấy sản phẩm') {
        return responseUtils.error(res, error.message, 404);
      } else {
        return responseUtils.error(res, error.message, 500);
      }
    }
  }

  // ========== BANK ACCOUNT VERIFICATION ==========
  async getAllBankAccounts(req, res) {
    try {
      const { page = 1, limit = 10, search, status, bankCode } = req.query;
      const filters = { page, limit, search, status, bankCode };

      const result = await adminService.getAllBankAccounts(filters);
      return responseUtils.success(res, result, 'Lấy danh sách tài khoản ngân hàng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getBankAccountById(req, res) {
    try {
      const { userId } = req.params;
      const bankAccount = await adminService.getBankAccountById(userId);

      if (!bankAccount) {
        return responseUtils.error(res, 'Không tìm thấy tài khoản ngân hàng', 404);
      }

      return responseUtils.success(res, bankAccount, 'Lấy chi tiết tài khoản ngân hàng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async verifyBankAccount(req, res) {
    try {
      const { userId } = req.params;
      const { adminNote } = req.body;

      console.log('Verifying bank account:', { userId, adminNote });

      const updatedUser = await adminService.verifyBankAccount(userId, adminNote);
      return responseUtils.success(res, updatedUser, 'Xác minh tài khoản ngân hàng thành công');
    } catch (error) {
      console.error('Error in verifyBankAccount controller:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  async rejectBankAccount(req, res) {
    try {
      const { userId } = req.params;
      const { rejectionReason } = req.body;

      if (!rejectionReason) {
        return responseUtils.error(res, 'Vui lòng nhập lý do từ chối', 400);
      }

      const updatedUser = await adminService.rejectBankAccount(userId, rejectionReason);
      return responseUtils.success(
        res,
        updatedUser,
        'Từ chối xác minh tài khoản ngân hàng thành công'
      );
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async updateBankAccountStatus(req, res) {
    try {
      const { userId } = req.params;
      const { status, note } = req.body;

      if (!status) {
        return responseUtils.error(res, 'Vui lòng nhập trạng thái', 400);
      }

      const updatedUser = await adminService.updateBankAccountStatus(userId, status, note);
      return responseUtils.success(
        res,
        updatedUser,
        'Cập nhật trạng thái tài khoản ngân hàng thành công'
      );
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== TRANSACTION MANAGEMENT ==========
  async getAllTransactions(req, res) {
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
      } = req.query;

      const filters = {
        page,
        limit,
        search,
        type,
        status,
        startDate,
        endDate,
        minAmount,
        maxAmount,
        sortBy,
        sortOrder
      };

      const result = await adminService.getAllTransactions(filters);
      return responseUtils.success(res, result, 'Lấy danh sách giao dịch thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getTransactionById(req, res) {
    try {
      const { transactionId } = req.params;
      const transaction = await adminService.getTransactionById(transactionId);

      if (!transaction) {
        return responseUtils.error(res, 'Không tìm thấy giao dịch', 404);
      }

      return responseUtils.success(res, transaction, 'Lấy thông tin giao dịch thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getTransactionStats(req, res) {
    try {
      const { startDate, endDate, period = 'day' } = req.query;
      const stats = await adminService.getTransactionStats({ startDate, endDate, period });
      return responseUtils.success(res, stats, 'Lấy thống kê giao dịch thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async exportTransactions(req, res) {
    try {
      const { type, status, startDate, endDate, format = 'csv' } = req.query;

      const filters = { type, status, startDate, endDate };
      const exportData = await adminService.exportTransactions(filters, format);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
      } else {
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', 'attachment; filename=transactions.xlsx');
      }

      return res.send(exportData);
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== WITHDRAWAL FINANCIAL ANALYSIS ==========

  /**
   * Get detailed financial analysis for a withdrawal request
   * GET /api/admin/withdrawals/:withdrawalId/financial-analysis
   */
  async getWithdrawalFinancialAnalysis(req, res) {
    try {
      const { withdrawalId } = req.params;

      if (!withdrawalId) {
        return responseUtils.error(res, 'Withdrawal ID is required', 400);
      }

      const analysis = await adminService.getWithdrawalFinancialAnalysis(withdrawalId);
      return responseUtils.success(res, analysis, 'Financial analysis retrieved successfully');
    } catch (error) {
      if (error.message.includes('not found')) {
        return responseUtils.error(res, error.message, 404);
      }
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * Get user's comprehensive financial profile
   * GET /api/admin/users/:userId/financial-profile
   */
  async getUserFinancialProfile(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return responseUtils.error(res, 'User ID is required', 400);
      }

      // Get user basic info
      const user = await adminService.getUserById(userId);

      // Get comprehensive financial data
      const walletAnalysis = await adminService.getUserWalletAnalysis(userId);
      const transactionAnalysis = await adminService.getUserTransactionAnalysis(userId);
      const withdrawalHistory = await adminService.getUserWithdrawalHistory(userId);
      const systemInteractions = await adminService.getUserSystemWalletInteractions(userId);
      const payosVerificationCodes = await adminService.getPayOSVerificationCodes(userId);
      const activityTimeline = await adminService.getUserActivityTimeline(userId);

      const financialProfile = {
        user,
        walletAnalysis,
        transactionAnalysis,
        withdrawalHistory,
        systemInteractions,
        payosVerificationCodes,
        activityTimeline,
        generatedAt: new Date()
      };

      return responseUtils.success(
        res,
        financialProfile,
        'User financial profile retrieved successfully'
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        return responseUtils.error(res, error.message, 404);
      }
      return responseUtils.error(res, error.message, 500);
    }
  }

  /**
   * Get withdrawal requests with enhanced data for admin review
   * GET /api/admin/withdrawals/enhanced
   */
  async getEnhancedWithdrawalRequests(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        userId,
        riskLevel,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Get basic withdrawal data
      const withdrawalService = require('../services/withdrawal.service');
      const withdrawalData = await withdrawalService.getAllWithdrawals({
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        userId
      });

      // Enhance each withdrawal with risk analysis
      const enhancedWithdrawals = await Promise.all(
        withdrawalData.withdrawals.map(async (withdrawal) => {
          try {
            const riskAssessment = await adminService.calculateWithdrawalRiskScore(
              withdrawal.user._id,
              withdrawal.amount
            );

            return {
              ...withdrawal,
              riskAssessment,
              formattedAmount: withdrawal.amount.toLocaleString('vi-VN') + ' VND',
              accountAge: adminService.calculateAccountAge(withdrawal.user.createdAt || new Date()),
              recommendation: adminService.getWithdrawalRecommendation(riskAssessment)
            };
          } catch (error) {
            console.error(`Error enhancing withdrawal ${withdrawal._id}:`, error);
            return {
              ...withdrawal,
              riskAssessment: { level: 'UNKNOWN', score: 0, factors: [] },
              formattedAmount: withdrawal.amount.toLocaleString('vi-VN') + ' VND',
              accountAge: 'Unknown',
              recommendation: { action: 'MANUAL_REVIEW', confidence: 'LOW' }
            };
          }
        })
      );

      // Filter by risk level if specified
      const filteredWithdrawals = riskLevel
        ? enhancedWithdrawals.filter((w) => w.riskAssessment.level === riskLevel.toUpperCase())
        : enhancedWithdrawals;

      // Sort if needed
      if (sortBy === 'riskScore') {
        filteredWithdrawals.sort((a, b) => {
          const order = sortOrder === 'desc' ? -1 : 1;
          return order * (a.riskAssessment.score - b.riskAssessment.score);
        });
      }

      const result = {
        withdrawals: filteredWithdrawals,
        pagination: withdrawalData.pagination,
        summary: {
          total: filteredWithdrawals.length,
          byRisk: {
            low: filteredWithdrawals.filter((w) => w.riskAssessment.level === 'LOW').length,
            medium: filteredWithdrawals.filter((w) => w.riskAssessment.level === 'MEDIUM').length,
            high: filteredWithdrawals.filter((w) => w.riskAssessment.level === 'HIGH').length,
            veryHigh: filteredWithdrawals.filter((w) => w.riskAssessment.level === 'VERY_HIGH')
              .length
          },
          byStatus: {
            pending: filteredWithdrawals.filter((w) => w.status === 'pending').length,
            processing: filteredWithdrawals.filter((w) => w.status === 'processing').length,
            completed: filteredWithdrawals.filter((w) => w.status === 'completed').length,
            rejected: filteredWithdrawals.filter((w) => w.status === 'rejected').length
          }
        }
      };

      return responseUtils.success(
        res,
        result,
        'Enhanced withdrawal requests retrieved successfully'
      );
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== SHIPMENT MANAGEMENT ==========
  async getShipmentStats(req, res) {
    try {
      const stats = await adminService.getShipmentStats();
      return responseUtils.success(res, stats, 'Lấy thống kê vận chuyển thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getAllShippers(req, res) {
    try {
      const { page = 1, limit = 100, search, district } = req.query;
      const filters = { page, limit, search, district };
      
      const result = await adminService.getAllShippers(filters);
      return responseUtils.success(res, result, 'Lấy danh sách shipper thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async getShipperById(req, res) {
    try {
      const { shipperId } = req.params;
      const shipperDetails = await adminService.getShipperById(shipperId);
      return responseUtils.success(res, shipperDetails, 'Lấy thông tin shipper thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }
}

module.exports = new AdminController();
