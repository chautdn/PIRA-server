const Product = require('../models/Product');
const SubOrder = require('../models/SubOrder');
const MasterOrder = require('../models/MasterOrder');
const mongoose = require('mongoose');

const ownerStatisticsService = {
  /**
   * Lấy thống kê tổng quan của owner
   * @param {String} ownerId - ID của owner
   * @returns {Object} - Thống kê tổng quan
   */
  getOwnerOverviewStatistics: async (ownerId) => {
    try {
      // Thống kê sản phẩm
      const totalProducts = await Product.countDocuments({ owner: ownerId });
      const activeProducts = await Product.countDocuments({
        owner: ownerId,
        status: 'AVAILABLE'
      });
      const rentedProducts = await Product.countDocuments({
        owner: ownerId,
        status: 'RENTED'
      });
      const unavailableProducts = await Product.countDocuments({
        owner: ownerId,
        status: 'UNAVAILABLE'
      });

      // Thống kê đơn hàng
      const totalOrders = await SubOrder.countDocuments({ owner: ownerId });
      const pendingOrders = await SubOrder.countDocuments({
        owner: ownerId,
        status: 'PENDING_CONFIRMATION'
      });
      const confirmedOrders = await SubOrder.countDocuments({
        owner: ownerId,
        status: { $in: ['OWNER_CONFIRMED', 'PARTIALLY_CONFIRMED'] }
      });
      const completedOrders = await SubOrder.countDocuments({
        owner: ownerId,
        status: 'COMPLETED'
      });
      const cancelledOrders = await SubOrder.countDocuments({
        owner: ownerId,
        status: 'CANCELLED'
      });

      // Thống kê doanh thu và chi phí
      const revenueStats = await SubOrder.aggregate([
        {
          $match: {
            owner: new mongoose.Types.ObjectId(ownerId),
            status: {
              $in: [
                'OWNER_CONFIRMED',
                'PARTIALLY_CONFIRMED',
                'READY_FOR_CONTRACT',
                'CONTRACT_SIGNED',
                'COMPLETED'
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.subtotalRental' },
            totalDeposit: { $sum: '$pricing.subtotalDeposit' },
            totalShippingFee: { $sum: '$pricing.shippingFee' },
            totalAmount: { $sum: '$pricing.totalAmount' }
          }
        }
      ]);

      const revenue =
        revenueStats.length > 0
          ? revenueStats[0]
          : {
              totalRevenue: 0,
              totalDeposit: 0,
              totalShippingFee: 0,
              totalAmount: 0
            };

      // Lấy phí quảng cáo của owner
      const ProductPromotion = require('../models/ProductPromotion');
      const promotionFees = await ProductPromotion.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(ownerId),
            paymentStatus: 'paid'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' }
          }
        }
      ]);

      const totalPromotionFees = promotionFees.length > 0 ? promotionFees[0].total : 0;

      // Công thức:
      // - Doanh thu = 100% giá trị đơn thuê
      // - Tiền nhận về = 90% (sau khi trừ 10% phí nền tảng)
      // - Chi phí = 10% phí nền tảng + Phí quảng cáo
      // - Lợi nhuận = Tiền nhận về (90%) - Phí quảng cáo
      const totalRevenue = revenue.totalRevenue || 0; // 100% doanh thu
      const receivedAmount = totalRevenue * 0.9; // 90% tiền nhận về
      const platformFee = totalRevenue * 0.1; // 10% phí nền tảng
      const totalCosts = platformFee + totalPromotionFees; // Tổng chi phí
      const profit = receivedAmount - totalPromotionFees; // Lợi nhuận

      return {
        products: {
          total: totalProducts,
          active: activeProducts,
          rented: rentedProducts,
          unavailable: unavailableProducts
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          confirmed: confirmedOrders,
          completed: completedOrders,
          cancelled: cancelledOrders
        },
        revenue: {
          totalRevenue: totalRevenue, // 100% doanh thu
          receivedAmount: receivedAmount, // 90% tiền nhận về
          platformFee: platformFee, // 10% phí nền tảng
          promotionFees: totalPromotionFees, // Phí quảng cáo
          totalDeposit: revenue.totalDeposit || 0,
          totalShippingFee: revenue.totalShippingFee || 0,
          totalAmount: revenue.totalAmount || 0
        },
        profit: {
          revenue: totalRevenue, // Doanh thu (100%)
          receivedAmount: receivedAmount, // Tiền nhận về (90%)
          costs: totalCosts, // Chi phí (10% + quảng cáo)
          platformFee: platformFee, // 10% phí nền tảng
          promotionFees: totalPromotionFees, // Phí quảng cáo
          profit: profit, // Lợi nhuận
          profitMargin: totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(2) : 0
        }
      };
    } catch (error) {
      throw new Error(`Error getting owner overview statistics: ${error.message}`);
    }
  },

  /**
   * Lấy thống kê sản phẩm chi tiết
   * @param {String} ownerId - ID của owner
   * @param {Object} filters - Các bộ lọc (status, category, dateRange)
   * @returns {Object} - Danh sách sản phẩm và thống kê
   */
  getProductStatistics: async (ownerId, filters = {}) => {
    try {
      const {
        status,
        category,
        startDate,
        endDate,
        page = 1,
        limit = 10,
        sort = 'createdAt',
        order = 'desc'
      } = filters;

      // Build query
      const query = { owner: ownerId };

      if (status) {
        query.status = status;
      }

      if (category) {
        query.category = category;
      }

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Get products with pagination
      const skip = (page - 1) * limit;
      const sortOrder = order === 'desc' ? -1 : 1;

      const products = await Product.find(query)
        .populate('category', 'name')
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Product.countDocuments(query);

      // Thống kê cho từng sản phẩm
      const productStats = await Promise.all(
        products.map(async (product) => {
          // Đếm số lần được thuê
          const rentalCount = await SubOrder.countDocuments({
            'products.product': product._id,
            status: {
              $in: [
                'OWNER_CONFIRMED',
                'PARTIALLY_CONFIRMED',
                'READY_FOR_CONTRACT',
                'CONTRACT_SIGNED',
                'COMPLETED'
              ]
            }
          });

          // Tính tổng doanh thu từ sản phẩm này
          const revenueResult = await SubOrder.aggregate([
            {
              $match: {
                'products.product': new mongoose.Types.ObjectId(product._id),
                status: {
                  $in: [
                    'OWNER_CONFIRMED',
                    'PARTIALLY_CONFIRMED',
                    'READY_FOR_CONTRACT',
                    'CONTRACT_SIGNED',
                    'COMPLETED'
                  ]
                }
              }
            },
            { $unwind: '$products' },
            {
              $match: {
                'products.product': new mongoose.Types.ObjectId(product._id)
              }
            },
            {
              $group: {
                _id: null,
                totalRevenue: {
                  $sum: {
                    $add: ['$products.totalRental', '$products.totalDeposit']
                  }
                }
              }
            }
          ]);

          const revenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

          return {
            ...product,
            statistics: {
              rentalCount,
              totalRevenue: revenue
            }
          };
        })
      );

      return {
        products: productStats,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      throw new Error(`Error getting product statistics: ${error.message}`);
    }
  },

  /**
   * Lấy thống kê đơn hàng chi tiết
   * @param {String} ownerId - ID của owner
   * @param {Object} filters - Các bộ lọc
   * @returns {Object} - Danh sách đơn hàng và thống kê
   */
  getOrderStatistics: async (ownerId, filters = {}) => {
    try {
      const {
        status,
        startDate,
        endDate,
        page = 1,
        limit = 10,
        sort = 'createdAt',
        order = 'desc'
      } = filters;

      // Build query
      const query = { owner: ownerId };

      if (status) {
        query.status = status;
      }

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Get orders with pagination
      const skip = (page - 1) * limit;
      const sortOrder = order === 'desc' ? -1 : 1;

      const orders = await SubOrder.find(query)
        .populate('masterOrder', 'masterOrderNumber renter')
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'firstName lastName email phoneNumber'
          }
        })
        .populate('products.product', 'title images')
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await SubOrder.countDocuments(query);

      return {
        orders,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      throw new Error(`Error getting order statistics: ${error.message}`);
    }
  },

  /**
   * Lấy thống kê doanh thu theo thời gian
   * @param {String} ownerId - ID của owner
   * @param {Object} filters - Các bộ lọc (startDate, endDate, groupBy)
   * @returns {Object} - Thống kê doanh thu theo thời gian
   */
  getRevenueStatistics: async (ownerId, filters = {}) => {
    try {
      const { startDate, endDate, groupBy = 'month' } = filters;

      // Build match query
      const matchQuery = {
        owner: new mongoose.Types.ObjectId(ownerId),
        status: {
          $in: [
            'OWNER_CONFIRMED',
            'PARTIALLY_CONFIRMED',
            'READY_FOR_CONTRACT',
            'CONTRACT_SIGNED',
            'COMPLETED'
          ]
        }
      };

      if (startDate || endDate) {
        matchQuery.createdAt = {};
        if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
        if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
      }

      // Determine grouping format
      let dateFormat;
      switch (groupBy) {
        case 'day':
          dateFormat = '%Y-%m-%d';
          break;
        case 'week':
          dateFormat = '%Y-W%V';
          break;
        case 'month':
          dateFormat = '%Y-%m';
          break;
        case 'year':
          dateFormat = '%Y';
          break;
        default:
          dateFormat = '%Y-%m';
      }

      // Aggregate revenue by time period
      const revenueByPeriod = await SubOrder.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              $dateToString: { format: dateFormat, date: '$createdAt' }
            },
            totalRevenue: { $sum: '$pricing.subtotalRental' },
            totalDeposit: { $sum: '$pricing.subtotalDeposit' },
            totalShippingFee: { $sum: '$pricing.shippingFee' },
            totalAmount: { $sum: '$pricing.totalAmount' },
            orderCount: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            period: '$_id',
            totalRevenue: 1,
            totalDeposit: 1,
            totalShippingFee: 1,
            totalAmount: 1,
            netRevenue: { $add: ['$totalRevenue', '$totalDeposit'] },
            orderCount: 1
          }
        },
        { $sort: { period: 1 } }
      ]);

      // Thống kê tổng
      const totalStats = await SubOrder.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.subtotalRental' },
            totalDeposit: { $sum: '$pricing.subtotalDeposit' },
            totalShippingFee: { $sum: '$pricing.shippingFee' },
            totalAmount: { $sum: '$pricing.totalAmount' },
            totalOrders: { $sum: 1 }
          }
        }
      ]);

      const totals =
        totalStats.length > 0
          ? totalStats[0]
          : {
              totalRevenue: 0,
              totalDeposit: 0,
              totalShippingFee: 0,
              totalAmount: 0,
              totalOrders: 0
            };

      // Lấy phí quảng cáo trong khoảng thời gian
      const ProductPromotion = require('../models/ProductPromotion');
      const promotionQuery = {
        user: new mongoose.Types.ObjectId(ownerId),
        paymentStatus: 'paid'
      };
      if (startDate || endDate) {
        promotionQuery.createdAt = {};
        if (startDate) promotionQuery.createdAt.$gte = new Date(startDate);
        if (endDate) promotionQuery.createdAt.$lte = new Date(endDate);
      }

      const promotionFees = await ProductPromotion.aggregate([
        { $match: promotionQuery },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' }
          }
        }
      ]);

      const totalPromotionFees = promotionFees.length > 0 ? promotionFees[0].total : 0;

      // Công thức tính toán
      const totalRevenue = totals.totalRevenue || 0; // 100% doanh thu
      const receivedAmount = totalRevenue * 0.9; // 90% tiền nhận về
      const platformFee = totalRevenue * 0.1; // 10% phí nền tảng
      const totalCosts = platformFee + totalPromotionFees; // Tổng chi phí
      const profit = receivedAmount - totalPromotionFees; // Lợi nhuận

      // Calculate growth rate if comparing periods
      let growthRate = 0;
      if (startDate && endDate) {
        const dateRange = new Date(endDate) - new Date(startDate);
        const previousStart = new Date(new Date(startDate).getTime() - dateRange);
        const previousEnd = new Date(startDate);

        const previousStats = await SubOrder.aggregate([
          {
            $match: {
              owner: new mongoose.Types.ObjectId(ownerId),
              status: {
                $in: [
                  'OWNER_CONFIRMED',
                  'PARTIALLY_CONFIRMED',
                  'READY_FOR_CONTRACT',
                  'CONTRACT_SIGNED',
                  'COMPLETED'
                ]
              },
              createdAt: { $gte: previousStart, $lte: previousEnd }
            }
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$pricing.subtotalRental' }
            }
          }
        ]);

        const previousRevenue = previousStats.length > 0 ? previousStats[0].totalRevenue : 0;
        if (previousRevenue > 0) {
          growthRate = (((totalRevenue - previousRevenue) / previousRevenue) * 100).toFixed(2);
        }
      }

      // Lấy chi tiết phí quảng cáo theo thời gian

      const promotionByPeriod = await ProductPromotion.aggregate([
        { $match: promotionQuery },
        {
          $group: {
            _id: {
              $dateToString: { format: dateFormat, date: '$createdAt' }
            },
            promotionFees: { $sum: '$totalAmount' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const promotionMap = {};
      promotionByPeriod.forEach((item) => {
        promotionMap[item._id] = item.promotionFees;
      });

      return {
        summary: {
          totalRevenue: totalRevenue, // 100% doanh thu
          receivedAmount: receivedAmount, // 90% tiền nhận về
          platformFee: platformFee, // 10% phí nền tảng
          promotionFees: totalPromotionFees, // Phí quảng cáo
          totalDeposit: totals.totalDeposit || 0,
          totalShippingFee: totals.totalShippingFee || 0,
          totalAmount: totals.totalAmount || 0,
          orderCount: totals.totalOrders || 0,
          averageOrderValue:
            totals.totalOrders > 0 ? (totals.totalAmount || 0) / totals.totalOrders : 0,
          growthRate: parseFloat(growthRate)
        },
        profit: {
          revenue: totalRevenue, // Doanh thu (100%)
          receivedAmount: receivedAmount, // Tiền nhận về (90%)
          costs: totalCosts, // Chi phí tổng
          platformFee: platformFee, // 10% phí nền tảng
          promotionFees: totalPromotionFees, // Phí quảng cáo
          profit: profit, // Lợi nhuận
          profitMargin: totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(2) : 0
        },
        breakdown: {
          bySource: [
            { name: 'Doanh thu (100%)', value: totalRevenue },
            { name: 'Tiền nhận về (90%)', value: receivedAmount },
            { name: 'Phí nền tảng (10%)', value: platformFee },
            { name: 'Phí quảng cáo', value: totalPromotionFees }
          ]
        },
        timeSeries: revenueByPeriod.map((item) => {
          const itemRevenue = item.totalRevenue || 0;
          const itemReceived = itemRevenue * 0.9;
          const itemPlatformFee = itemRevenue * 0.1;
          const itemPromotionFees = promotionMap[item.period] || 0;
          const itemProfit = itemReceived - itemPromotionFees;

          return {
            date: item.period,
            revenue: itemRevenue, // 100% doanh thu
            receivedAmount: itemReceived, // 90% tiền nhận về
            platformFee: itemPlatformFee, // 10% phí nền tảng
            promotionFees: itemPromotionFees, // Phí quảng cáo
            deposit: item.totalDeposit,
            orderCount: item.orderCount,
            profit: itemProfit, // Lợi nhuận
            costs: itemPlatformFee + itemPromotionFees // Tổng chi phí
          };
        }),
        groupBy
      };
    } catch (error) {
      throw new Error(`Error getting revenue statistics: ${error.message}`);
    }
  },

  /**
   * Lấy top sản phẩm có doanh thu cao nhất
   * @param {String} ownerId - ID của owner
   * @param {Number} limit - Số lượng sản phẩm top
   * @returns {Array} - Danh sách top sản phẩm
   */
  getTopRevenueProducts: async (ownerId, limit = 10) => {
    try {
      const topProducts = await SubOrder.aggregate([
        {
          $match: {
            owner: new mongoose.Types.ObjectId(ownerId),
            status: {
              $in: [
                'OWNER_CONFIRMED',
                'PARTIALLY_CONFIRMED',
                'READY_FOR_CONTRACT',
                'CONTRACT_SIGNED',
                'COMPLETED'
              ]
            }
          }
        },
        { $unwind: '$products' },
        {
          $group: {
            _id: '$products.product',
            totalRevenue: {
              $sum: {
                $add: ['$products.totalRental', '$products.totalDeposit']
              }
            },
            rentalCount: { $sum: 1 },
            totalQuantityRented: { $sum: '$products.quantity' }
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productInfo'
          }
        },
        { $unwind: '$productInfo' },
        {
          $project: {
            _id: 0,
            productId: '$_id',
            title: '$productInfo.title',
            images: '$productInfo.images',
            status: '$productInfo.status',
            totalRevenue: 1,
            rentalCount: 1,
            totalQuantityRented: 1
          }
        }
      ]);

      return topProducts;
    } catch (error) {
      throw new Error(`Error getting top revenue products: ${error.message}`);
    }
  },

  /**
   * Lấy thống kê sản phẩm đang cho thuê
   * @param {String} ownerId - ID của owner
   * @returns {Array} - Danh sách sản phẩm đang cho thuê với thông tin đơn hàng
   */
  getCurrentlyRentedProducts: async (ownerId) => {
    try {
      const rentedProducts = await SubOrder.aggregate([
        {
          $match: {
            owner: new mongoose.Types.ObjectId(ownerId),
            status: {
              $in: [
                'OWNER_CONFIRMED',
                'PARTIALLY_CONFIRMED',
                'READY_FOR_CONTRACT',
                'CONTRACT_SIGNED'
              ]
            }
          }
        },
        { $unwind: '$products' },
        {
          $match: {
            'products.productStatus': {
              $in: ['CONFIRMED', 'SHIPPER_CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'ACTIVE']
            }
          }
        },
        {
          $lookup: {
            from: 'products',
            localField: 'products.product',
            foreignField: '_id',
            as: 'productInfo'
          }
        },
        { $unwind: '$productInfo' },
        {
          $lookup: {
            from: 'masterorders',
            localField: 'masterOrder',
            foreignField: '_id',
            as: 'masterOrderInfo'
          }
        },
        { $unwind: '$masterOrderInfo' },
        {
          $lookup: {
            from: 'users',
            localField: 'masterOrderInfo.renter',
            foreignField: '_id',
            as: 'renterInfo'
          }
        },
        { $unwind: '$renterInfo' },
        {
          $project: {
            _id: 0,
            subOrderNumber: 1,
            status: 1,
            productId: '$productInfo._id',
            productTitle: '$productInfo.title',
            productImages: '$productInfo.images',
            quantity: '$products.quantity',
            rentalRate: '$products.rentalRate',
            depositRate: '$products.depositRate',
            productStatus: '$products.productStatus',
            rentalPeriod: '$products.rentalPeriod',
            renter: {
              id: '$renterInfo._id',
              firstName: '$renterInfo.firstName',
              lastName: '$renterInfo.lastName',
              email: '$renterInfo.email',
              phoneNumber: '$renterInfo.phoneNumber'
            },
            masterOrderNumber: '$masterOrderInfo.masterOrderNumber'
          }
        },
        { $sort: { 'rentalPeriod.startDate': -1 } }
      ]);

      return rentedProducts;
    } catch (error) {
      throw new Error(`Error getting currently rented products: ${error.message}`);
    }
  }
};

module.exports = ownerStatisticsService;
