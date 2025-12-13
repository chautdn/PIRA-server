# TEST CASE CORRECTIONS SUMMARY

**Date**: 13/12/2025  
**Reviewed By**: System Analysis  
**Actual Implementation**: PIRA Shipment System

---

## MAJOR DISCREPANCIES FOUND

### 1. **API Endpoints - COMPLETELY DIFFERENT**

#### ❌ **Test Cases Used (WRONG)**:
```
POST /api/shipper/tasks/:id/confirm-pickup-owner
POST /api/shipper/tasks/:id/confirm-delivery-renter  
POST /api/shipper/tasks/:id/confirm-pickup-renter
POST /api/shipper/tasks/:id/confirm-return-owner
GET /api/shipper/tasks
GET /api/shipper/delivery-history
POST /api/shipper/tasks/:id/confirm
```

#### ✅ **Actual Implementation**:
```
POST /api/shipments/:id/accept          # Shipper nhận đơn
POST /api/shipments/:id/pickup          # Đánh dấu đã lấy hàng (PENDING → IN_TRANSIT)
POST /api/shipments/:id/deliver         # Đánh dấu đã giao (IN_TRANSIT → DELIVERED)
POST /api/shipments/:id/confirm         # Renter xác nhận nhận hàng
GET /api/shipments/my                   # Danh sách shipments của shipper
GET /api/shipments/available            # Shipments PENDING chưa có shipper
POST /api/shipments/:shipmentId/proof   # Upload ảnh chứng minh (multipart)
GET /api/shipments/:shipmentId/proof    # Lấy ảnh chứng minh

# Additional actions:
POST /api/shipments/:id/cancel-pickup   # Hủy pickup
POST /api/shipments/:id/reject-delivery # Từ chối giao (sản phẩm có vấn đề)
POST /api/shipments/:id/owner-no-show   # Chủ không có mặt
POST /api/shipments/:id/renter-no-show  # Người thuê không có mặt
POST /api/shipments/:id/return-failed   # Trả hàng thất bại
```

---

### 2. **Terminology - TASKS vs SHIPMENTS**

#### ❌ **Test Cases Used**:
- "DeliveryTask" model
- "Task status"
- "Task assignment"
- Separate tasks for each step: pickup_from_owner, delivery_to_renter, pickup_from_renter, return_to_owner

#### ✅ **Actual Implementation**:
- **Shipment** model
- **Shipment status**
- **Shipment assignment**
- **Only 2 shipment types**:
  - `DELIVERY` (owner → renter)
  - `RETURN` (renter → owner)

---

### 3. **Status Flow - COMPLETELY DIFFERENT**

#### ❌ **Test Cases Assumed**:
```
PENDING → ASSIGNED → IN_PROGRESS → COMPLETED
```

#### ✅ **Actual Implementation**:
```
Status Flow:
PENDING                # Chờ shipper nhận
  ↓ [shipper accepts]
SHIPPER_CONFIRMED     # Shipper đã nhận đơn
  ↓ [shipper picks up]
IN_TRANSIT            # Đang vận chuyển
  ↓ [shipper delivers]
DELIVERED             # Đã giao thành công

Alternative flows:
PENDING → CANCELLED         # Hủy đơn
IN_TRANSIT → DELIVERY_FAILED # Giao thất bại (sản phẩm có vấn đề)
IN_TRANSIT → FAILED          # Không liên lạc được
```

---

### 4. **Workflow - SIMPLIFIED IN REALITY**

#### ❌ **Test Cases Assumed**:
- 4 separate confirmations for DELIVERY cycle
- 4 separate confirmations for RETURN cycle  
- Total 8 API calls for full rental cycle

#### ✅ **Actual Implementation**:
**For DELIVERY shipment** (owner → renter):
1. Owner creates shipment (or auto-created after contract signed)
2. Shipper accepts: `POST /shipments/:id/accept`
3. Shipper marks pickup: `POST /shipments/:id/pickup` 
4. Shipper uploads proof: `POST /shipments/:shipmentId/proof` (optional but recommended)
5. Shipper marks delivered: `POST /shipments/:id/deliver`
6. Renter confirms: `POST /shipments/:id/confirm`

