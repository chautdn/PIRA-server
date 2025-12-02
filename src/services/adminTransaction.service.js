const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');

class AdminTransactionService {
  /**
   * Get all transactions with filters and pagination
   */
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

  /**
   * Get transaction by ID with detailed user statistics
   */
  async getTransactionById(transactionId) {
    try {
      const transaction = await Transaction.findById(transactionId)
        .populate({
          path: 'user', 
          select: 'email profile.firstName profile.lastName profile.phone profile.dateOfBirth role status createdAt bankAccount kycStatus',
          populate: {
            path: 'bankAccount',
            select: 'accountNumber bankName accountHolder verificationStatus'
          }
        })
        .populate('wallet', 'balance user')
        .lean();

      if (!transaction) {
        throw new Error('Không tìm thấy giao dịch');
      }

      // Get additional user statistics if user exists
      if (transaction.user) {
        const userId = transaction.user._id;
        
        // Get user's transaction history summary
        const [transactionStats, walletInfo, recentTransactions] = await Promise.all([
          Transaction.aggregate([
            { $match: { user: userId } },
            {
              $group: {
                _id: null,
                totalTransactions: { $sum: 1 },
                totalAmount: { $sum: '$amount' },
                successfulTransactions: {
                  $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
                },
                failedTransactions: {
                  $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                },
                averageAmount: { $avg: '$amount' },
                firstTransaction: { $min: '$createdAt' },
                lastTransaction: { $max: '$createdAt' }
              }
            }
          ]),
          
          Wallet.findOne({ user: userId }).select('balance createdAt updatedAt').lean(),
          
          Transaction.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('type amount status createdAt description')
            .lean()
        ]);

        // Add user statistics to transaction
        transaction.userStats = {
          transactionHistory: transactionStats[0] || {
            totalTransactions: 0,
            totalAmount: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            averageAmount: 0,
            firstTransaction: null,
            lastTransaction: null
          },
          wallet: walletInfo,
          recentTransactions: recentTransactions || []
        };
      }

      return transaction;
    } catch (error) {
      throw new Error(`Lỗi khi lấy thông tin giao dịch: ${error.message}`);
    }
  }

  /**
   * Get transaction statistics with time series data
   */
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

  /**
   * Export transactions to CSV or JSON format
   */
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

module.exports = new AdminTransactionService();
