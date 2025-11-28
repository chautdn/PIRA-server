# API Thống Kê Owner

API này cung cấp các endpoint để owner xem thống kê về sản phẩm, đơn hàng và doanh thu của mình.

## Base URL
```
/api/owner/statistics
```

## Authentication
Tất cả các endpoint yêu cầu:
- JWT Token trong header `Authorization: Bearer <token>`
- User role phải là `OWNER`

---

## 1. Thống kê tổng quan

### Endpoint
```
GET /api/owner/statistics/overview
```

### Mô tả
Lấy thống kê tổng quan về sản phẩm, đơn hàng và doanh thu của owner.

### Response
```json
{
  "success": true,
  "message": "Owner overview statistics fetched successfully",
  "data": {
    "products": {
      "total": 25,
      "active": 15,
      "rented": 8,
      "unavailable": 2
    },
    "orders": {
      "total": 150,
      "pending": 5,
      "confirmed": 10,
      "completed": 130,
      "cancelled": 5
    },
    "revenue": {
      "totalRevenue": 45000000,
      "totalDeposit": 15000000,
      "totalShippingFee": 500000,
      "netRevenue": 44500000
    }
  }
}
```

---

## 2. Thống kê sản phẩm chi tiết

### Endpoint
```
GET /api/owner/statistics/products
```

### Mô tả
Lấy danh sách sản phẩm kèm thống kê chi tiết (số lần thuê, doanh thu).

### Query Parameters
| Tham số | Kiểu | Mô tả | Mặc định |
|---------|------|-------|----------|
| `status` | string | Lọc theo trạng thái (`AVAILABLE`, `RENTED`, `UNAVAILABLE`) | - |
| `category` | string | Lọc theo category ID | - |
| `startDate` | string | Ngày bắt đầu (ISO 8601 format) | - |
| `endDate` | string | Ngày kết thúc (ISO 8601 format) | - |
| `page` | number | Số trang | 1 |
| `limit` | number | Số items/trang (1-100) | 10 |
| `sort` | string | Trường để sort | `createdAt` |
| `order` | string | Thứ tự sort (`asc`/`desc`) | `desc` |

### Example Request
```
GET /api/owner/statistics/products?status=AVAILABLE&page=1&limit=10&sort=createdAt&order=desc
```

### Response
```json
{
  "success": true,
  "message": "Product statistics fetched successfully",
  "data": {
    "products": [
      {
        "_id": "product_id",
        "title": "Canon EOS R5",
        "description": "Máy ảnh mirrorless...",
        "status": "AVAILABLE",
        "category": {
          "_id": "category_id",
          "name": "Máy ảnh"
        },
        "pricing": {
          "dailyRate": 500000
        },
        "images": [...],
        "statistics": {
          "rentalCount": 15,
          "totalRevenue": 7500000
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalItems": 25,
      "itemsPerPage": 10
    }
  }
}
```

---

## 3. Thống kê đơn hàng chi tiết

### Endpoint
```
GET /api/owner/statistics/orders
```

### Mô tả
Lấy danh sách đơn hàng kèm thông tin chi tiết.

### Query Parameters
| Tham số | Kiểu | Mô tả | Mặc định |
|---------|------|-------|----------|
| `status` | string | Lọc theo trạng thái đơn hàng | - |
| `startDate` | string | Ngày bắt đầu (ISO 8601 format) | - |
| `endDate` | string | Ngày kết thúc (ISO 8601 format) | - |
| `page` | number | Số trang | 1 |
| `limit` | number | Số items/trang (1-100) | 10 |
| `sort` | string | Trường để sort | `createdAt` |
| `order` | string | Thứ tự sort (`asc`/`desc`) | `desc` |

### Example Request
```
GET /api/owner/statistics/orders?status=COMPLETED&startDate=2024-01-01&endDate=2024-12-31&page=1&limit=10
```

### Response
```json
{
  "success": true,
  "message": "Order statistics fetched successfully",
  "data": {
    "orders": [
      {
        "_id": "suborder_id",
        "subOrderNumber": "SO-2024-001",
        "orderStatus": "COMPLETED",
        "totalAmount": 1500000,
        "totalDepositAmount": 500000,
        "shippingFee": 30000,
        "masterOrder": {
          "_id": "masterorder_id",
          "masterOrderNumber": "MO-2024-001",
          "renter": {
            "_id": "user_id",
            "firstName": "Nguyen",
            "lastName": "Van A",
            "email": "user@example.com",
            "phoneNumber": "0123456789"
          }
        },
        "products": [
          {
            "product": {
              "_id": "product_id",
              "title": "Canon EOS R5",
              "images": [...]
            },
            "quantity": 1,
            "rentalRate": 500000,
            "depositRate": 1000000
          }
        ],
        "createdAt": "2024-01-15T10:30:00Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 15,
      "totalItems": 150,
      "itemsPerPage": 10
    }
  }
}
```

---

## 4. Thống kê doanh thu theo thời gian

### Endpoint
```
GET /api/owner/statistics/revenue
```

### Mô tả
Lấy thống kê doanh thu theo khoảng thời gian và nhóm theo ngày/tuần/tháng/năm.

