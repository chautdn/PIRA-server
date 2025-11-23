# API Documentation - Luồng Nghiệp Vụ Thuê Sản Phẩm

## Tổng quan

Luồng nghiệp vụ thuê sản phẩm trong hệ thống PIRA bao gồm 7 bước chính:

1. **Người thuê chọn sản phẩm** - Thêm vào giỏ thuê, hệ thống gom theo chủ cho thuê
2. **Chọn thời gian và hình thức nhận hàng** - Điền thông tin thuê và địa chỉ
3. **Tính phí ship** - Sử dụng VietMap API để tính khoảng cách và phí vận chuyển
4. **Tạo đơn thuê tạm** - Tạo MasterOrder và các SubOrder theo chủ
5. **Xác nhận và thanh toán** - Người thuê thanh toán qua nền tảng
6. **Chủ xác nhận đơn** - Các chủ cho thuê xác nhận hoặc từ chối
7. **Ký hợp đồng điện tử** - Tạo và ký hợp đồng 3 bên

---

## Base URL

```
http://localhost:5000/api/rental-orders
```

## Authentication

Tất cả các endpoint đều yêu cầu JWT token trong header:

```
Authorization: Bearer <token>
```

---

## API Endpoints

### 1. Tạo Đơn Thuê Tạm (Draft Order)

**Endpoint:** `POST /create-draft`

**Mô tả:** Tạo đơn thuê từ giỏ hàng, bao gồm tính phí ship và nhóm sản phẩm theo chủ.

**Request Body:**

```json
{
  "rentalPeriod": {
    "startDate": "2024-12-01T00:00:00Z",
    "endDate": "2024-12-05T00:00:00Z"
  },
  "deliveryAddress": {
    "streetAddress": "123 Nguyen Van A",
    "ward": "Phường 1",
    "district": "Quận 1",
    "city": "TP.HCM",
    "province": "Hồ Chí Minh",
    "latitude": 10.762622,
    "longitude": 106.660172,
    "contactPhone": "0123456789",
    "contactName": "Nguyen Van B"
  },
  "deliveryMethod": "DELIVERY" // hoặc "PICKUP"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Tạo đơn thuê tạm thành công",
  "metadata": {
    "masterOrder": {
      "_id": "674123...",
      "masterOrderNumber": "MO1732000001ABCD",
      "renter": "673abc...",
      "subOrders": [
        {
          "_id": "674124...",
          "subOrderNumber": "SO1732000001EFGH",
          "owner": {
            "_id": "673def...",
            "profile": {
              "fullName": "Chủ A",
              "phone": "0987654321"
            }
          },
          "products": [
            {
              "product": {
                "_id": "672ghi...",
                "name": "Máy ảnh Canon EOS R5",
                "images": ["image1.jpg"],
                "price": 500000
              },
              "quantity": 1,
              "rentalRate": 500000,
              "totalRental": 2000000,
              "totalDeposit": 5000000
            }
          ],
          "pricing": {
            "subtotalRental": 2000000,
            "subtotalDeposit": 5000000,
            "shippingFee": 25000,
            "totalAmount": 7025000
          },
          "shipping": {
            "distance": 3.2,
            "estimatedTime": 15,
            "fee": {
              "baseFee": 10000,
              "pricePerKm": 5000,
              "totalFee": 25000
            }
          },
          "status": "DRAFT"
        }
      ],
      "totalAmount": 2000000,
      "totalDepositAmount": 5000000,
      "totalShippingFee": 25000,
      "status": "DRAFT"
    }
  }
}
```

---

### 2. Xác Nhận Đơn Hàng

**Endpoint:** `POST /:masterOrderId/confirm`

**Mô tả:** Xác nhận đơn hàng và chuyển sang trạng thái chờ thanh toán.

**Response:**

```json
{
  "success": true,
  "message": "Xác nhận đơn hàng thành công",
  "metadata": {
    "masterOrder": {
      "_id": "674123...",
      "status": "PENDING_PAYMENT"
    }
  }
}
```

---

### 3. Thanh Toán

**Endpoint:** `POST /:masterOrderId/payment`

**Request Body:**

```json
{
  "method": "PAYOS", // hoặc "WALLET", "BANK_TRANSFER"
  "transactionId": "TXN123456789",
  "amount": 7025000
}
```

**Response:**

```json
{
  "success": true,
  "message": "Thanh toán thành công",
  "metadata": {
    "masterOrder": {
      "_id": "674123...",
      "paymentStatus": "PAID",
      "status": "PENDING_CONFIRMATION"
    }
  }
}
```

---

### 4. Chủ Xác Nhận Đơn Hàng

**Endpoint:** `POST /sub-orders/:subOrderId/owner-confirm`

**Mô tả:** Chủ cho thuê xác nhận hoặc từ chối đơn hàng.

**Request Body:**

```json
{
  "status": "CONFIRMED", // hoặc "REJECTED"
  "notes": "Sản phẩm sẵn sàng giao",
  "rejectionReason": "" // bắt buộc nếu REJECTED
}
```

**Response:**

```json
{
  "success": true,
  "message": "Xác nhận đơn hàng thành công",
  "metadata": {
    "subOrder": {
      "_id": "674124...",
      "status": "OWNER_CONFIRMED",
      "ownerConfirmation": {
        "status": "CONFIRMED",
        "confirmedAt": "2024-11-20T10:30:00Z",
        "notes": "Sản phẩm sẵn sàng giao"
      }
    }
  }
}
```

---

### 5. Tạo Hợp Đồng

**Endpoint:** `POST /:masterOrderId/generate-contracts`

**Mô tả:** Tạo hợp đồng điện tử sau khi tất cả chủ đã xác nhận.

**Response:**

