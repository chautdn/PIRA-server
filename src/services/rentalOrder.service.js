const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Contract = require('../models/Contract');
const VietMapService = require('./vietmap.service');
const mongoose = require('mongoose');

class RentalOrderService {
  /**
   * Bước 1: Tạo đơn thuê tạm từ giỏ hàng (Draft Order)
   */
  async createDraftOrderFromCart(renterId, orderData) {
    console.log('🚀 Creating draft order for renter:', renterId);
    console.log('📋 Order data:', JSON.stringify(orderData, null, 2));

    try {
      const { rentalPeriod, deliveryAddress, deliveryMethod } = orderData;

      // Lấy thông tin giỏ hàng
      const cart = await Cart.findOne({ user: renterId }).populate({
        path: 'items.product',
        populate: {
          path: 'owner',
          select: 'profile.fullName profile.phone profile.address'
        }
      });

      if (!cart || cart.items.length === 0) {
        throw new Error('Giỏ hàng trống');
      }

      console.log('📦 Cart found with items:', cart.items.length);

      // Kiểm tra các items trong cart có đầy đủ thông tin không
      for (const item of cart.items) {
        if (!item.product) {
          throw new Error('Có sản phẩm trong giỏ hàng đã bị xóa');
        }
        if (!item.product.owner) {
          throw new Error('Thông tin chủ sở hữu sản phẩm không đầy đủ');
        }
      }

      // Nhóm sản phẩm theo chủ sở hữu
      const productsByOwner = this.groupProductsByOwner(cart.items);

      // Tạo masterOrderNumber
      const orderNumber = `MO${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      // Tạo MasterOrder
      const masterOrder = new MasterOrder({
        renter: renterId,
        masterOrderNumber: orderNumber,
        rentalPeriod,
        deliveryAddress: {
          ...deliveryAddress,
          latitude: deliveryAddress.latitude || null,
          longitude: deliveryAddress.longitude || null
        },
        deliveryMethod,
        status: 'DRAFT'
      });

      await masterOrder.save();

      // Tạo SubOrder cho từng chủ
      const subOrders = [];
      let totalAmount = 0;
      let totalDepositAmount = 0;
      let totalShippingFee = 0;

      for (const [ownerId, products] of Object.entries(productsByOwner)) {
        const owner = await User.findById(ownerId);
        if (!owner) continue;

        // Tính toán giá cho sản phẩm
        const processedProducts = this.calculateProductPricing(products, rentalPeriod);

        // Tạo subOrderNumber
        const subOrderNumber = `SO${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

        // Tạo SubOrder
        const subOrder = new SubOrder({
          masterOrder: masterOrder._id,
          subOrderNumber: subOrderNumber,
          owner: ownerId,
          ownerAddress: owner.profile.address || {},
          products: processedProducts,
          rentalPeriod,
          shipping: {
            method: deliveryMethod
          },
          status: 'DRAFT'
        });

        // Tính phí shipping nếu cần giao hàng
        if (deliveryMethod === 'DELIVERY' && owner.profile.address) {
          const shippingInfo = await this.calculateShippingFee(
            owner.profile.address,
            deliveryAddress
          );

          subOrder.shipping = {
            ...subOrder.shipping,
            ...shippingInfo
          };
          subOrder.pricing.shippingFee = shippingInfo.fee.totalFee;
        }

        await subOrder.save();
        subOrders.push(subOrder);

        // Cộng dồn tổng tiền
        totalAmount += subOrder.pricing.subtotalRental;
        totalDepositAmount += subOrder.pricing.subtotalDeposit;
        totalShippingFee += subOrder.pricing.shippingFee;
      }

      // Cập nhật MasterOrder
      masterOrder.subOrders = subOrders.map((so) => so._id);
      masterOrder.totalAmount = totalAmount;
      masterOrder.totalDepositAmount = totalDepositAmount;
      masterOrder.totalShippingFee = totalShippingFee;

      await masterOrder.save();

      // Populate và trả về
      return await MasterOrder.findById(masterOrder._id)
        .populate({
          path: 'subOrders',
          populate: [
            { path: 'owner', select: 'profile.fullName profile.phone profile.address' },
            { path: 'products.product', select: 'name images price deposit category' }
          ]
        })
        .populate('renter', 'profile.fullName profile.phone email');
    } catch (error) {
      console.error('❌ Error creating draft order:', error);

      // Throw more specific error message
      if (error.message.includes('ValidationError')) {
        throw new Error('Dữ liệu đơn hàng không hợp lệ: ' + error.message);
      } else if (error.message.includes('MongoError')) {
        throw new Error('Lỗi cơ sở dữ liệu khi tạo đơn hàng');
      } else {
        throw new Error('Không thể tạo đơn thuê: ' + error.message);
      }
    }
  }

