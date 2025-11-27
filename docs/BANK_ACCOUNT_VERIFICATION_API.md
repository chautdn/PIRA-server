# Bank Account Verification API Documentation

## Overview
API endpoints cho Admin để quản lý và xác minh tài khoản ngân hàng của người dùng.

## Base URL
```
/api/admin/bank-accounts
```

## Authentication
Tất cả endpoints yêu cầu:
- Bearer Token trong header
- Role: `ADMIN`

---

## Endpoints

### 1. Get All Bank Accounts
Lấy danh sách tất cả tài khoản ngân hàng với filter và pagination.

**Endpoint:** `GET /api/admin/bank-accounts`

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | Number | No | 1 | Số trang |
| limit | Number | No | 10 | Số lượng items/trang |
| search | String | No | - | Tìm kiếm theo số tài khoản, tên chủ TK, email |
| status | String | No | - | Lọc theo trạng thái: `PENDING`, `VERIFIED`, `REJECTED` |
| bankCode | String | No | - | Lọc theo mã ngân hàng: `VCB`, `TCB`, `BIDV`, etc. |

**Response Success (200):**
```json
{
  "success": true,
  "message": "Lấy danh sách tài khoản ngân hàng thành công",
  "data": {
    "bankAccounts": [
      {
        "_id": "user_id",
        "email": "user@example.com",
        "profile": {
          "firstName": "Nguyen",
          "lastName": "Van A"
        },
        "bankAccount": {
          "bankCode": "VCB",
          "bankName": "Vietcombank",
          "accountNumber": "1234567890",
          "accountHolderName": "NGUYEN VAN A",
          "status": "PENDING",
          "isVerified": false,
          "addedAt": "2024-01-01T00:00:00.000Z",
          "verifiedAt": null,
          "rejectedAt": null,
          "adminNote": null,
          "rejectionReason": null
        },
        "role": "OWNER",
        "status": "ACTIVE"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalBankAccounts": 50,
      "limit": 10
    },
    "stats": {
      "total": 50,
      "pending": 20,
      "verified": 25,
      "rejected": 5
    }
  }
}
```

---

### 2. Get Bank Account by User ID
Lấy chi tiết tài khoản ngân hàng của một user.

**Endpoint:** `GET /api/admin/bank-accounts/:userId`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | String | Yes | MongoDB ObjectId của user |

**Response Success (200):**
```json
{
  "success": true,
  "message": "Lấy chi tiết tài khoản ngân hàng thành công",
  "data": {
    "_id": "user_id",
    "email": "user@example.com",
    "profile": {
      "firstName": "Nguyen",
      "lastName": "Van A",
      "avatar": "avatar_url",
      "dateOfBirth": "1990-01-01",
      "gender": "MALE"
    },
    "bankAccount": {
      "bankCode": "VCB",
      "bankName": "Vietcombank",
      "accountNumber": "1234567890",
      "accountHolderName": "NGUYEN VAN A",
      "status": "PENDING",
      "isVerified": false,
      "addedAt": "2024-01-01T00:00:00.000Z"
    },
    "role": "OWNER",
    "status": "ACTIVE",
    "verification": {
      "emailVerified": true,
      "phoneVerified": true,
      "identityVerified": true
    },
    "cccd": {
      "isVerified": true,
      "fullName": "NGUYEN VAN A",
      "cccdNumber": "001234567890"
    }
  }
}
```

**Response Error (404):**
```json
{
  "success": false,
  "message": "Không tìm thấy người dùng"
}
```

---

### 3. Verify Bank Account
Xác minh tài khoản ngân hàng của user.

**Endpoint:** `PATCH /api/admin/bank-accounts/:userId/verify`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | String | Yes | MongoDB ObjectId của user |