**For RETURN shipment** (renter → owner):
- Same flow, just type='RETURN'
- 3-4 API calls per shipment type

---

### 5. **Data Models**

#### ❌ **Test Cases Assumed**:
```javascript
DeliveryTask {
  taskId, type, status, assignedShipper,
  order, addresses, scheduledDate
}
```

#### ✅ **Actual Implementation**:
```javascript
Shipment {
  shipmentId: String (unique: "SHP1733892451abc12")
  subOrder: ObjectId (ref: SubOrder)
  productId: ObjectId
  productIndex: Number
  shipper: ObjectId (ref: User)
  type: 'DELIVERY' | 'RETURN'
  returnType: 'NORMAL' | 'EARLY' (if RETURN)
  status: PENDING | SHIPPER_CONFIRMED | IN_TRANSIT | DELIVERED | DELIVERY_FAILED | FAILED | CANCELLED
  fromAddress: { streetAddress, ward, district, city, coordinates }
  toAddress: { ... }
  contactInfo: { name, phone, notes }
  customerInfo: { userId, name, phone, email }
  scheduledAt: Date
  tracking: {
    pickedUpAt, deliveredAt,
    notes, photos[], signature,
    failureReason, notificationSentAt
  }
  fee: Number
  qualityCheck: { condition, notes, photos[], checkedBy, checkedAt }
}

ShipmentProof {
  shipment: ObjectId
  imagesBeforeDelivery: [String]  // Cloudinary URLs
  imagesAfterDelivery: [String]
  imageBeforeDelivery: String     // Backward compat
  imageAfterDelivery: String
  geolocation: { latitude, longitude }
  notes: String
}
```

---

### 6. **Authorization & Roles**

#### ✅ **Correctly Enforced**:
- Only SHIPPER role can:
  - Accept shipments
  - Mark pickup
  - Mark delivered
  - Upload proof
  - Report issues (no-show, failed, etc.)

- Middleware check: `authMiddleware.checkUserRole(['SHIPPER'])`

---

### 7. **Photo Proof Handling**

#### ❌ **Test Cases Assumed**:
- Photos sent with each action (pickup, deliver)
- Base64 encoded in request body

#### ✅ **Actual Implementation**:
- **Separate endpoint**: `POST /api/shipments/:shipmentId/proof`
- **Multipart upload**: `upload.array('images', 2)`
- **Cloudinary storage**: Images uploaded to cloud
- **Two phases**:
  - `SHIPPER_CONFIRMED` → imagesBeforeDelivery
  - `IN_TRANSIT` → imagesAfterDelivery
- **ShipmentProof** model stores URLs

---

### 8. **Payment & Wallet Integration**

#### ✅ **Actually Implemented** (but not in test cases):
When `DELIVERY` shipment marked as DELIVERED:
- 80% of rental fee → owner's frozen wallet (24h hold)
- Transfers via SystemWalletService

When `RETURN` shipment marked as DELIVERED:
- Deposit refunded → renter's frozen wallet (24h hold)
- SubOrder status → COMPLETED
- MasterOrder status → COMPLETED (if all suborders done)

---

### 9. **Notifications & Emails**

#### ✅ **Actually Implemented**:
- Socket.io real-time events: `chatGateway.emitShipmentCreated()`
- Email scheduling:
  - If shipment tomorrow → send email now
  - If > 1 day away → schedule for 1 day before at 9 AM
  - If today or past → send immediately

---

### 10. **Additional Features NOT in Test Cases**

#### ✅ **Implemented but not tested**:
1. **List available shippers by location**:
   ```
   GET /api/shipments/shippers?ward=...&district=...&city=...
   ```

2. **Bulk shipment creation**:
   ```
   POST /api/shipments/order/:masterOrderId/create-shipments
   ```
   Creates DELIVERY + RETURN shipments for all products

3. **Get shipments by order**:
   ```
   GET /api/shipments/order/:masterOrderId
   ```