  /**
   * Bước 2: Xác nhận đơn hàng và chuyển sang chờ thanh toán
   */
  async confirmOrder(masterOrderId, renterId) {
    const masterOrder = await MasterOrder.findOne({
      _id: masterOrderId,
      renter: renterId,
      status: 'DRAFT'
    }).populate('subOrders');

    if (!masterOrder) {
      throw new Error('Không tìm thấy đơn hàng hoặc đơn hàng không hợp lệ');
    }

    // Kiểm tra lại tính khả dụng của sản phẩm
    for (const subOrder of masterOrder.subOrders) {
      const subOrderDoc = await SubOrder.findById(subOrder._id).populate('products.product');
      await this.validateProductAvailability(
        subOrderDoc.products.map((p) => ({ product: p.product, quantity: p.quantity })),
        masterOrder.rentalPeriod
      );
    }

    // Cập nhật trạng thái
    masterOrder.status = 'PENDING_PAYMENT';
    await masterOrder.save();

    return masterOrder;
  }

  /**
   * Bước 3: Xử lý thanh toán
   */
  async processPayment(masterOrderId, paymentData) {
    const masterOrder = await MasterOrder.findOne({
      _id: masterOrderId,
      status: 'PENDING_PAYMENT'
    }).populate('subOrders');

    if (!masterOrder) {
      throw new Error('Không tìm thấy đơn hàng hoặc trạng thái không hợp lệ');
    }

    // Xử lý thanh toán (tích hợp với payment service)
    // Ở đây chúng ta giả sử thanh toán thành công
    masterOrder.paymentStatus = 'PAID';
    masterOrder.paymentMethod = paymentData.method;
    masterOrder.paymentInfo = {
      transactionId: paymentData.transactionId,
      paymentDate: new Date(),
      paymentDetails: paymentData
    };
    masterOrder.status = 'PENDING_CONFIRMATION';

    // Cập nhật tất cả SubOrder
    await SubOrder.updateMany(
      { masterOrder: masterOrderId },
      { status: 'PENDING_OWNER_CONFIRMATION' }
    );

    await masterOrder.save();

    // Xóa giỏ hàng sau khi thanh toán thành công
    await Cart.findOneAndUpdate({ user: masterOrder.renter }, { $set: { items: [] } });

    return masterOrder;
  }

  /**
   * Bước 4: Chủ xác nhận đơn hàng
   */
  async ownerConfirmOrder(subOrderId, ownerId, confirmationData) {
    const subOrder = await SubOrder.findOne({
      _id: subOrderId,
      owner: ownerId,
      status: 'PENDING_OWNER_CONFIRMATION'
    }).populate('masterOrder');

    if (!subOrder) {
      throw new Error('Không tìm thấy đơn hàng hoặc không có quyền xác nhận');
    }

    const { status, notes, rejectionReason } = confirmationData;

    if (status === 'CONFIRMED') {
      subOrder.ownerConfirmation = {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        notes
      };
      subOrder.status = 'OWNER_CONFIRMED';
    } else if (status === 'REJECTED') {
      subOrder.ownerConfirmation = {
        status: 'OWNER_REJECTED',
        rejectedAt: new Date(),
        rejectionReason,
        notes
      };
      subOrder.status = 'OWNER_REJECTED';
    }

    await subOrder.save();

    // Kiểm tra tất cả SubOrder đã được xác nhận chưa
    await this.checkAllSubOrdersConfirmed(subOrder.masterOrder._id);

    return subOrder;
  }

