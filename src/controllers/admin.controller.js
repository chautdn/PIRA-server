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

  async updateUserCreditScore(req, res) {
    try {
      const { userId } = req.params;
      const { creditScore } = req.body;
      const adminId = req.user.id;

      if (creditScore === undefined || creditScore === null) {
        return responseUtils.error(res, 'Vui lòng cung cấp điểm tín dụng', 400);
      }

      const user = await adminService.updateUserCreditScore(userId, creditScore, adminId);
      return responseUtils.success(res, user, 'Cập nhật điểm tín dụng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async deleteUser(req, res) {
    try {
      const { userId } = req.params;
      const adminId = req.user.id;

      await adminService.deleteUser(userId, adminId);
      return responseUtils.success(res, null, 'Xóa người dùng thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

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
      return responseUtils.success(res, result, `Cập nhật ${result.modifiedCount} người dùng thành công`);
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== PRODUCT MANAGEMENT ==========
  async getAllProducts(req, res) {
    try {
      const { page = 1, limit = 10, status, search, category } = req.query;
      const filters = { page, limit, status, search, category };
      
      const result = await adminService.getAllProducts(filters);
      return responseUtils.success(res, result, 'Lấy danh sách sản phẩm thành công');
    } catch (error) {
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

  async deleteProduct(req, res) {
    console.log('=== Admin Controller deleteProduct ===');
    console.log('Request params:', req.params);
    
    try {
      const { productId } = req.params;
      const adminId = req.user.id;
      
      console.log('Deleting product:', { productId, adminId });
      
      await adminService.deleteProduct(productId, adminId);
      console.log('Product deleted successfully');
      
      return responseUtils.success(res, null, 'Xóa sản phẩm thành công');
    } catch (error) {
      console.error('=== Admin Controller deleteProduct ERROR ===');
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

  async approveProduct(req, res) {
    try {
      const { productId } = req.params;
      const adminId = req.user.id;

      const product = await adminService.approveProduct(productId, adminId);
      return responseUtils.success(res, product, 'Phê duyệt sản phẩm thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async rejectProduct(req, res) {
    try {
      const { productId } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;

      const product = await adminService.rejectProduct(productId, reason, adminId);
      return responseUtils.success(res, product, 'Từ chối sản phẩm thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== CATEGORY MANAGEMENT ==========
  async getAllCategories(req, res) {
    try {
      const categories = await adminService.getAllCategories();
      return responseUtils.success(res, categories, 'Lấy danh sách danh mục thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async createCategory(req, res) {
    try {
      const categoryData = req.body;
      const adminId = req.user.id;

      const category = await adminService.createCategory(categoryData, adminId);
      return responseUtils.success(res, category, 'Tạo danh mục thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async updateCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const updateData = req.body;
      const adminId = req.user.id;

      const category = await adminService.updateCategory(categoryId, updateData, adminId);
      return responseUtils.success(res, category, 'Cập nhật danh mục thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async deleteCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const adminId = req.user.id;

      await adminService.deleteCategory(categoryId, adminId);
      return responseUtils.success(res, null, 'Xóa danh mục thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

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

  // ========== CATEGORY MANAGEMENT ==========
  async getAllCategories(req, res) {
    try {
      const categories = await adminService.getAllCategories();
      return responseUtils.success(res, categories, 'Lấy danh sách danh mục thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async createCategory(req, res) {
    try {
      const categoryData = req.body;
      const adminId = req.user.id;

      const category = await adminService.createCategory(categoryData, adminId);
      return responseUtils.success(res, category, 'Tạo danh mục thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async updateCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const updateData = req.body;
      const adminId = req.user.id;

      const category = await adminService.updateCategory(categoryId, updateData, adminId);
      return responseUtils.success(res, category, 'Cập nhật danh mục thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  async deleteCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const adminId = req.user.id;

      await adminService.deleteCategory(categoryId, adminId);
      return responseUtils.success(res, null, 'Xóa danh mục thành công');
    } catch (error) {
      return responseUtils.error(res, error.message, 500);
    }
  }

  // ========== REPORT MANAGEMENT ==========
  async getAllReports(req, res) {
    try {
      const { page = 1, limit = 10, type, status } = req.query;
      const filters = { page, limit, type, status };
      
      const result = await adminService.getAllReports(filters);
      return responseUtils.success(res, result, 'Lấy danh sách báo cáo thành công');
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
}

module.exports = new AdminController();