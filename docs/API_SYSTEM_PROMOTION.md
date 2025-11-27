# System Promotion API Documentation

## Overview

System Promotion cho phép Admin tạo các chương trình khuyến mãi giảm phí ship áp dụng cho toàn hệ thống. Khi tạo promotion, tất cả users sẽ nhận được notification và banner sẽ hiển thị trên trang home.

## Base URL

```
/api/system-promotions
```

## Authentication

- **Public routes**: `/active`
- **Authenticated routes**: `/calculate-discount`
- **Admin only routes**: All other routes require `ADMIN` role

---

## Endpoints

### 1. Create System Promotion (Admin)

Tạo system promotion mới và tự động notify tất cả users.

**Endpoint**: `POST /api/system-promotions`

**Headers**:

```
Authorization: Bearer <admin_token>
```

**Request Body**:

```json
{
  "title": "Giảm 50% phí ship",
  "description": "Giảm 50% phí ship cho tất cả đơn hàng trong tháng 12",
  "code": "FREESHIP50",
  "startDate": "2025-12-01T00:00:00.000Z",
  "endDate": "2025-12-31T23:59:59.999Z",
  "systemPromotion": {
    "shippingDiscountValue": 50,
    "discountType": "PERCENTAGE",
    "applyTo": "ALL_ORDERS",
    "minOrderValue": 0
  },
  "banner": {
    "displayOnHome": true,
    "bannerTitle": "🎉 Giảm 50% Phí Ship Tháng 12!",
    "bannerDescription": "Áp dụng cho tất cả đơn hàng. Không giới hạn!",
    "bannerImage": "https://example.com/banner.jpg",
    "backgroundColor": "#4F46E5",
    "textColor": "#FFFFFF"
  }
}
```

**Field Descriptions**:

