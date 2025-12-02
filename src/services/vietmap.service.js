const axios = require('axios');

class VietMapService {
  constructor() {
    this.apiKey = process.env.VIETMAP_API_KEY;
    this.baseUrl = 'https://maps.vietmap.vn/api';
  }

  /**
   * Tính khoảng cách thực tế bằng xe máy từ chủ → người thuê
   * Chỉ trả về kết quả từ VietMap (không fallback nếu bạn không muốn)
   */
  async calculateDistance(lonOwner, latOwner, lonUser, latUser) {
    if (!this.apiKey) {
      throw new Error('VietMap API key is not configured');
    }

    const url = `${this.baseUrl}/route`;

    const params = new URLSearchParams();
    params.append('api-version', '1.1');
    params.append('apikey', this.apiKey);
    params.append('point', `${latOwner},${lonOwner}`); // LAT,LON
    params.append('point', `${latUser},${lonUser}`); // LAT,LON
    params.append('points_encoded', 'true');
    params.append('vehicle', 'bike'); // hoặc 'motorcycle' nếu muốn chính xác hơn
    params.append('optimize', 'true');

    try {
      const response = await axios.get(url, { params, timeout: 10000 });

      if (response.data?.code === 'OK' || response.data?.code === 'Ok') {
        if (response.data.paths?.length > 0) {
          const route = response.data.paths[0];

          return {
            success: true,
            distanceMeters: Math.round(route.distance),
            distanceKm: parseFloat((route.distance / 1000).toFixed(2)),
            durationMinutes: Math.round(route.time / 60000),
            durationSeconds: Math.round(route.time / 1000),
            routeFound: true,
            rawResponse: response.data
          };
        }
      }

      // Nếu VietMap trả lỗi hoặc không tìm được đường
      throw new Error(response.data?.messages || 'No route found');
    } catch (error) {
      // BỎ FALLBACK HAVERSINE HOÀN TOÀN (nếu bạn muốn tính phí chính xác)
      // Chỉ log lỗi, trả về thất bại rõ ràng
      console.error('VietMap Route failed:', error.message);
      throw new Error(`Không thể tính khoảng cách thực tế: ${error.message}`);
    }
  }

  /**
   * Tính phí ship theo khoảng cách thực tế (dùng trong controller)
   */
  calculateShippingFee(distanceKm, options = {}) {
    const baseFee = options.baseFee || 15000; // 15k cố định
    const pricePerKm = options.pricePerKm || 3000; // 1k/km (reduced from 5k/km)
    const minFee = options.minFee || 20000; // tối thiểu 20k
    const maxFee = options.maxFee || 150000; // tối đa 150k

    let fee = baseFee + Math.round(distanceKm) * pricePerKm;

    if (fee < minFee) fee = minFee;
    if (fee > maxFee) fee = maxFee;

    // Làm tròn đẹp lên 1.000 gần nhất (tùy chọn, rất chuyên nghiệp)
    fee = Math.ceil(fee / 1000) * 1000;

    return {
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      baseFee,
      distanceFee: Math.round(distanceKm) * pricePerKm,
      finalFee: fee,
      note: `Phí ship = ${baseFee.toLocaleString()} + ${Math.round(distanceKm)}km × ${pricePerKm.toLocaleString()} = ${fee.toLocaleString()}đ`
    };
  }

  /**
   * Tính phí ship cho toàn bộ SubOrder (giữ nguyên logic gom ngày)
   */
  calculateProductShippingFees(products, distanceKm, options = {}) {
    const config = {
      baseFeePerDelivery: 15000,
      pricePerKm: 5000,
      minFeePerDelivery: 25000,
      maxFeePerDelivery: 120000,
      ...options
    };

    const deliveryBatches = {};
    products.forEach((item, idx) => {
      const date = item.rentalPeriod?.startDate
        ? new Date(item.rentalPeriod.startDate).toISOString().split('T')[0]
        : 'unknown';

      if (!deliveryBatches[date]) deliveryBatches[date] = [];
      deliveryBatches[date].push({ ...item, idx });
    });

    let totalShippingFee = 0;
    const batches = [];

    Object.entries(deliveryBatches).forEach(([date, items], batchIndex) => {
      const rawFee = config.baseFeePerDelivery + distanceKm * config.pricePerKm;
      let fee = Math.max(config.minFeePerDelivery, Math.min(config.maxFeePerDelivery, rawFee));
      fee = Math.ceil(fee / 1000) * 1000; // làm tròn đẹp

      totalShippingFee += fee;

      batches.push({
        deliveryDate: date === 'unknown' ? null : date,
        batchIndex: batchIndex + 1,
        productCount: items.length,
        distanceKm,
        deliveryFee: fee
      });
    });

    return {
      success: true,
      totalShippingFee,
      deliveryCount: batches.length,
      distanceKm,
      batches,
      summary: `Tổng phí ship: ${totalShippingFee.toLocaleString()}đ cho ${batches.length} lần giao (khoảng cách ${distanceKm.toFixed(1)}km)`
    };
  }

  /**
   * Hàm chính: Tính shipping cho 1 SubOrder (gọi từ controller)
   */
  async calculateSubOrderShipping(subOrder, ownerLocation, userLocation) {
    try {
      const distanceResult = await this.calculateDistance(
        ownerLocation.longitude,
        ownerLocation.latitude,
        userLocation.longitude,
        userLocation.latitude
      );

      // Bây giờ distanceResult luôn là thật 100%, không fallback
      const distanceKm = distanceResult.distanceKm;

      const shipping = this.calculateProductShippingFees(subOrder.products, distanceKm);

      return {
        success: true,
        subOrderId: subOrder._id,
        realDistance: {
          km: distanceKm,
          meters: distanceResult.distanceMeters,
          durationMinutes: distanceResult.durationMinutes
        },
        shippingFee: shipping.totalShippingFee,
        shippingDetails: shipping,
        message: 'Tính phí ship theo khoảng cách thực tế bằng VietMap'
      };
    } catch (error) {
      return {
        success: false,
        subOrderId: subOrder._id || 'unknown',
        error: error.message || 'Không thể tính khoảng cách'
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