  /**
   * Bước 5: Tạo hợp đồng điện tử
   */
  async generateContract(masterOrderId) {
    const masterOrder = await MasterOrder.findOne({
      _id: masterOrderId,
      status: 'READY_FOR_CONTRACT'
    }).populate([
      { path: 'renter', select: 'profile email' },
      {
        path: 'subOrders',
        populate: [{ path: 'owner', select: 'profile email' }, { path: 'products.product' }]
      }
    ]);

    if (!masterOrder) {
      throw new Error('Đơn hàng không hợp lệ để tạo hợp đồng');
    }

    const contracts = [];

    // Tạo hợp đồng cho từng SubOrder
    for (const subOrder of masterOrder.subOrders) {
      if (subOrder.status !== 'OWNER_CONFIRMED') continue;

      const contract = new Contract({
        order: subOrder._id, // Liên kết với SubOrder
        owner: subOrder.owner._id,
        renter: masterOrder.renter._id,
        product: subOrder.products[0].product._id, // Sản phẩm chính
        terms: {
          startDate: masterOrder.rentalPeriod.startDate,
          endDate: masterOrder.rentalPeriod.endDate,
          rentalRate: subOrder.pricing.subtotalRental,
          deposit: subOrder.pricing.subtotalDeposit
        },
        status: 'PENDING_SIGNATURE'
      });

      await contract.save();

      // Cập nhật SubOrder
      subOrder.contract = contract._id;
      subOrder.status = 'READY_FOR_CONTRACT';
      await subOrder.save();

      contracts.push(contract);
    }

    return contracts;
  }

  /**
   * Ký hợp đồng điện tử
   */
  async signContract(contractId, userId, signatureData) {
    const contract = await Contract.findById(contractId).populate('owner renter');

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Kiểm tra quyền ký
    const isOwner = contract.owner._id.toString() === userId;
    const isRenter = contract.renter._id.toString() === userId;

    if (!isOwner && !isRenter) {
      throw new Error('Không có quyền ký hợp đồng này');
    }

    // Cập nhật chữ ký
    if (isOwner) {
      contract.signatures.owner = {
        signedAt: new Date(),
        signatureData,
        ipAddress: signatureData.ipAddress,
        userAgent: signatureData.userAgent
      };
    }

    if (isRenter) {
      contract.signatures.renter = {
        signedAt: new Date(),
        signatureData,
        ipAddress: signatureData.ipAddress,
        userAgent: signatureData.userAgent
      };
    }

    // Kiểm tra nếu đã có đủ chữ ký
    if (contract.signatures.owner.signedAt && contract.signatures.renter.signedAt) {
      contract.status = 'SIGNED';
      contract.signedAt = new Date();

      // Cập nhật SubOrder
      await SubOrder.findOneAndUpdate({ contract: contractId }, { status: 'CONTRACT_SIGNED' });

      // Kiểm tra tất cả hợp đồng đã ký chưa
      const masterOrderId = await this.getMasterOrderIdFromContract(contractId);
      await this.checkAllContractsSigned(masterOrderId);
    }

    await contract.save();
    return contract;
  }

  // Utility methods

