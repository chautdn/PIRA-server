require('dotenv').config();
const VietMapService = require('../src/services/vietmap.service');

async function testVietMapIntegration() {
  console.log('=== Test VietMap API Integration ===\n');

  try {
    // Test 1: Tính khoảng cách giữa 2 điểm ở TP.HCM
    console.log('1. Test tính khoảng cách:');
    const distance = await VietMapService.calculateDistance(
      106.660172,
      10.762622, // Quận 1, TP.HCM
      106.663445,
      10.799015 // Quận 3, TP.HCM
    );

    console.log('Kết quả:', JSON.stringify(distance, null, 2));
    console.log('');

    // Test 2: Tính phí ship
    console.log('2. Test tính phí ship:');
    if (distance.success || distance.fallback) {
      const shippingFee = VietMapService.calculateShippingFee(distance.distanceKm);
      console.log('Phí ship:', JSON.stringify(shippingFee, null, 2));
    }
    console.log('');

    // Test 3: Geocoding địa chỉ
    console.log('3. Test geocoding:');
    const geocode = await VietMapService.geocodeAddress('123 Nguyen Van A, Quan 1, TP.HCM');
    console.log('Geocode result:', JSON.stringify(geocode, null, 2));
    console.log('');

    // Test 4: Reverse geocoding
    console.log('4. Test reverse geocoding:');
    const reverseGeocode = await VietMapService.reverseGeocode(10.762622, 106.660172);
    console.log('Reverse geocode result:', JSON.stringify(reverseGeocode, null, 2));
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Chạy test
testVietMapIntegration();