```json
{
  "success": true,
  "message": "Tạo hợp đồng thành công",
  "metadata": {
    "contracts": [
      {
        "_id": "674125...",
        "contractNumber": "CT20241120001",
        "owner": "673def...",
        "renter": "673abc...",
        "product": "672ghi...",
        "status": "PENDING_SIGNATURE",
        "terms": {
          "startDate": "2024-12-01T00:00:00Z",
          "endDate": "2024-12-05T00:00:00Z",
          "rentalRate": 2000000,
          "deposit": 5000000
        }
      }
    ]
  }
}
```

---

### 6. Ký Hợp Đồng Điện Tử

**Endpoint:** `POST /contracts/:contractId/sign`

**Request Body:**

```json
{
  "signature": "base64_signature_data",
  "agreementConfirmed": true,
  "signatureMethod": "ELECTRONIC" // hoặc "OTP"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Ký hợp đồng thành công",
  "metadata": {
    "contract": {
      "_id": "674125...",
      "status": "SIGNED", // hoặc "PENDING_RENTER" nếu chưa đủ chữ ký
      "signatures": {
        "owner": {
          "signed": true,
          "signedAt": "2024-11-20T11:00:00Z"
        },
        "renter": {
          "signed": true,
          "signedAt": "2024-11-20T11:15:00Z"
        }
      },
      "signedAt": "2024-11-20T11:15:00Z"
    }
  }
}
```

---

## Query Endpoints

### Lấy Danh Sách Đơn Hàng (Người Thuê)

**Endpoint:** `GET /my-orders`

**Query Parameters:**

- `status` - Trạng thái đơn hàng
- `page` - Trang (default: 1)
- `limit` - Số lượng/trang (default: 10)

**Response:**

```json
{
  "success": true,
  "message": "Lấy danh sách đơn hàng thành công",
  "metadata": {
    "orders": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

---

### Lấy Danh Sách Đơn Hàng (Chủ Cho Thuê)

**Endpoint:** `GET /owner-orders`

**Query Parameters:** Giống như `/my-orders`

---

### Lấy Chi Tiết Đơn Hàng

**Endpoint:** `GET /:masterOrderId`

**Response:** Thông tin chi tiết MasterOrder với tất cả SubOrder và Contract

---

### Lấy Danh Sách Hợp Đồng

**Endpoint:** `GET /contracts`

**Query Parameters:**

- `status` - Trạng thái hợp đồng
- `page`, `limit` - Phân trang

---

## Utility Endpoints

### Tính Phí Ship Preview

**Endpoint:** `POST /calculate-shipping`

**Request Body:**

```json
{
  "ownerAddress": {
    "streetAddress": "456 Le Van Sy",
    "latitude": 10.799015,
    "longitude": 106.663445
  },
  "deliveryAddress": {
    "streetAddress": "123 Nguyen Van A",
    "latitude": 10.762622,
    "longitude": 106.660172
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Tính phí ship thành công",
  "metadata": {
    "shipping": {
      "distance": 4.7,
      "estimatedTime": 18,
      "fee": {
        "baseFee": 10000,
        "pricePerKm": 5000,
        "calculatedFee": 33500,
        "breakdown": {
          "base": 10000,
          "distance": 23500,
          "total": 33500
        }
      }
    }
  }
}
```

---

### Hủy Đơn Hàng

**Endpoint:** `PUT /:masterOrderId/cancel`

**Request Body:**

```json
{
  "reason": "Không cần thuê nữa"
}
```

---

## Trạng Thái (Status) Workflow

### MasterOrder Status:

```
DRAFT → PENDING_PAYMENT → PAYMENT_COMPLETED → PENDING_CONFIRMATION
→ READY_FOR_CONTRACT → CONTRACT_SIGNED → PROCESSING → DELIVERED
→ ACTIVE → COMPLETED
```

### SubOrder Status:

```
DRAFT → PENDING_OWNER_CONFIRMATION → OWNER_CONFIRMED → READY_FOR_CONTRACT
→ CONTRACT_SIGNED → PROCESSING → SHIPPED → DELIVERED → ACTIVE
→ RETURNED → COMPLETED
```

### Contract Status:

```
DRAFT → PENDING_SIGNATURE → PENDING_OWNER/PENDING_RENTER → SIGNED
→ ACTIVE → COMPLETED
```

---

## Error Codes

| Code | Message      | Mô tả                                        |
| ---- | ------------ | -------------------------------------------- |
| 400  | Bad Request  | Dữ liệu đầu vào không hợp lệ                 |
| 401  | Unauthorized | Chưa đăng nhập                               |
| 403  | Forbidden    | Không có quyền truy cập                      |
| 404  | Not Found    | Không tìm thấy tài nguyên                    |
| 409  | Conflict     | Xung đột dữ liệu (VD: sản phẩm đã được thuê) |

---

## VietMap API Integration

Hệ thống tích hợp VietMap API để:

- Tính khoảng cách giữa 2 điểm
- Ước lượng thời gian di chuyển
- Tính phí vận chuyển tự động
- Geocoding địa chỉ thành tọa độ

**Cấu hình:**

- API Key: `VIETMAP_API_KEY` trong `.env`
- Base URL: `https://maps.vietmap.vn/api`
- Fallback: Tính khoảng cách Haversine nếu API lỗi

---

## Notes

1. **Bảo mật:** Tất cả API đều cần authentication
2. **Validation:** Sử dụng express-validator cho input validation
3. **Transaction:** Các thao tác quan trọng sử dụng MongoDB transaction
4. **Caching:** Redis cache cho dữ liệu thường xuyên truy cập
5. **Logging:** Morgan + Winston để log request/response
6. **Rate Limiting:** Giới hạn số request/IP để tránh spam