4. **Problem reporting**:
   - `POST /shipments/:id/owner-no-show`
   - `POST /shipments/:id/renter-no-show`
   - `POST /shipments/:id/reject-delivery`
   - `POST /shipments/:id/return-failed`

5. **Quality check** (for RETURN shipments):
   - `qualityCheck.condition`: EXCELLENT | GOOD | FAIR | DAMAGED
   - Photos, notes, checker info

---

## SUMMARY OF REQUIRED CHANGES

### Test Files to Update:
1. ✅ UT-53: ViewTaskList → View Shipment List
2. ✅ UT-54: ConfirmPickupFromOwner → Pickup Shipment  
3. ✅ UT-55: ConfirmDeliveryToRenter → Mark Delivered
4. ✅ UT-56: ConfirmPickupFromRenter → (MERGED with UT-54)
5. ✅ UT-57: ConfirmReturnToOwner → (MERGED with UT-55)
6. ✅ UT-58: ViewDeliveryHistory → (CORRECT concept but wrong API)
7. ✅ UT-59: ConfirmTask → Accept Shipment

### Key Changes Needed:
- ✅ Replace `/api/shipper/tasks/*` with `/api/shipments/*`
- ✅ Replace "task" terminology with "shipment"
- ✅ Update status names and flow
- ✅ Merge pickup/delivery tests (same endpoints for DELIVERY/RETURN)
- ✅ Add ShipmentProof upload tests
- ✅ Add problem reporting tests
- ✅ Update preconditions and expected results
- ✅ Fix test data to match actual models

---

## CORRECT API USAGE EXAMPLES

### Shipper Workflow - DELIVERY:

```javascript
// 1. View available shipments
GET /api/shipments/available
Authorization: Bearer <shipper_token>

Response:
{
  "status": "success",
  "data": {
    "DELIVERY": [...],
    "RETURN": [...]
  }
}

// 2. Accept a shipment
POST /api/shipments/674fship123/accept
Authorization: Bearer <shipper_token>

Response: {
  "status": "success",
  "data": { /* shipment with status: SHIPPER_CONFIRMED */ }
}

// 3. Mark pickup (at owner location)
POST /api/shipments/674fship123/pickup
Authorization: Bearer <shipper_token>
Body: {
  "photos": ["optional"]
}

Response: {
  "status": "success",
  "data": { /* shipment with status: IN_TRANSIT */ }
}

// 4. Upload proof photos (recommended)
POST /api/shipments/674fship123/proof
Authorization: Bearer <shipper_token>
Content-Type: multipart/form-data
Body:
  images: [file1.jpg, file2.jpg]
  notes: "Đã lấy hàng từ chủ"
  geolocation: {"latitude": 10.7769, "longitude": 106.7009}

Response: {
  "status": "success",
  "data": { /* ShipmentProof with Cloudinary URLs */ }
}

// 5. Mark delivered (at renter location)
POST /api/shipments/674fship123/deliver
Authorization: Bearer <shipper_token>
Body: {
  "photos": ["optional"]
}

Response: {
  "status": "success",
  "data": { /* shipment with status: DELIVERED, SubOrder: ACTIVE */ }
}

// 6. Renter confirms (separate endpoint)
POST /api/shipments/674fship123/confirm
Authorization: Bearer <renter_token>

Response: { /* shipment confirmed, payment released */ }
```

---

## RECOMMENDATIONS

### For Test Case Writers:
1. **Always check actual controller code** before writing tests
2. **Use correct API endpoints** from routes file
3. **Match actual data models** from models folder
4. **Test actual status flow** from service logic
5. **Include all edge cases** from implementation (no-show, failed, etc.)

### For Developers:
1. **Document API** in OpenAPI/Swagger format
2. **Keep tests synchronized** with code changes
3. **Add integration tests** that match real flows
4. **Test with actual database** data

---

**Status**: Analysis Complete ✅  
**Next Steps**: Update all 7 test case files with correct information  
**Priority**: HIGH - Test cases currently misleading