**Request Body:**
```json
{
  "adminNote": "Tài khoản hợp lệ, đã kiểm tra thông tin"
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| adminNote | String | No | Ghi chú của admin |

**Response Success (200):**
```json
{
  "success": true,
  "message": "Xác minh tài khoản ngân hàng thành công",
  "data": {
    "_id": "user_id",
    "email": "user@example.com",
    "bankAccount": {
      "status": "VERIFIED",
      "isVerified": true,
      "verifiedAt": "2024-01-02T00:00:00.000Z",
      "adminNote": "Tài khoản hợp lệ, đã kiểm tra thông tin"
    }
  }
}
```

**Response Error (400):**
```json
{
  "success": false,
  "message": "Tài khoản ngân hàng đã được xác minh"
}
```

---

### 4. Reject Bank Account
Từ chối xác minh tài khoản ngân hàng.

**Endpoint:** `PATCH /api/admin/bank-accounts/:userId/reject`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | String | Yes | MongoDB ObjectId của user |

**Request Body:**
```json
{
  "rejectionReason": "Thông tin không khớp với CCCD"
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| rejectionReason | String | Yes | Lý do từ chối (bắt buộc) |

**Response Success (200):**
```json
{
  "success": true,
  "message": "Từ chối xác minh tài khoản ngân hàng thành công",
  "data": {
    "_id": "user_id",
    "email": "user@example.com",
    "bankAccount": {
      "status": "REJECTED",
      "isVerified": false,
      "rejectedAt": "2024-01-02T00:00:00.000Z",
      "rejectionReason": "Thông tin không khớp với CCCD"
    }
  }
}
```

**Response Error (400):**
```json
{
  "success": false,
  "message": "Vui lòng nhập lý do từ chối"
}
```

---

### 5. Update Bank Account Status
Cập nhật trạng thái tài khoản ngân hàng (tổng quát).

**Endpoint:** `PATCH /api/admin/bank-accounts/:userId/status`

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | String | Yes | MongoDB ObjectId của user |

**Request Body:**
```json
{
  "status": "VERIFIED",
  "note": "Ghi chú hoặc lý do"
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | String | Yes | `PENDING`, `VERIFIED`, `REJECTED` |
| note | String | No | Ghi chú hoặc lý do (tùy status) |

**Response Success (200):**
```json
{
  "success": true,
  "message": "Cập nhật trạng thái tài khoản ngân hàng thành công",
  "data": {
    "_id": "user_id",
    "email": "user@example.com",
    "bankAccount": {
      "status": "VERIFIED",
      "isVerified": true,
      "verifiedAt": "2024-01-02T00:00:00.000Z",
      "adminNote": "Ghi chú hoặc lý do"
    }
  }
}
```

---

## Status Flow

```
PENDING → VERIFIED ✓
PENDING → REJECTED ✓
REJECTED → PENDING ✓
VERIFIED → REJECTED ✓ (nếu cần review lại)
```

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request (missing parameters, invalid status) |
| 401 | Unauthorized (no token) |
| 403 | Forbidden (not admin) |
| 404 | Not Found (user/bank account not found) |
| 500 | Internal Server Error |

## Notes

1. **Xác minh tài khoản ngân hàng:**
   - Kiểm tra tên chủ tài khoản khớp với tên trên CCCD
   - Kiểm tra số tài khoản hợp lệ
   - Kiểm tra mã ngân hàng chính xác

2. **Từ chối tài khoản:**
   - Phải có lý do cụ thể
   - User có thể cập nhật lại thông tin và gửi lại yêu cầu

3. **Statistics:**
   - `total`: Tổng số tài khoản ngân hàng
   - `pending`: Số tài khoản chờ xác minh
   - `verified`: Số tài khoản đã xác minh
   - `rejected`: Số tài khoản bị từ chối

## Example Usage

### cURL Examples

**Get all bank accounts:**
```bash
curl -X GET "http://localhost:8000/api/admin/bank-accounts?page=1&limit=10&status=PENDING" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get bank account detail:**
```bash
curl -X GET "http://localhost:8000/api/admin/bank-accounts/USER_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Verify bank account:**
```bash
curl -X PATCH "http://localhost:8000/api/admin/bank-accounts/USER_ID/verify" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "adminNote": "Tài khoản hợp lệ"
  }'
```

**Reject bank account:**
```bash
curl -X PATCH "http://localhost:8000/api/admin/bank-accounts/USER_ID/reject" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rejectionReason": "Thông tin không khớp"
  }'
```

## Database Schema

### User.bankAccount
```javascript
{
  bankCode: String,           // Mã ngân hàng
  bankName: String,           // Tên ngân hàng
  accountNumber: String,      // Số tài khoản
  accountHolderName: String,  // Tên chủ tài khoản (uppercase)
  status: String,             // PENDING | VERIFIED | REJECTED
  isVerified: Boolean,        // true/false
  addedAt: Date,             // Ngày thêm
  verifiedAt: Date,          // Ngày xác minh
  rejectedAt: Date,          // Ngày từ chối
  adminNote: String,         // Ghi chú của admin
  rejectionReason: String    // Lý do từ chối
}
```