  async validateProductAvailability(cartItems, rentalPeriod) {
    for (const item of cartItems) {
      const product = await Product.findById(item.product._id || item.product);

      if (!product) {
        throw new Error(`Sản phẩm không tồn tại`);
      }

      if (product.status !== 'ACTIVE') {
        throw new Error(`Sản phẩm ${product.name} không khả dụng`);
      }

      if (product.quantity < item.quantity) {
        throw new Error(`Sản phẩm ${product.name} không đủ số lượng`);
      }

      // Kiểm tra xem sản phẩm có bị thuê trong khoảng thời gian này không
      const existingOrders = await SubOrder.find({
        'products.product': product._id,
        status: { $in: ['ACTIVE', 'CONTRACT_SIGNED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
        $or: [
          {
            'rentalPeriod.startDate': {
              $lte: rentalPeriod.endDate
            },
            'rentalPeriod.endDate': {
              $gte: rentalPeriod.startDate
            }
          }
        ]
      });

      if (existingOrders.length > 0) {
        throw new Error(`Sản phẩm ${product.name} đã được thuê trong thời gian này`);
      }
    }
  }

  groupProductsByOwner(cartItems) {
    const grouped = {};

    cartItems.forEach((item) => {
      const ownerId = item.product.owner._id.toString();
      if (!grouped[ownerId]) {
        grouped[ownerId] = [];
      }
      grouped[ownerId].push(item);
    });

    return grouped;
  }

  async calculateProductPricing(products, rentalPeriod) {
    const startDate = new Date(rentalPeriod.startDate);
    const endDate = new Date(rentalPeriod.endDate);
    const durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    return products.map((item) => {
      const product = item.product;
      const quantity = item.quantity;

      const dailyRate = product.price;
      const depositRate = product.deposit;

      const totalRental = dailyRate * durationDays * quantity;
      const totalDeposit = depositRate * quantity;

      return {
        product: product._id,
        quantity,
        rentalRate: dailyRate,
        depositRate,
        totalRental,
        totalDeposit
      };
    });
  }

  async calculateShippingFee(ownerAddress, deliveryAddress) {
    try {
      // Kiểm tra tọa độ của chủ và người thuê
      let ownerLat = ownerAddress.latitude;
      let ownerLon = ownerAddress.longitude;
      let userLat = deliveryAddress.latitude;
      let userLon = deliveryAddress.longitude;

      // Nếu chưa có tọa độ, thử geocode địa chỉ
      if (!ownerLat || !ownerLon) {
        const ownerGeocode = await VietMapService.geocodeAddress(
          `${ownerAddress.streetAddress}, ${ownerAddress.ward}, ${ownerAddress.district}, ${ownerAddress.city}`
        );
        if (ownerGeocode.success) {
          ownerLat = ownerGeocode.latitude;
          ownerLon = ownerGeocode.longitude;
        }
      }

      if (!userLat || !userLon) {
        const userGeocode = await VietMapService.geocodeAddress(
          `${deliveryAddress.streetAddress}, ${deliveryAddress.ward}, ${deliveryAddress.district}, ${deliveryAddress.city}`
        );
        if (userGeocode.success) {
          userLat = userGeocode.latitude;
          userLon = userGeocode.longitude;
        }
      }

      // Fallback mechanism: sử dụng tọa độ mặc định nếu geocoding thất bại
      if (!ownerLat || !ownerLon || !userLat || !userLon) {
        console.log('⚠️ Geocoding thất bại, sử dụng fallback coordinates');

        // Fallback coordinates cho các thành phố lớn
        const fallbackCoords = {
          'Hồ Chí Minh': { lat: 10.8231, lon: 106.6297 },
          'Hà Nội': { lat: 21.0285, lon: 105.8542 },
          'Đà Nẵng': { lat: 16.0471, lon: 108.2068 },
          'Cần Thơ': { lat: 10.0452, lon: 105.7469 }
        };

        // Sử dụng fallback cho owner
        if (!ownerLat || !ownerLon) {
          const ownerCity = ownerAddress.city || 'Hồ Chí Minh';
          const fallback = fallbackCoords[ownerCity] || fallbackCoords['Hồ Chí Minh'];
          ownerLat = fallback.lat;
          ownerLon = fallback.lon;
          console.log(`🏠 Owner fallback: ${ownerCity} -> ${ownerLat}, ${ownerLon}`);
        }

        // Sử dụng fallback cho user
        if (!userLat || !userLon) {
          const userCity = deliveryAddress.city || deliveryAddress.province || 'Hồ Chí Minh';
          const fallback = fallbackCoords[userCity] || fallbackCoords['Hồ Chí Minh'];
          userLat = fallback.lat;
          userLon = fallback.lon;
          console.log(`🚚 User fallback: ${userCity} -> ${userLat}, ${userLon}`);
        }
      }

      // Tính khoảng cách
      const distanceResult = await VietMapService.calculateDistance(
        ownerLon,
        ownerLat,
        userLon,
        userLat
      );

      // Nếu VietMap API thất bại, sử dụng công thức haversine đơn giản
      if (!distanceResult.success && !distanceResult.fallback) {
        console.log('⚠️ VietMap distance API thất bại, sử dụng haversine fallback');

        // Công thức Haversine đơn giản
        const R = 6371; // Bán kính Trái đất (km)
        const dLat = ((userLat - ownerLat) * Math.PI) / 180;
        const dLon = ((userLon - ownerLon) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((ownerLat * Math.PI) / 180) *
            Math.cos((userLat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const fallbackDistance = R * c;

        distanceResult.distanceKm = Math.round(fallbackDistance * 100) / 100;
        distanceResult.duration = Math.round(fallbackDistance * 3); // Ước tính 3 phút/km
        distanceResult.success = true;
        distanceResult.fallback = true;

        console.log(
          `📏 Fallback distance: ${distanceResult.distanceKm}km, ${distanceResult.duration}min`
        );
      }

      // Tính phí ship
      const shippingFee = VietMapService.calculateShippingFee(distanceResult.distanceKm);

      console.log('📦 Calculated shipping fee:', shippingFee);

      return {
        distance: distanceResult.distanceKm,
        estimatedTime: distanceResult.duration,
        fee: shippingFee,
        calculatedFee: shippingFee.calculatedFee, // For backward compatibility
        vietmapResponse: distanceResult,
        success: true
      };
    } catch (error) {
      console.error('Lỗi tính phí ship:', error);

      // Fallback: phí cố định
      return {
        distance: 0,
        estimatedTime: 0,
        fee: {
          baseFee: 15000,
          pricePerKm: 0,
          distance: 0,
          calculatedFee: 15000,
          breakdown: {
            base: 15000,
            distance: 0,
            total: 15000
          }
        },
        error: error.message
      };
    }
  }

  async checkAllSubOrdersConfirmed(masterOrderId) {
    const subOrders = await SubOrder.find({ masterOrder: masterOrderId });

    const allConfirmed = subOrders.every(
      (so) => so.status === 'OWNER_CONFIRMED' || so.status === 'OWNER_REJECTED'
    );

    if (allConfirmed) {
      const hasRejected = subOrders.some((so) => so.status === 'OWNER_REJECTED');

      if (hasRejected) {
        await MasterOrder.findByIdAndUpdate(masterOrderId, {
          status: 'CANCELLED'
        });
      } else {
        await MasterOrder.findByIdAndUpdate(masterOrderId, {
          status: 'READY_FOR_CONTRACT'
        });
      }
    }
  }

  async checkAllContractsSigned(masterOrderId) {
    const subOrders = await SubOrder.find({ masterOrder: masterOrderId });
    const allSigned = subOrders.every((so) => so.status === 'CONTRACT_SIGNED');

    if (allSigned) {
      await MasterOrder.findByIdAndUpdate(masterOrderId, {
        status: 'CONTRACT_SIGNED'
      });
    }
  }

  async getMasterOrderIdFromContract(contractId) {
    const subOrder = await SubOrder.findOne({ contract: contractId });
    return subOrder ? subOrder.masterOrder : null;
  }

  /**
   * Calculate product pricing for rental period
   */
  calculateProductPricing(products, rentalPeriod) {
    const startDate = new Date(rentalPeriod.startDate);
    const endDate = new Date(rentalPeriod.endDate);
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) || 1;

    console.log(`📊 Calculating pricing for ${products.length} products over ${days} days`);

    return products.map((item) => {
      const dailyRate = item.product.pricing?.dailyRate || item.product.price || 0;
      const depositAmount = item.product.pricing?.deposit?.amount || item.product.deposit || 0;

      const totalRental = dailyRate * item.quantity * days;
      const totalDeposit = depositAmount * item.quantity;

      console.log(
        `💰 Product ${item.product.title || item.product.name}: ${dailyRate}đ/day x ${item.quantity} x ${days} days = ${totalRental}đ`
      );

      return {
        product: item.product._id,
        quantity: item.quantity,
        rentalRate: dailyRate,
        depositRate: depositAmount,
        totalRental,
        totalDeposit,
        rentalPeriod: {
          startDate: startDate,
          endDate: endDate,
          days: days
        }
      };
    });
  }

  /**
   * Group products by owner
   */
  groupProductsByOwner(cartItems) {
    const grouped = {};

    cartItems.forEach((item) => {
      const ownerId = item.product.owner._id || item.product.owner;
      if (!grouped[ownerId]) {
        grouped[ownerId] = [];
      }
      grouped[ownerId].push(item);
    });

    console.log(`👥 Grouped products by ${Object.keys(grouped).length} owners`);
    return grouped;
  }

  /**
   * Lấy danh sách SubOrder cho chủ sản phẩm
   */
  async getSubOrdersByOwner(ownerId, options = {}) {
    console.log('🔍 Getting SubOrders for owner:', ownerId);

    try {
      const { status, page = 1, limit = 10 } = options;
      const skip = (page - 1) * limit;

      // Build query
      const query = { owner: ownerId };
      if (status && status !== 'ALL') {
        query.status = status;
      }

      console.log('📊 Query:', query);

      const subOrders = await SubOrder.find(query)
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.fullName profile.phoneNumber email'
          }
        })
        .populate({
          path: 'products.product',
          select: 'name images pricing availability'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await SubOrder.countDocuments(query);

      console.log(`✅ Found ${subOrders.length} SubOrders`);

      return {
        data: subOrders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('❌ Error getting SubOrders:', error);
      throw error;
    }
  }

  /**
   * Xác nhận SubOrder
   */
  async confirmSubOrder(subOrderId, ownerId) {
    console.log('✅ Confirming SubOrder:', subOrderId, 'by owner:', ownerId);

    try {
      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId,
        status: 'DRAFT'
      });

      if (!subOrder) {
        throw new Error('Không tìm thấy yêu cầu thuê hoặc yêu cầu đã được xử lý');
      }

      subOrder.status = 'OWNER_CONFIRMED';
      subOrder.confirmedAt = new Date();
      await subOrder.save();

      console.log('✅ SubOrder confirmed successfully');

      // Populate và trả về
      return await SubOrder.findById(subOrderId)
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.fullName profile.phoneNumber email'
          }
        })
        .populate({
          path: 'products.product',
          select: 'name images rentalPrice depositPercentage'
        });
    } catch (error) {
      console.error('❌ Error confirming SubOrder:', error);
      throw error;
    }
  }

  /**
   * Từ chối SubOrder
   */
  async rejectSubOrder(subOrderId, ownerId, reason) {
    console.log('❌ Rejecting SubOrder:', subOrderId, 'by owner:', ownerId);

    try {
      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId,
        status: 'DRAFT'
      });

      if (!subOrder) {
        throw new Error('Không tìm thấy yêu cầu thuê hoặc yêu cầu đã được xử lý');
      }

      subOrder.status = 'OWNER_REJECTED';
      subOrder.rejectedAt = new Date();
      subOrder.rejectionReason = reason;
      await subOrder.save();

      console.log('❌ SubOrder rejected successfully');

      // Populate và trả về
      return await SubOrder.findById(subOrderId)
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.fullName profile.phoneNumber email'
          }
        })
        .populate({
          path: 'products.product',
          select: 'name images rentalPrice depositPercentage'
        });
    } catch (error) {
      console.error('❌ Error rejecting SubOrder:', error);
      throw error;
    }
  }
}

module.exports = new RentalOrderService();
