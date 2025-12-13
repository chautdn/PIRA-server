# TEST CASE DOCUMENT - UT-54

| **Function Code** | UT-54 |  | **Function Name** | Pickup Shipment (Shipper) |
|-------------------|-------|--|-------------------|---------------------------|
| **Created By** | TuanNDQ |  | **Executed By** | QA Tester |
| **Lines of code** | 45 |  | **Lack of test cases** |  |
| **Test requirement** | **SHIPPER** marks shipment as picked up (IN_TRANSIT status) with proof upload |  |  |  |

| **Passed** | **Failed** |  | **Untested** |  | **N/A/B** |  |  | **Total Test Cases** |
|------------|------------|--|--------------|--|-----------|--|--|----------------------|
| 7 | 2 |  | 0 |  | 5/3/1 | 0 | 0 | 9 |

---

## TEST MATRIX
 
**Legend**: `O` = precondition/result is being tested / expected. Blank = not applicable / not supplied.

### ACTION DESCRIPTIONS
**Use Case Flow**: **SHIPPER** đến lấy sản phẩm từ owner, confirm pickup với photo proof, update shipment status, handle edge cases.

- **ACTION 1** (N): Shipper confirms pickup với photo → PASSED ✅
- **ACTION 2** (N): Shipment status updated to IN_TRANSIT → PASSED ✅
- **ACTION 3** (N): SubOrder product status updated correctly → PASSED ✅
- **ACTION 4** (N): Upload proof via separate endpoint → PASSED ✅
- **ACTION 5** (A): Non-assigned shipper cannot confirm → PASSED ✅
- **ACTION 6** (A): Pickup without accepting first (PENDING status) → FAILED ❌
- **ACTION 7** (A): Report owner no-show → PASSED ✅
- **ACTION 8** (A): Pickup already completed shipment → FAILED ❌
- **ACTION 9** (B): Multiple photos upload validation → PASSED ✅

---

### PRECONDITION

| **Precondition** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** | **A9** |
|:-----------------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| Server online & DB connected | O | O | O | O | O | O | O | O | O |
| User authenticated | O | O | O | O | O | O | O | O | O |
| API: POST /api/shipments/:id/pickup | O | O | O | O | O | O |  | O | O |
| API: POST /api/shipments/:id/proof |  |  |  | O |  |  |  |  | O |
| API: POST /api/shipments/:id/owner-no-show |  |  |  |  |  |  | O |  |  |
| **Authorization** |  |  |  |  |  |  |  |  |  |
| - User role = SHIPPER | O | O | O | O | O | O | O | O | O |
| - User is assigned shipper | O | O | O | O |  | O | O | O | O |
| **Shipment State** |  |  |  |  |  |  |  |  |  |
| - Shipment exists | O | O | O | O | O | O | O | O | O |
| - type = DELIVERY | O | O | O | O | O | O | O | O | O |
| - status = SHIPPER_CONFIRMED | O | O | O | O | O |  | O |  | O |
| - status = PENDING |  |  |  |  |  | O |  |  |  |
| - status = DELIVERED |  |  |  |  |  |  |  | O |  |
| **Request Data** |  |  |  |  |  |  |  |  |  |
| - Photos (optional in body) | O |  |  | O |  |  |  |  | O |
| - Notes | O |  |  | O |  |  | O |  |  |

---

### CONFIRM - RETURN

| **Return** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** | **A9** |
|:-----------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| **Success (200 OK)** | O | O | O | O |  |  | O |  | O |
| - status: "success" | O | O | O | O |  |  | O |  | O |
| - data: shipment object | O | O | O | O |  |  | O |  | O |
| - shipment.status = IN_TRANSIT | O | O | O |  |  |  |  |  | O |
| - shipment.status = FAILED |  |  |  |  |  |  | O |  |  |
| - productStatus updated |  | O | O |  |  |  |  |  |  |
| - proof.imagesBeforeDelivery |  |  |  | O |  |  |  |  | O |
| **Error (400 Bad Request)** |  |  |  |  |  | O |  | O |  |
| - message: validation error |  |  |  |  |  | O |  | O |  |
| **Error (403 Forbidden)** |  |  |  |  | O |  |  |  |  |
| - message: "Not assigned shipper" |  |  |  |  | O |  |  |  |  |