### Query Parameters
| Tham số | Kiểu | Mô tả | Mặc định |
|---------|------|-------|----------|
| `startDate` | string | Ngày bắt đầu (ISO 8601 format) | - |
| `endDate` | string | Ngày kết thúc (ISO 8601 format) | - |
| `groupBy` | string | Nhóm theo (`day`, `week`, `month`, `year`) | `month` |

### Example Request
```
GET /api/owner/statistics/revenue?startDate=2024-01-01&endDate=2024-12-31&groupBy=month
```

### Response
```json
{
  "success": true,
  "message": "Revenue statistics fetched successfully",
  "data": {
    "summary": {
      "totalRevenue": 45000000,
      "totalDeposit": 15000000,
      "totalShippingFee": 500000,
      "netRevenue": 44500000,
      "totalOrders": 150,
      "averageOrderValue": 300000
    },
    "revenueByPeriod": [
      {
        "period": "2024-01",
        "totalRevenue": 3500000,
        "totalDeposit": 1200000,
        "totalShippingFee": 45000,
        "netRevenue": 3455000,
        "orderCount": 12
      },
      {
        "period": "2024-02",
        "totalRevenue": 4200000,
        "totalDeposit": 1400000,
        "totalShippingFee": 50000,
        "netRevenue": 4150000,
        "orderCount": 15
      }
    ],
    "groupBy": "month"
  }
}
```

---

## 5. Top sản phẩm có doanh thu cao nhất

### Endpoint
```
GET /api/owner/statistics/top-products
```

### Mô tả
Lấy danh sách top sản phẩm có doanh thu cao nhất.

### Query Parameters
| Tham số | Kiểu | Mô tả | Mặc định |
|---------|------|-------|----------|
| `limit` | number | Số lượng sản phẩm top (1-50) | 10 |

### Example Request
```
GET /api/owner/statistics/top-products?limit=5
```

### Response
```json
{
  "success": true,
  "message": "Top revenue products fetched successfully",
  "data": [
    {
      "productId": "product_id_1",
      "title": "Canon EOS R5",
      "images": [...],
      "status": "AVAILABLE",
      "totalRevenue": 7500000,
      "rentalCount": 15,
      "totalQuantityRented": 15
    },
    {
      "productId": "product_id_2",
      "title": "Sony A7 III",
      "images": [...],
      "status": "RENTED",
      "totalRevenue": 6000000,
      "rentalCount": 12,
      "totalQuantityRented": 12
    }
  ]
}
```

---

## 6. Sản phẩm đang cho thuê

### Endpoint
```
GET /api/owner/statistics/currently-rented
```

### Mô tả
Lấy danh sách các sản phẩm đang được cho thuê với thông tin người thuê và thời gian.

### Response
```json
{
  "success": true,
  "message": "Currently rented products fetched successfully",
  "data": [
    {
      "subOrderNumber": "SO-2024-001",
      "orderStatus": "ACTIVE",
      "productId": "product_id",
      "productTitle": "Canon EOS R5",
      "productImages": [...],
      "quantity": 1,
      "rentalRate": 500000,
      "depositRate": 1000000,
      "productStatus": "ACTIVE",
      "rentalPeriod": {
        "startDate": "2024-01-15T00:00:00Z",
        "endDate": "2024-01-25T00:00:00Z",
        "duration": {
          "value": 10,
          "unit": "DAY"
        }
      },
      "renter": {
        "id": "user_id",
        "firstName": "Nguyen",
        "lastName": "Van A",
        "email": "user@example.com",
        "phoneNumber": "0123456789"
      },
      "masterOrderNumber": "MO-2024-001"
    }
  ]
}
```

---

## Status Codes

| Code | Mô tả |
|------|-------|
| 200 | Success |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (not owner role) |
| 500 | Internal Server Error |

---

## Lưu ý

1. **Authentication**: Tất cả endpoint yêu cầu JWT token và role OWNER
2. **Date Format**: Sử dụng ISO 8601 format cho tất cả date parameters (VD: `2024-01-15T00:00:00Z`)
3. **Pagination**: Giới hạn `limit` từ 1-100 items
4. **Revenue Calculation**: 
   - `totalRevenue`: Tổng tiền thuê (không bao gồm cọc)
   - `totalDeposit`: Tổng tiền cọc
   - `netRevenue`: Doanh thu sau khi trừ phí vận chuyển
5. **Order Status**: Chỉ tính các đơn có status là `CONFIRMED`, `COMPLETED`, `SHIPPER_CONFIRMED`, `IN_TRANSIT`, `DELIVERED`, `ACTIVE`, `RETURN_REQUESTED`, `RETURN_SHIPPER_CONFIRMED`, `RETURNING`, `RETURNED`

---

## Example Usage

### Lấy thống kê tổng quan
```javascript
const response = await fetch('http://localhost:5000/api/owner/statistics/overview', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
```

### Lấy doanh thu theo tháng
```javascript
const response = await fetch(
  'http://localhost:5000/api/owner/statistics/revenue?startDate=2024-01-01&endDate=2024-12-31&groupBy=month',
  {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  }
);
const data = await response.json();
```