- `title`: Tên promotion (max 100 ký tự)
- `description`: Mô tả chi tiết (max 500 ký tự)
- `code`: Mã promotion (unique, chữ hoa, 3-20 ký tự)
- `startDate`: Thời gian bắt đầu (ISO 8601)
- `endDate`: Thời gian kết thúc (ISO 8601)
- `systemPromotion.shippingDiscountValue`: Giá trị giảm (số dương)
- `systemPromotion.discountType`: Loại giảm (`PERCENTAGE` | `FIXED_AMOUNT`)
- `systemPromotion.applyTo`: Áp dụng cho (`ALL_ORDERS` | `FIRST_ORDER` | `MIN_ORDER_VALUE`)
- `systemPromotion.minOrderValue`: Giá trị đơn hàng tối thiểu (nếu applyTo = MIN_ORDER_VALUE)
- `banner.displayOnHome`: Hiển thị banner trên trang home (boolean)
- `banner.backgroundColor`: Màu nền banner (hex color: #RRGGBB)
- `banner.textColor`: Màu chữ banner (hex color: #RRGGBB)

**Response** (201):

```json
{
  "success": true,
  "message": "System promotion created successfully",
  "metadata": {
    "_id": "674589abc123def456789012",
    "title": "Giảm 50% phí ship",
    "code": "FREESHIP50",
    "scope": "SYSTEM",
    "status": "ACTIVE",
    "systemPromotion": {
      "isActive": true,
      "discountType": "PERCENTAGE",
      "shippingDiscountValue": 50,
      "applyTo": "ALL_ORDERS",
      "minOrderValue": 0
    },
    "banner": {
      "displayOnHome": true,
      "bannerTitle": "🎉 Giảm 50% Phí Ship Tháng 12!",
      "bannerDescription": "Áp dụng cho tất cả đơn hàng. Không giới hạn!",
      "backgroundColor": "#4F46E5",
      "textColor": "#FFFFFF"
    },
    "createdAt": "2025-11-26T10:00:00.000Z"
  }
}
```

**Auto-triggered Actions**:

1. Tạo notifications cho tất cả active users
2. Emit socket event `system:promotion:created` cho tất cả connected users

---

### 2. Get Active System Promotion (Public)

Lấy system promotion đang active (để hiển thị banner và áp dụng discount).

**Endpoint**: `GET /api/system-promotions/active`

**Response** (200):

```json
{
  "success": true,
  "message": "Active system promotion found",
  "metadata": {
    "_id": "674589abc123def456789012",
    "title": "Giảm 50% phí ship",
    "code": "FREESHIP50",
    "systemPromotion": {
      "isActive": true,
      "discountType": "PERCENTAGE",
      "shippingDiscountValue": 50,
      "applyTo": "ALL_ORDERS"
    },
    "banner": {
      "displayOnHome": true,
      "bannerTitle": "🎉 Giảm 50% Phí Ship Tháng 12!",
      "bannerDescription": "Áp dụng cho tất cả đơn hàng",
      "backgroundColor": "#4F46E5",
      "textColor": "#FFFFFF"
    },
    "startDate": "2025-12-01T00:00:00.000Z",
    "endDate": "2025-12-31T23:59:59.999Z"
  }
}
```

Nếu không có promotion active:

```json
{
  "success": true,
  "message": "No active promotion",
  "metadata": null
}
```

---

### 3. Calculate Shipping Discount (Authenticated)

Preview shipping discount cho user.

**Endpoint**: `POST /api/system-promotions/calculate-discount`

**Headers**:

```
Authorization: Bearer <user_token>
```

**Request Body**:

```json
{
  "shippingFee": 50000,
  "orderTotal": 200000
}
```

**Response** (200):

```json
{
  "success": true,
  "message": "Discount calculated successfully",
  "metadata": {
    "originalFee": 50000,
    "discount": 25000,
    "finalFee": 25000,
    "promotion": {
      "_id": "674589abc123def456789012",
      "code": "FREESHIP50",
      "systemPromotion": {
        "discountType": "PERCENTAGE",
        "shippingDiscountValue": 50
      }
    }
  }
}
```

---

### 4. Get All System Promotions (Admin)

Lấy danh sách tất cả system promotions.

**Endpoint**: `GET /api/system-promotions`

**Headers**:

```
Authorization: Bearer <admin_token>
```

**Query Parameters**:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `status`: Filter by status (`DRAFT` | `ACTIVE` | `EXPIRED` | `DEACTIVATED`)

**Example**: `/api/system-promotions?page=1&limit=10&status=ACTIVE`

**Response** (200):

```json
{
  "success": true,
  "message": "System promotions retrieved successfully",
  "metadata": {
    "promotions": [
      {
        "_id": "674589abc123def456789012",
        "title": "Giảm 50% phí ship",
        "code": "FREESHIP50",
        "status": "ACTIVE",
        "createdBy": {
          "_id": "673456def789abc012345678",
          "name": "Admin User",
          "email": "admin@pira.com"
        },
        "createdAt": "2025-11-26T10:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 1
    }
  }
}
```

---

### 5. Get System Promotion by ID (Admin)

Lấy chi tiết một system promotion.

**Endpoint**: `GET /api/system-promotions/:id`

**Headers**:

```
Authorization: Bearer <admin_token>
```

**Response** (200): Giống response của Create endpoint

---

### 6. Update System Promotion (Admin)

Cập nhật system promotion.

**Endpoint**: `PUT /api/system-promotions/:id`

**Headers**:

```
Authorization: Bearer <admin_token>
```

**Request Body** (partial update):

```json
{
  "title": "Giảm 60% phí ship",
  "systemPromotion": {
    "shippingDiscountValue": 60
  },
  "banner": {
    "bannerTitle": "🎉 Giảm 60% Phí Ship!"
  }
}
```

**Response** (200): Updated promotion object

---

### 7. Deactivate System Promotion (Admin)

Ngừng kích hoạt promotion.

**Endpoint**: `DELETE /api/system-promotions/:id`

**Headers**:

```
Authorization: Bearer <admin_token>
```

**Response** (200):

```json
{
  "success": true,
  "message": "System promotion deactivated successfully",
  "metadata": {
    "_id": "674589abc123def456789012",
    "status": "DEACTIVATED",
    "systemPromotion": {
      "isActive": false
    }
  }
}
```

---

## Real-time Socket Events

### Client → Server: Authenticate

```javascript
socket.emit('authenticate', token);
```

### Server → Client: System Promotion Created

Broadcast đến tất cả connected users khi admin tạo promotion mới.

```javascript
socket.on('system:promotion:created', (data) => {
  console.log(data);
  // {
  //   promotion: {
  //     id: "674589abc123def456789012",
  //     title: "🎉 Giảm 50% Phí Ship!",
  //     message: "Áp dụng cho tất cả đơn hàng",
  //     discountValue: 50,
  //     discountType: "PERCENTAGE",
  //     startDate: "2025-12-01T00:00:00.000Z",
  //     endDate: "2025-12-31T23:59:59.999Z"
  //   },
  //   timestamp: "2025-11-26T10:00:00.123Z"
  // }
});
```

### Server → Client: Promotion Notification

Gửi đến specific user (kèm với notification database record).

```javascript
socket.on('notification:promotion', (data) => {
  // {
  //   notification: { ... },
  //   timestamp: "2025-11-26T10:00:00.123Z"
  // }
});
```

---

## Integration Guide

### Backend: Apply Promotion to SubOrder

Khi tạo SubOrder, tự động check và apply system promotion:

```javascript
const systemPromotionService = require('../services/systemPromotion.service');

// In your SubOrder creation logic
const discountResult = await systemPromotionService.calculateShippingDiscount(subOrder);

if (discountResult.promotion) {
  subOrder.shipping.fee.discount = discountResult.discount;
  subOrder.shipping.fee.finalFee = discountResult.finalFee;
  subOrder.appliedPromotions.push({
    promotion: discountResult.promotion._id,
    promotionType: 'SYSTEM',
    discountAmount: discountResult.discount,
    appliedTo: 'SHIPPING'
  });
  subOrder.pricing.shippingFee = discountResult.finalFee;
}
```

### Frontend: Display Banner

```javascript
// Fetch active promotion
const response = await fetch('/api/system-promotions/active');
const { metadata: promotion } = await response.json();

if (promotion && promotion.banner.displayOnHome) {
  // Display banner on home page
}

// Listen for real-time updates
socket.on('system:promotion:created', (data) => {
  // Refresh banner or show notification
  showToast(`New promotion: ${data.promotion.title}`);
  refreshBanner();
});
```

---

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "message": "Start date must be before end date"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "message": "Admin access required"
}
```

### 404 Not Found

```json
{
  "success": false,
  "message": "System promotion not found"
}
```

---

## Business Rules

1. **Unique Code**: Promotion code must be unique across all promotions
2. **Date Validation**: startDate < endDate, endDate > now
3. **Discount Limits**:
   - PERCENTAGE: 0-100%
   - FIXED_AMOUNT: Cannot exceed actual shipping fee
4. **Single Active Promotion**: Only one system promotion can be active at a time (most recent)
5. **Auto-notification**: All active users receive notification when promotion created
6. **Real-time Broadcast**: Socket event emitted to all connected clients

---

## Examples

### Create PERCENTAGE discount

```bash
curl -X POST http://localhost:5000/api/system-promotions \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Black Friday - Giảm 70% Ship",
    "description": "Giảm 70% phí ship mọi đơn hàng",
    "code": "BLACKFRIDAY70",
    "startDate": "2025-11-29T00:00:00Z",
    "endDate": "2025-11-30T23:59:59Z",
    "systemPromotion": {
      "shippingDiscountValue": 70,
      "discountType": "PERCENTAGE",
      "applyTo": "ALL_ORDERS"
    },
    "banner": {
      "displayOnHome": true,
      "bannerTitle": "🔥 BLACK FRIDAY - 70% OFF SHIP!",
      "bannerDescription": "Chỉ 2 ngày duy nhất!",
      "backgroundColor": "#000000",
      "textColor": "#FFD700"
    }
  }'
```

### Create FIXED_AMOUNT discount

```bash
curl -X POST http://localhost:5000/api/system-promotions \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Giảm cố định 20k ship",
    "description": "Giảm 20,000 VND phí ship cho đơn từ 100k",
    "code": "SHIP20K",
    "startDate": "2025-12-01T00:00:00Z",
    "endDate": "2025-12-15T23:59:59Z",
    "systemPromotion": {
      "shippingDiscountValue": 20000,
      "discountType": "FIXED_AMOUNT",
      "applyTo": "MIN_ORDER_VALUE",
      "minOrderValue": 100000
    },
    "banner": {
      "displayOnHome": true,
      "bannerTitle": "Giảm 20K Phí Ship",
      "bannerDescription": "Áp dụng cho đơn từ 100K",
      "backgroundColor": "#10B981",
      "textColor": "#FFFFFF"
    }
  }'
```

---

## Notes

- Promotion automatically creates notifications for all users
- Socket events allow real-time UI updates without page refresh
- SubOrder automatically applies active promotion during creation
- Banner config controls home page display
- Admin can have multiple promotions but only most recent ACTIVE one applies
