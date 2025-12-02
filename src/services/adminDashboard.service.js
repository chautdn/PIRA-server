const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Transaction = require('../models/Transaction');
const SystemWallet = require('../models/SystemWallet');

class AdminDashboardService {
  /**
   * Get dashboard statistics
   */
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

  /**
   * Get monthly user statistics
   */
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

  /**
   * Get monthly revenue from SubOrder and Transaction
   */
  async getMonthlyRevenue() {
    // Set default date range: last 6 months
    const defaultStartDate = new Date();
    defaultStartDate.setMonth(defaultStartDate.getMonth() - 6);
    
    const start = defaultStartDate;
    const end = new Date();

    // 1. Doanh thu từ SubOrder đã hoàn thành
    const subOrderRevenue = await SubOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          subOrderRevenue: { $sum: '$pricing.totalAmount' },
          orderCount: { $sum: 1 }
        }
      }
    ]);
    console.log('SubOrder Revenue:', subOrderRevenue);

    // 2. Doanh thu từ Transaction vào System Wallet
    const transactionRevenue = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: 'success',
          $or: [
            { toSystemWallet: true, systemWalletAction: 'revenue' },
            { type: 'PROMOTION_REVENUE' },
            { systemWalletAction: 'fee_collection' },
            { systemWalletAction: 'penalty' }
          ]
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          transactionRevenue: { $sum: '$amount' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);
    console.log('Transaction Revenue:', transactionRevenue);

    // 3. Lấy System Wallet balance hiện tại
    const systemWallet = await SystemWallet.findOne();
    const currentSystemBalance = systemWallet && systemWallet.balance ? 
      (typeof systemWallet.balance === 'object' ? systemWallet.balance.available || 0 : systemWallet.balance) : 0;
    
    console.log('System Wallet:', systemWallet);
    console.log('Current System Balance:', currentSystemBalance);

    // 4. Merge dữ liệu từ cả SubOrder và Transaction theo tháng
    const revenueMap = new Map();

    // Add SubOrder revenue
    subOrderRevenue.forEach(item => {
      const key = `${item._id.year}-${item._id.month}`;
      revenueMap.set(key, {
        _id: item._id,
        subOrderRevenue: item.subOrderRevenue || 0,
        orderCount: item.orderCount || 0,
        transactionRevenue: 0,
        transactionCount: 0,
        revenue: item.subOrderRevenue || 0
      });
    });

    // Add Transaction revenue
    transactionRevenue.forEach(item => {
      const key = `${item._id.year}-${item._id.month}`;
      if (revenueMap.has(key)) {
        const existing = revenueMap.get(key);
        existing.transactionRevenue = item.transactionRevenue || 0;
        existing.transactionCount = item.transactionCount || 0;
        existing.revenue += item.transactionRevenue || 0;
      } else {
        revenueMap.set(key, {
          _id: item._id,
          subOrderRevenue: 0,
          orderCount: 0,
          transactionRevenue: item.transactionRevenue || 0,
          transactionCount: item.transactionCount || 0,
          revenue: item.transactionRevenue || 0
        });
      }
    });

    // Convert map to array and sort
    const result = Array.from(revenueMap.values()).sort((a, b) => {
      if (a._id.year !== b._id.year) return a._id.year - b._id.year;
      return a._id.month - b._id.month;
    });

    // 5. Calculate System Wallet balance for each period
    if (result.length > 0) {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1;

      console.log('Calculating system balance for', result.length, 'periods');
      console.log('Current system balance:', currentSystemBalance);

      // Calculate balance for each period
      for (let i = 0; i < result.length; i++) {
        const period = result[i];
        const periodYear = period._id.year;
        const periodMonth = period._id.month;
        
        // If this is the current month, use current balance
        if (periodYear === currentYear && periodMonth === currentMonth) {
          period.systemBalance = currentSystemBalance;
          console.log(`Period ${periodYear}-${periodMonth}: Current month, balance = ${currentSystemBalance}`);
        } else {
          // Calculate balance at end of this period by getting all transactions up to that date
          const periodEndDate = new Date(periodYear, periodMonth, 0); // Last day of the month
          
          const balanceAtPeriod = await Transaction.aggregate([
            {
              $match: {
                createdAt: { $lte: periodEndDate },
                status: 'success',
                $or: [
                  { toSystemWallet: true },
                  { fromSystemWallet: true }
                ]
              }
            },
            {
              $group: {
                _id: null,
                totalIn: {
                  $sum: {
                    $cond: [{ $eq: ['$toSystemWallet', true] }, '$amount', 0]
                  }
                },
                totalOut: {
                  $sum: {
                    $cond: [{ $eq: ['$fromSystemWallet', true] }, '$amount', 0]
                  }
                }
              }
            }
          ]);

          if (balanceAtPeriod.length > 0) {
            period.systemBalance = balanceAtPeriod[0].totalIn - balanceAtPeriod[0].totalOut;
            console.log(`Period ${periodYear}-${periodMonth}: Historical balance = ${period.systemBalance} (in: ${balanceAtPeriod[0].totalIn}, out: ${balanceAtPeriod[0].totalOut})`);
          } else {
            period.systemBalance = 0;
            console.log(`Period ${periodYear}-${periodMonth}: No transactions, balance = 0`);
          }
        }
      }
    }

    console.log('Final result with system balance:', JSON.stringify(result, null, 2));
    return result;
  }
}

module.exports = new AdminDashboardService();