---

### EXCEPTION

| **Exception** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** | **A9** |
|:--------------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| None | O | O | O | O |  |  | O |  | O |
| UnauthorizedException |  |  |  |  | O |  |  |  |  |
| ValidationException |  |  |  |  |  | O |  | O |  |

---

### LOG MESSAGE

| **Log message** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** | **A9** |
|:----------------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| "📥 POST /shipments/:id/pickup" | O | O | O |  | O | O |  | O | O |
| "📥 POST /shipments/:id/proof" |  |  |  | O |  |  |  |  | O |
| "📥 POST /shipments/:id/owner-no-show" |  |  |  |  |  |  | O |  |  |
| "✅ Shipment pickup marked successfully" | O | O | O |  |  |  |  |  | O |
| "✅ SubOrder product status: IN_TRANSIT" |  | O | O |  |  |  |  |  |  |
| "📤 Uploading X image(s) to Cloudinary" |  |  |  | O |  |  |  |  | O |
| "✅ Proof uploaded successfully" |  |  |  | O |  |  |  |  | O |
| "❌ User is not a shipper - access denied" |  |  |  |  | O |  |  |  |  |
| "❌ Cannot mark pickup without status validation" |  |  |  |  |  | O |  |  |  |
| "⚠️ Owner no-show processed" |  |  |  |  |  |  | O |  |  |
| "❌ Cannot pickup - shipment already completed" |  |  |  |  |  |  |  | O |  |

---

### RESULT

| **Result** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** | **A9** |
|:-----------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| **Type** | N | N | N | N | A | A | A | A | B |
| **Passed/Failed** | P | P | P | P | P | F | P | F | P |
| **Defect ID** |  |  |  |  |  | BUG-054-01 |  | BUG-054-02 |  |
| **Executed Date** | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 |

---

## DETAILED TEST SCENARIOS

### **ACTION 1: Shipper confirms pickup với photo** ✅ PASSED

**Type**: Normal (N)

**Input**:
```json
POST /api/shipments/674fship123/pickup
Authorization: Bearer <shipper_token>
Body: {
  "photos": ["optional"]
}
```

**Expected**: 200 OK, pickup confirmed

**Actual**: 
```json
{
  "status": "success",
  "data": {
    "_id": "674fship123",
    "shipmentId": "SHP1733892451abc12",
    "status": "IN_TRANSIT",
    "tracking": {
      "pickedUpAt": "2025-12-13T10:30:00Z",
      "photos": []
    }
  }
}
```
- ✅ 200 OK
- ✅ Status SHIPPER_CONFIRMED → IN_TRANSIT
- ✅ tracking.pickedUpAt recorded
- ✅ Timestamp accurate

**Result**: PASSED

---

### **ACTION 2: Shipment status updated to IN_TRANSIT** ✅ PASSED

**Type**: Normal (N)

**Expected**: Shipment status và SubOrder product status updated

**Actual**:
- ✅ Shipment status = IN_TRANSIT
- ✅ SubOrder.products[productIndex].productStatus = "IN_TRANSIT" (for DELIVERY)
- ✅ SubOrder saved successfully
- ✅ Changes persisted to database

**Result**: PASSED

---

### **ACTION 3: SubOrder product status updated correctly** ✅ PASSED

**Type**: Normal (N)

**Precondition**: 
- Shipment type = DELIVERY
- productIndex = 0

**Expected**: Product status follows shipment type

**Actual**:
- ✅ DELIVERY shipment → productStatus = "IN_TRANSIT"
- ✅ RETURN shipment → productStatus = "RETURNING"
- ✅ Correct status for each type
- ✅ SubOrder.save() called

**Result**: PASSED

