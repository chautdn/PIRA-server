# 🚀 **PIRA Rental System - Postman Test Guide**

## **Cài đặt cơ bản**

### **Environment Variables trong Postman:**

```
baseURL: http://localhost:5000/api
token: Bearer {{your_jwt_token}}
orderId: {{order_id_from_response}}
contractId: {{contract_id_from_response}}
```

---

## **📋 Test Cases (đã sửa lỗi)**

### **Test 1: Đăng nhập để lấy token**

**POST** `{{baseURL}}/auth/login`

```json
{
  "email": "testuser@example.com",
  "password": "password123"
}
```

**Test Script (Postman):**

```javascript
if (pm.response.code === 200) {
  const response = pm.response.json();
  pm.environment.set('token', 'Bearer ' + response.token);
}
```

---

### **Test 2: Tạo đơn thuê (Cấu trúc đúng)**

**POST** `{{baseURL}}/rental/orders`

**Headers:**

```
Authorization: {{token}}
Content-Type: application/json
```

**Body (Delivery):**

```json
{
  "product": "672130b05c2d123456789abc",
  "rental": {
    "startDate": "2024-12-01T00:00:00Z",
    "endDate": "2024-12-05T00:00:00Z"
  },
  "paymentMethod": "WALLET",
  "delivery": {
    "method": "DELIVERY",
    "address": {
      "streetAddress": "123 Lê Lợi",
      "ward": "Phường 1",
      "district": "Quận 1",
      "city": "TP.HCM",
      "province": "TP.HCM"
    },
    "contactPhone": "0901234567"
  },
  "notes": "Giao hàng buổi chiều"
}
```

**Body (Pickup):**

```json
{
  "product": "672130b05c2d123456789abc",
  "rental": {
    "startDate": "2024-12-01T00:00:00Z",
    "endDate": "2024-12-05T00:00:00Z"
  },
  "paymentMethod": "CASH_ON_DELIVERY",
  "delivery": {
    "method": "PICKUP",
    "contactPhone": "0901234567"
  },
  "notes": "Sẽ đến lấy vào 9h sáng"
}
```

**Test Script:**

```javascript
if (pm.response.code === 200) {
  const response = pm.response.json();
  pm.environment.set('orderId', response.metadata.order._id);
}
```

---

### **Test 3: Xác nhận đơn thuê (Owner)**

**PATCH** `{{baseURL}}/rental/orders/{{orderId}}/confirm`

**Headers:**

```
Authorization: {{owner_token}}
```

**Test Script:**

```javascript
if (pm.response.code === 200) {
  const response = pm.response.json();
  if (response.metadata.contract) {
    pm.environment.set('contractId', response.metadata.contract._id);
  }
}
```

---

### **Test 4: Thanh toán bằng Wallet**

**POST** `{{baseURL}}/rental/orders/{{orderId}}/payment`

**Headers:**

```
Authorization: {{token}}
Content-Type: application/json
```

**Body:**

```json
{
  "paymentMethod": "WALLET"
}
```

---

### **Test 5: Thanh toán bằng Bank Transfer**

**POST** `{{baseURL}}/rental/orders/{{orderId}}/payment`

**Body:**

```json
{
  "paymentMethod": "BANK_TRANSFER",
  "bankTransfer": {
    "bankCode": "VCB",
    "accountNumber": "1234567890",
    "accountName": "NGUYEN VAN A",
    "transferNote": "Thanh toan don thue"
  }
}
```

---

### **Test 6: Lấy danh sách đơn thuê**

**GET** `{{baseURL}}/rental/orders?role=renter&status=PENDING&page=1&limit=10`

**Headers:**

```
Authorization: {{token}}
```

---

### **Test 7: Chi tiết đơn thuê**

**GET** `{{baseURL}}/rental/orders/{{orderId}}`

**Headers:**

```
Authorization: {{token}}
```

---

### **Test 8: Ký hợp đồng (nếu có)**

**PATCH** `{{baseURL}}/rental/contracts/{{contractId}}/sign`

**Headers:**

```
Authorization: {{token}}
Content-Type: application/json
```

**Body:**

```json
{
  "signature": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
}
```

---

### **Test 9: Bắt đầu thuê**

**PATCH** `{{baseURL}}/rental/orders/{{orderId}}/start`

**Headers:**

```
Authorization: {{token}}
```

---

### **Test 10: Trả sản phẩm**

**PATCH** `{{baseURL}}/rental/orders/{{orderId}}/return`

**Headers:**

```
Authorization: {{token}}
Content-Type: application/json
```

**Body:**

```json
{
  "condition": "GOOD",
  "note": "Trả sản phẩm trong tình trạng tốt",
  "images": ["image1.jpg", "image2.jpg"]
}
```

---

## **🔧 Troubleshooting**

### **Lỗi thường gặp:**

1. **500 Error - Transaction not allowed**
   ✅ **Đã sửa:** Loại bỏ MongoDB transactions

2. **400 Bad Request - Validation Error**
   ✅ **Đã sửa:** Cập nhật validation schema theo Order model

3. **Product ID không hợp lệ**
   - Tạo product trước khi test
   - Sử dụng ObjectId hợp lệ (24 ký tự hex)

4. **Token hết hạn**
   - Đăng nhập lại để lấy token mới
   - Kiểm tra Authorization header

---

## **📊 Expected Responses**

### **Successful Order Creation:**

```json
{
  "success": true,
  "message": "Đơn thuê đã được tạo thành công",
  "metadata": {
    "order": {
      "_id": "672130b05c2d123456789abc",
      "orderNumber": "ORD20241029001",
      "status": "PENDING",
      "pricing": {
        "rentalRate": 50000,
        "subtotal": 200000,
        "deposit": 100000,
        "deliveryFee": 20000,
        "total": 320000
      }
    }
  }
}
```

### **Validation Error:**

```json
{
  "success": false,
  "message": "Dữ liệu không hợp lệ",
  "errors": [
    {
      "field": "rental.startDate",
      "message": "Ngày bắt đầu thuê là bắt buộc"
    }
  ]
}
```

---

## **🎯 Test Flow hoàn chỉnh:**

1. **Đăng nhập** → Lấy token
2. **Tạo đơn thuê** → Lấy orderId
3. **Xác nhận đơn** (Owner) → Lấy contractId (nếu có)
4. **Ký hợp đồng** (nếu cần) → Hoàn tất hợp đồng
5. **Thanh toán** → Chuyển trạng thái PAID
6. **Bắt đầu thuê** → Trạng thái ACTIVE
7. **Trả sản phẩm** → Hoàn tất COMPLETED

Server đã được sửa để không sử dụng MongoDB transactions, giờ có thể test bình thường! 🚀
