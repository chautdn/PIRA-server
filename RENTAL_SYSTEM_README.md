# PIRA Rental System - Hệ thống thuê sản phẩm

## Tổng quan

Hệ thống thuê sản phẩm PIRA cho phép người dùng thuê các sản phẩm có giá trị cao với hợp đồng điện tử (e-contract) và chữ ký số.

## Các tính năng chính

### 1. Quản lý đơn thuê

- Tạo đơn thuê mới với thông tin chi tiết
- Xác nhận đơn thuê bởi chủ sở hữu
- Theo dõi trạng thái đơn hàng
- Hủy đơn thuê với lý do

### 2. Hợp đồng điện tử (E-Contract)

- Tự động tạo hợp đồng pháp lý
- Chữ ký số với xác thực bảo mật
- Xuất file PDF hợp đồng đã ký
- Lưu trữ chữ ký người dùng

### 3. Quy trình thanh toán

- Đặt cọc và thanh toán phí thuê
- Tích hợp multiple payment methods
- Hoàn tiền tự động khi trả sản phẩm

### 4. Quản lý thời gian thuê

- Theo dõi thời gian thuê thực tế
- Cảnh báo quá hạn
- Tính phí phạt tự động

## Cấu trúc Models

### Order (Đơn thuê)

```javascript
{
  renter: ObjectId,           // Người thuê
  owner: ObjectId,            // Chủ sở hữu
  product: ObjectId,          // Sản phẩm thuê
  startDate: Date,            // Ngày bắt đầu thuê
  endDate: Date,              // Ngày kết thúc thuê
  pricing: {                  // Cấu trúc giá
    dailyRate: Number,        // Giá thuê theo ngày
    totalDays: Number,        // Tổng số ngày
    baseAmount: Number,       // Tiền thuê cơ bản
    depositAmount: Number,    // Tiền đặt cọc
    totalAmount: Number       // Tổng tiền
  },
  deliveryAddress: {          // Địa chỉ giao hàng
    street: String,
    ward: String,
    district: String,
    city: String
  },
  status: String,             // Trạng thái đơn hàng
  contract: ObjectId          // Hợp đồng liên kết
}
```

### Contract (Hợp đồng)

```javascript
{
  order: ObjectId,            // Đơn hàng liên kết
  owner: ObjectId,            // Chủ sở hữu
  renter: ObjectId,           // Người thuê
  product: ObjectId,          // Sản phẩm
  contractNumber: String,     // Số hợp đồng
  content: {                  // Nội dung hợp đồng
    htmlContent: String,      // HTML content
    pdfUrl: String           // URL file PDF
  },
  signatures: {               // Chữ ký điện tử
    owner: {
      signed: Boolean,
      signature: String,
      signedAt: Date,
      ipAddress: String
    },
    renter: {
      signed: Boolean,
      signature: String,
      signedAt: Date,
      ipAddress: String
    }
  },
  status: String              // Trạng thái hợp đồng
}
```

### Signature (Chữ ký người dùng)

```javascript
{
  user: ObjectId,             // Người dùng
  signatureData: String,      // Dữ liệu chữ ký (base64)
  signatureHash: String,      // Hash của chữ ký
  isActive: Boolean,          // Trạng thái kích hoạt
  usageCount: Number,         // Số lần sử dụng
  metadata: {                 // Thông tin bổ sung
    deviceInfo: String,
    browserInfo: String,
    ipAddress: String
  }
}
```

## API Endpoints

### Đơn thuê (Orders)

- `POST /api/rental/orders` - Tạo đơn thuê mới
- `GET /api/rental/orders` - Lấy danh sách đơn thuê
- `GET /api/rental/orders/:id` - Chi tiết đơn thuê
- `PATCH /api/rental/orders/:id/confirm` - Xác nhận đơn thuê
- `PATCH /api/rental/orders/:id/cancel` - Hủy đơn thuê
- `PATCH /api/rental/orders/:id/start` - Bắt đầu thuê
- `PATCH /api/rental/orders/:id/return` - Trả sản phẩm

### Hợp đồng (Contracts)

- `GET /api/rental/contracts/:id` - Xem hợp đồng
- `PATCH /api/rental/contracts/:id/sign` - Ký hợp đồng
- `GET /api/rental/contracts/:id/download` - Tải PDF

### Thanh toán (Payments)

- `POST /api/rental/orders/:id/payment` - Thanh toán đơn thuê

### Lịch sử (History)

- `GET /api/rental/history` - Lịch sử thuê

## Quy trình nghiệp vụ

### 1. Tạo đơn thuê

```
Người thuê → Tạo đơn thuê → Chờ xác nhận từ chủ sở hữu
```

### 2. Xác nhận và tạo hợp đồng

```
Chủ sở hữu → Xác nhận đơn → Tự động tạo hợp đồng → Gửi thông báo ký
```

### 3. Ký hợp đồng điện tử

```
Chủ sở hữu ký → Người thuê ký → Hợp đồng hoàn tất → Chuyển sang thanh toán
```

### 4. Thanh toán và giao nhận

```
Thanh toán → Giao sản phẩm → Bắt đầu thời gian thuê → Sử dụng
```

### 5. Trả sản phẩm

```
Trả sản phẩm → Kiểm tra tình trạng → Hoàn tiền cọc → Hoàn tất
```

## Bảo mật

### Chữ ký điện tử

- Sử dụng SHA-256 hash cho chữ ký
- Lưu trữ IP address và timestamp
- Rate limiting cho việc ký hợp đồng
- Validation chữ ký format base64

### Authentication & Authorization

- JWT token authentication
- Role-based access control
- IP tracking và device fingerprinting

## Validation

### Input Validation

- Mongoose schema validation
- Express-validator middleware
- Custom business logic validation

### File Upload

- Cloudinary integration cho hình ảnh
- PDF generation với Puppeteer
- File type và size limits

## Error Handling

### Custom Error Classes

- `BadRequestError` - Lỗi request không hợp lệ
- `NotFoundError` - Không tìm thấy resource
- `ForbiddenError` - Không có quyền truy cập
- `ValidationError` - Lỗi validation

### Response Format

```javascript
{
  success: Boolean,
  message: String,
  metadata: Object,
  errors: Array
}
```

## Testing

### Unit Tests

- Model validation tests
- Service logic tests
- Controller endpoint tests

### Integration Tests

- End-to-end rental flow
- Payment integration tests
- Contract signing flow

## Deployment

### Environment Variables

```
MONGODB_URI=mongodb://localhost:27017/pira
JWT_SECRET=your-jwt-secret
CLOUDINARY_URL=your-cloudinary-url
NODE_ENV=production
```

### Dependencies

```json
{
  "puppeteer": "^21.0.0",
  "cloudinary": "^1.40.0",
  "express-rate-limit": "^7.0.0",
  "express-validator": "^7.0.0"
}
```

## Monitoring

### Logs

- Request/Response logging
- Error tracking
- Business event logs

### Metrics

- Rental completion rate
- Contract signing success rate
- Payment processing time
- User engagement metrics
