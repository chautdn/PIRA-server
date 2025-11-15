const axios = require('axios');

class VietMapService {
  constructor() {
    this.apiKey = process.env.VIETMAP_API_KEY;
    this.baseUrl = 'https://maps.vietmap.vn/api';
  }

  /**
   * Tính khoảng cách và thời gian từ điểm A đến điểm B
   * @param {number} lonOwner - Kinh độ của chủ cho thuê
   * @param {number} latOwner - Vĩ độ của chủ cho thuê
   * @param {number} lonUser - Kinh độ của người thuê
   * @param {number} latUser - Vĩ độ của người thuê
   * @returns {Promise<Object>} - Kết quả từ VietMap API
   */
  async calculateDistance(lonOwner, latOwner, lonUser, latUser) {
    try {
      if (!this.apiKey) {
        throw new Error('VietMap API key is not configured');
      }

      if (!lonOwner || !latOwner || !lonUser || !latUser) {
        throw new Error('Missing coordinates parameters');
      }

      const url = `${this.baseUrl}/route`;
      const params = {
        'api-version': '1.1',
        apikey: this.apiKey,
        point: [`${lonOwner},${latOwner}`, `${lonUser},${latUser}`],
        vehicle: 'motorcycle', // Mặc định dùng xe máy
        optimize: 'true'
      };

      console.log('VietMap API Request:', { url, params });

      const response = await axios.get(url, {
        params: {
          ...params,
          point: `${lonOwner},${latOwner}`,
          point: `${lonUser},${latUser}`
        }
      });

      if (response.data && response.data.paths && response.data.paths.length > 0) {
        const route = response.data.paths[0];

        return {
          success: true,
          distance: Math.round(route.distance), // mét
          distanceKm: parseFloat((route.distance / 1000).toFixed(2)), // km
          duration: Math.round(route.time / 1000 / 60), // phút
          durationSeconds: Math.round(route.time / 1000), // giây
          rawResponse: response.data
        };
      } else {
        throw new Error('Invalid response from VietMap API');
      }
    } catch (error) {
      console.error('VietMap API Error:', error.message);

      // Fallback: Tính khoảng cách theo đường chim bay nếu API lỗi
      const fallbackDistance = this.calculateHaversineDistance(
        latOwner,
        lonOwner,
        latUser,
        lonUser
      );

      return {
        success: false,
        error: error.message,
        fallback: true,
        distance: Math.round(fallbackDistance * 1000), // mét
        distanceKm: parseFloat(fallbackDistance.toFixed(2)), // km
        duration: Math.round(fallbackDistance * 3), // Ước lượng 3 phút/km
        durationSeconds: Math.round(fallbackDistance * 3 * 60)
      };
    }
  }