---

### **ACTION 4: Upload proof via separate endpoint** ✅ PASSED

**Type**: Normal (N)

**Input**:
```json
POST /api/shipments/674fship123/proof
Authorization: Bearer <shipper_token>
Content-Type: multipart/form-data
Body:
  images: [file1.jpg, file2.jpg]
  notes: "Đã lấy hàng từ chủ, sản phẩm nguyên vẹn"
  geolocation: {"latitude": 10.7769, "longitude": 106.7009}
```

**Expected**: 200 OK, proof uploaded to Cloudinary

**Actual**:
```json
{
  "status": "success",
  "message": "Proof uploaded successfully",
  "data": {
    "shipment": "674fship123",
    "imagesBeforeDelivery": [
      "https://res.cloudinary.com/.../image1.jpg",
      "https://res.cloudinary.com/.../image2.jpg"
    ],
    "imageBeforeDelivery": "https://res.cloudinary.com/.../image1.jpg",
    "geolocation": {"latitude": 10.7769, "longitude": 106.7009},
    "notes": "Đã lấy hàng từ chủ..."
  }
}
```
- ✅ 200 OK
- ✅ Images uploaded to Cloudinary
- ✅ URLs stored in ShipmentProof
- ✅ geolocation recorded
- ✅ Backward compatibility (imageBeforeDelivery = first image)

**Result**: PASSED

---

### **ACTION 5: Non-assigned shipper cannot confirm** ✅ PASSED

**Type**: Abnormal (A)

**Precondition**: Shipment assigned to shipper A, user is shipper B

**Input**:
```json
POST /api/shipments/674fship123/pickup
Authorization: Bearer <shipper_B_token>
```

**Expected**: 403 Forbidden

**Actual**:
- ✅ 403 Forbidden
- ✅ Error: "Only shippers can pick up shipments"
- ✅ Authorization middleware working
- ✅ Shipment not updated

**Result**: PASSED

---

### **ACTION 6: Pickup without accepting first (PENDING status)** ❌ FAILED

**Type**: Abnormal (A)

**Precondition**: Shipment status = PENDING (shipper chưa accept)

**Input**:
```json
POST /api/shipments/674fship456/pickup
Authorization: Bearer <shipper_token>
```

**Expected**: 400 Bad Request - "Must accept shipment first"

**Actual**: 200 OK - Pickup confirmed (không validate status)

**Issues**:
- ❌ Cho phép pickup khi status = PENDING
- ❌ Missing status validation
- ❌ Workflow violation: phải accept → pickup

**Defect**: BUG-054-01 (MEDIUM)

**Proposed Fix**:
```javascript
// In updatePickup service method
const shipment = await Shipment.findById(shipmentId).populate('subOrder');
if (!shipment) throw new Error('Shipment not found');

// ✅ ADD STATUS VALIDATION
if (shipment.status !== 'SHIPPER_CONFIRMED') {
  throw new Error(
    `Cannot mark pickup. Shipment must be in SHIPPER_CONFIRMED status. Current: ${shipment.status}`
  );
}

shipment.status = 'IN_TRANSIT';
// ... rest of code
```

**Result**: FAILED

---

### **ACTION 7: Report owner no-show** ✅ PASSED

**Type**: Abnormal (A)

**Precondition**: Owner không có mặt tại địa chỉ pickup

**Input**:
```json
POST /api/shipments/674fship789/owner-no-show
Authorization: Bearer <shipper_token>
Body: {
  "notes": "Đã đến đúng giờ, gọi điện không bắt máy, chờ 15 phút không thấy"
}
```

**Expected**: 200 OK, shipment marked as FAILED, product status = OWNER_NO_SHOW

