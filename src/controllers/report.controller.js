const mongoose = require('mongoose');
const Report = require('../models/Report');
const Product = require('../models/Product');
const responseUtils = require('../utils/response');

class ReportController {
  // Create a new report
  async createReport(req, res) {
    try {
      const { reportType, reason, description, reportedItem } = req.body;
      const reporter = req.user.id;

      // Validate required fields
      if (!reportType || !reportedItem) {
        return responseUtils.error(res, 'Loại báo cáo và sản phẩm bị báo cáo là bắt buộc', 400);
      }

      // Check if product exists
      const product = await Product.findById(reportedItem);
      if (!product) {
        return responseUtils.error(res, 'Sản phẩm không tồn tại', 404);
      }

      // Check if user is trying to report their own product
      if (product.owner.toString() === reporter) {
        return responseUtils.error(res, 'Bạn không thể báo cáo sản phẩm của chính mình', 400);
      }

      // Check if user already reported this product
      const existingReport = await Report.findOne({
        reporter,
        reportedItem,
        status: { $in: ['PENDING', 'REVIEWED'] }
      });

      if (existingReport) {
        return responseUtils.error(res, 'Bạn đã báo cáo sản phẩm này trước đó', 400);
      }

      // Create report
      const report = await Report.create({
        reporter,
        reportType,
        reason,
        description,
        reportedItem,
        status: 'PENDING'
      });

      await report.populate('reporter', 'email profile');
      await report.populate('reportedItem', 'title images');

      return responseUtils.success(res, report, 'Báo cáo đã được gửi thành công', 201);
    } catch (error) {
      console.error('Error creating report:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  // Get user's own reports
  async getUserReports(req, res) {
    try {
      const reporter = req.user.id;
      const { page = 1, limit = 10, status } = req.query;

      const query = { reporter };
      if (status) {
        query.status = status;
      }

      const skip = (page - 1) * limit;

      const reports = await Report.find(query)
        .populate('reportedItem', 'title images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Report.countDocuments(query);

      return responseUtils.success(res, {
        reports,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }, 'Lấy danh sách báo cáo thành công');
    } catch (error) {
      console.error('Error fetching user reports:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  // Get report by ID (only if user is the reporter)
  async getReportById(req, res) {
    try {
      const { reportId } = req.params;
      const reporter = req.user.id;

      const report = await Report.findOne({
        _id: reportId,
        reporter
      })
        .populate('reporter', 'email profile')
        .populate('reportedItem', 'title images description');

      if (!report) {
        return responseUtils.error(res, 'Không tìm thấy báo cáo', 404);
      }

      return responseUtils.success(res, report, 'Lấy chi tiết báo cáo thành công');
    } catch (error) {
      console.error('Error fetching report:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }

  // Get report statistics for user
  async getReportStats(req, res) {
    try {
      const reporter = req.user.id;

      const stats = await Report.aggregate([
        { $match: { reporter: mongoose.Types.ObjectId(reporter) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const formattedStats = {
        total: 0,
        pending: 0,
        reviewed: 0,
        resolved: 0,
        dismissed: 0
      };

      stats.forEach(stat => {
        formattedStats.total += stat.count;
        formattedStats[stat._id.toLowerCase()] = stat.count;
      });

      return responseUtils.success(res, formattedStats, 'Lấy thống kê báo cáo thành công');
    } catch (error) {
      console.error('Error fetching report stats:', error);
      return responseUtils.error(res, error.message, 500);
    }
  }
}

module.exports = new ReportController();