  /**
   * Tính khoảng cách theo công thức Haversine (đường chim bay)
   * @param {number} lat1 - Vĩ độ điểm 1
   * @param {number} lon1 - Kinh độ điểm 1
   * @param {number} lat2 - Vĩ độ điểm 2
   * @param {number} lon2 - Kinh độ điểm 2
   * @returns {number} - Khoảng cách tính bằng km
   */
  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Bán kính Trái Đất tính bằng km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  }

  /**
   * Chuyển đổi độ sang radian
   * @param {number} deg - Góc tính bằng độ
   * @returns {number} - Góc tính bằng radian
   */
  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Tính phí vận chuyển dựa trên khoảng cách
   * @param {number} distanceKm - Khoảng cách tính bằng km
   * @param {Object} options - Tùy chọn tính phí
   * @returns {Object} - Thông tin phí vận chuyển
   */
  calculateShippingFee(distanceKm, options = {}) {
    const baseFee = options.baseFee || 10000; // 10,000 VND cố định
    const pricePerKm = options.pricePerKm || 5000; // 5,000 VND/km
    const minFee = options.minFee || 15000; // Phí tối thiểu 15,000 VND
    const maxFee = options.maxFee || 200000; // Phí tối đa 200,000 VND

    let shippingFee = baseFee + distanceKm * pricePerKm;

    // Áp dụng phí tối thiểu và tối đa
    if (shippingFee < minFee) {
      shippingFee = minFee;
    }
    if (shippingFee > maxFee) {
      shippingFee = maxFee;
    }

    return {
      baseFee,
      pricePerKm,
      distance: distanceKm,
      calculatedFee: Math.round(shippingFee),
      breakdown: {
        base: baseFee,
        distance: Math.round(distanceKm * pricePerKm),
        total: Math.round(shippingFee)
      }
    };
  }

  /**
   * Tính phí ship cho SubOrder theo số lần giao hàng (delivery batches)
   * Các sản phẩm cùng ngày bắt đầu thuê = 1 lần giao = 1 phí ship
   * @param {Array} products - Danh sách products với quantity và rentalPeriod
   * @param {number} distanceKm - Khoảng cách từ owner đến user
   * @param {Object} options - Tùy chọn tính phí
   * @returns {Object} - Chi tiết phí ship theo từng batch giao hàng
   */
  calculateProductShippingFees(products, distanceKm, options = {}) {
    const baseFeePerDelivery = options.baseFeePerDelivery || 15000; // 15k per delivery trip
    const pricePerKm = options.pricePerKm || 5000; // 5k per km
    const minFeePerDelivery = options.minFeePerDelivery || 20000; // Min 20k per delivery
    const maxFeePerDelivery = options.maxFeePerDelivery || 100000; // Max 100k per delivery

    // Group products by delivery date (startDate)
    const deliveryBatches = {};

    products.forEach((productItem, index) => {
      const startDate = productItem.rentalPeriod?.startDate;
      let deliveryDate;

      if (startDate) {
        // Convert to date string for grouping (YYYY-MM-DD)
        deliveryDate = new Date(startDate).toISOString().split('T')[0];
      } else {
        // If no startDate, use 'unknown' group
        deliveryDate = 'unknown';
      }

      if (!deliveryBatches[deliveryDate]) {
        deliveryBatches[deliveryDate] = [];
      }

      deliveryBatches[deliveryDate].push({
        ...productItem,
        originalIndex: index
      });
    });

    const deliveryFees = [];
    let totalShippingFee = 0;
    let deliveryCount = 0;

    // Calculate fee for each delivery batch
    Object.entries(deliveryBatches).forEach(([deliveryDate, batchProducts]) => {
      deliveryCount++;

      // Calculate total quantity for this delivery batch
      const batchQuantity = batchProducts.reduce((sum, p) => sum + (p.quantity || 1), 0);

      // Calculate fee for this delivery (one trip regardless of quantity)
      let deliveryFee = baseFeePerDelivery + distanceKm * pricePerKm;

      // Apply min/max limits per delivery
      if (deliveryFee < minFeePerDelivery) deliveryFee = minFeePerDelivery;
      if (deliveryFee > maxFeePerDelivery) deliveryFee = maxFeePerDelivery;

      deliveryFee = Math.round(deliveryFee);
      totalShippingFee += deliveryFee;

      // Distribute delivery fee among products in this batch
      const feePerProduct = Math.round(deliveryFee / batchProducts.length);
      const productFees = [];

      batchProducts.forEach((productItem, batchIndex) => {
        const productFee = {
          productIndex: productItem.originalIndex,
          productId: productItem.product?._id || productItem.product,
          quantity: productItem.quantity || 1,
          deliveryDate: deliveryDate,
          deliveryBatch: deliveryCount,
          distance: distanceKm,
          // Each product gets an equal share of the delivery fee
          allocatedFee:
            batchIndex === batchProducts.length - 1
              ? deliveryFee - feePerProduct * batchIndex // Last product gets remainder
              : feePerProduct,
          breakdown: {
            deliveryFee: deliveryFee,
            productShare: feePerProduct,
            batchSize: batchProducts.length,
            batchQuantity: batchQuantity
          }
        };

        productFees.push(productFee);
      });

      deliveryFees.push({
        deliveryDate: deliveryDate,
        deliveryBatch: deliveryCount,
        products: productFees,
        batchQuantity: batchQuantity,
        batchSize: batchProducts.length,
        deliveryFee: deliveryFee,
        distance: distanceKm,
        breakdown: {
          baseFee: baseFeePerDelivery,
          distanceFee: Math.round(distanceKm * pricePerKm),
          total: deliveryFee
        }
      });
    });

    // Flatten product fees for backward compatibility
    const allProductFees = deliveryFees.flatMap((batch) => batch.products);

    return {
      success: true,
      totalShippingFee: totalShippingFee,
      deliveryCount: deliveryCount,
      deliveryBatches: deliveryFees,
      productFees: allProductFees, // For backward compatibility
      summary: {
        totalProducts: products.length,
        totalQuantity: products.reduce((sum, p) => sum + (p.quantity || 1), 0),
        totalDeliveries: deliveryCount,
        averageFeePerDelivery: Math.round(totalShippingFee / deliveryCount),
        averageFeePerProduct: Math.round(totalShippingFee / products.length),
        distance: distanceKm,
        deliveryDates: Object.keys(deliveryBatches)
      }
    };
  }

  /**
   * Tính toán chi tiết shipping cho một SubOrder hoàn chỉnh
   * @param {Object} subOrder - SubOrder object
   * @param {Object} ownerLocation - Tọa độ owner {latitude, longitude}
   * @param {Object} userLocation - Tọa độ user {latitude, longitude}
   * @returns {Promise<Object>} - Chi tiết shipping calculation
   */
  async calculateSubOrderShipping(subOrder, ownerLocation, userLocation) {
    try {
      // Tính khoảng cách từ owner đến user
      const distanceResult = await this.calculateDistance(
        ownerLocation.longitude,
        ownerLocation.latitude,
        userLocation.longitude,
        userLocation.latitude
      );

      if (!distanceResult.success && !distanceResult.fallback) {
        throw new Error('Unable to calculate distance');
      }

      const distanceKm = distanceResult.distanceKm;

      // Tính phí ship cho từng product
      const shippingCalculation = this.calculateProductShippingFees(subOrder.products, distanceKm);

      return {
        success: true,
        subOrderId: subOrder._id,
        distance: {
          km: distanceKm,
          meters: distanceResult.distance,
          duration: distanceResult.duration,
          fallback: distanceResult.fallback || false
        },
        shipping: shippingCalculation,
        vietmapResponse: distanceResult.rawResponse
      };
    } catch (error) {
      console.error('SubOrder shipping calculation error:', error);
      return {
        success: false,
        error: error.message,
        subOrderId: subOrder._id
      };
    }
  }

  /**
   * Tìm vị trí địa lý từ địa chỉ (Geocoding)
   * @param {string} address - Địa chỉ cần tìm
   * @returns {Promise<Object>} - Tọa độ địa lý
   */
  async geocodeAddress(address) {
    try {
      if (!this.apiKey) {
        throw new Error('VietMap API key is not configured');
      }

      const url = `${this.baseUrl}/search`;
      const params = {
        'api-version': '1.1',
        apikey: this.apiKey,
        text: address,
        focus: '106.6297,10.8231' // Focus tại TP.HCM
      };

      const response = await axios.get(url, { params });

      if (
        response.data &&
        response.data.code === 'OK' &&
        response.data.data &&
        response.data.data.features &&
        response.data.data.features.length > 0
      ) {
        const feature = response.data.data.features[0];
        const coords = feature.geometry.coordinates; // [longitude, latitude]

        return {
          success: true,
          latitude: coords[1], // latitude is second element
          longitude: coords[0], // longitude is first element
          displayName: feature.properties.label || feature.properties.name,
          address: {
            name: feature.properties.name,
            locality: feature.properties.locality,
            county: feature.properties.county,
            region: feature.properties.region
          },
          rawResponse: response.data
        };
      } else {
        throw new Error('No location found for the given address');
      }
    } catch (error) {
      console.error('Geocoding Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Tìm địa chỉ từ tọa độ (Reverse Geocoding)
   * @param {number} lat - Vĩ độ
   * @param {number} lon - Kinh độ
   * @returns {Promise<Object>} - Thông tin địa chỉ
   */
  async reverseGeocode(lat, lon) {
    try {
      if (!this.apiKey) {
        throw new Error('VietMap API key is not configured');
      }

      const url = `${this.baseUrl}/reverse`;
      const params = {
        'api-version': '1.1',
        apikey: this.apiKey,
        lat: lat,
        lon: lon
      };

      const response = await axios.get(url, { params });

      if (
        response.data &&
        response.data.code === 'OK' &&
        response.data.data &&
        response.data.data.features &&
        response.data.data.features.length > 0
      ) {
        const feature = response.data.data.features[0];
        return {
          success: true,
          address: feature.properties.label || feature.properties.name,
          details: {
            name: feature.properties.name,
            locality: feature.properties.locality,
            county: feature.properties.county,
            region: feature.properties.region
          },
          rawResponse: response.data
        };
      } else {
        throw new Error('No address found for the given coordinates');
      }
    } catch (error) {
      console.error('Reverse Geocoding Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new VietMapService();