**Actual**:
```json
{
  "status": "success",
  "message": "Owner no-show processed",
  "data": {
    "status": "FAILED",
    "tracking": {
      "failureReason": "OWNER_NO_SHOW",
      "notes": "Đã đến đúng giờ..."
    }
  }
}
```
- ✅ 200 OK
- ✅ Shipment status = FAILED
- ✅ SubOrder.products[productIndex].productStatus = "OWNER_NO_SHOW"
- ✅ Owner creditScore decreased
- ✅ SubOrder status analyzed (CANCELLED_BY_OWNER_NO_SHOW or PARTIALLY_CANCELLED)
- ✅ Notifications sent

**Result**: PASSED

---

### **ACTION 8: Pickup already completed shipment** ❌ FAILED

**Type**: Abnormal (A)

**Precondition**: Shipment status = DELIVERED (đã giao xong)

**Input**:
```json
POST /api/shipments/674fship999/pickup
Authorization: Bearer <shipper_token>
```

**Expected**: 400 Bad Request - "Cannot pickup completed shipment"

**Actual**: 500 Internal Server Error (status transition error)

**Issues**:
- ❌ Không handle DELIVERED status
- ❌ Server error thay vì validation error
- ❌ Could corrupt shipment timeline

**Defect**: BUG-054-02 (MEDIUM)

**Proposed Fix**:
```javascript
// In updatePickup service
if (shipment.status === 'DELIVERED' || shipment.status === 'COMPLETED') {
  throw new Error('Cannot pickup an already completed shipment');
}

if (shipment.status !== 'SHIPPER_CONFIRMED') {
  throw new Error(`Invalid status for pickup: ${shipment.status}`);
}
```

**Result**: FAILED

---

### **ACTION 9: Multiple photos upload validation** ✅ PASSED

**Type**: Boundary (B)

**Input**:
```json
POST /api/shipments/674fship111/proof
Authorization: Bearer <shipper_token>
Content-Type: multipart/form-data
Body:
  images: [file1.jpg, file2.jpg] // array of 2 images
  notes: "Multiple angles"
```

**Expected**: 200 OK, both images uploaded

**Actual**:
- ✅ 200 OK
- ✅ Both images uploaded to Cloudinary
- ✅ imagesBeforeDelivery = [url1, url2]
- ✅ imageBeforeDelivery = url1 (backward compat)
- ✅ Middleware: `upload.array('images', 2)` enforces max 2 files
- ✅ Validation: At least 1 image required

**Test with 0 images**:
```json
POST /api/shipments/674fship111/proof
Body: { notes: "No images" }
```
- ✅ 400 Bad Request
- ✅ Error: "At least one image is required"

**Test with 3+ images**:
- ✅ Only first 2 accepted (upload.array limit)

**Result**: PASSED

---

## DEFECT SUMMARY

| **Defect ID** | **Severity** | **Description** | **Action** |
|---------------|--------------|-----------------|------------|
| BUG-054-01 | MEDIUM | Missing status validation - allows pickup from PENDING | ACTION 6 |
| BUG-054-02 | MEDIUM | No validation for completed shipments - causes server error | ACTION 8 |

---

## SUMMARY

**Total**: 9 test cases | **Passed**: 7 (77.8%) | **Failed**: 2 (22.2%)

**By Type**:
- Normal (N): 4 tests → 4 Passed ✅
- Abnormal (A): 4 tests → 2 Passed, 2 Failed ❌
- Boundary (B): 1 test → 1 Passed ✅

**Critical Issues**:
1. ❌ MEDIUM: Status validation missing - workflow integrity risk (BUG-054-01)
2. ❌ MEDIUM: Completed shipment handling causes server error (BUG-054-02)
3. ✅ Owner no-show workflow works correctly
4. ✅ Proof upload system robust
5. ✅ Authorization enforced properly

**Recommendations**:
- Priority 1: Add comprehensive status validation (BUG-054-01, BUG-054-02)
- Priority 2: Add GPS proximity check to owner location
- Priority 3: Add timeout mechanism (auto no-show after X minutes)
- Priority 4: Add real-time tracking updates during pickup

---

**Version**: 3.0 | **Updated**: 13/12/2025 | **Status**: Testing Complete - Medium Priority Bugs Found
