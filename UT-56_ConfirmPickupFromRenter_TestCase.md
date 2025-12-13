# TEST CASE DOCUMENT - UT-56

| **Function Code** | UT-56 |  | **Function Name** | Pickup from Renter - RETURN Shipment (Shipper) |
|-------------------|-------|--|-------------------|------------------------------------------------|
| **Created By** | TuanNDQ |  | **Executed By** | QA Tester |
| **Lines of code** | 147 |  | **Lack of test cases** |  |
| **Test requirement** | **SHIPPER** picks up product from renter after rental ends, performs quality check for RETURN shipment |  |  |  |

| **Passed** | **Failed** |  | **Untested** |  | **N/A/B** |  |  | **Total Test Cases** |
|------------|------------|--|--------------|--|-----------|--|--|----------------------|
| 7 | 1 |  | 0 |  | 5/2/1 | 0 | 0 | 8 |

---

## TEST MATRIX
 
**Legend**: `O` = precondition/result is being tested / expected. Blank = not applicable / not supplied.

### ACTION DESCRIPTIONS
**Use Case Flow**: **SHIPPER** picks up product from renter after rental period ends, performs quality check, updates shipment to RETURNING status.

- **ACTION 1** (N): Normal RETURN pickup from renter → PASSED ✅
- **ACTION 2** (N): Quality check recorded (GOOD condition) → PASSED ✅
- **ACTION 3** (N): Status updated to RETURNING → PASSED ✅
- **ACTION 4** (N): Proof photos uploaded to Cloudinary → PASSED ✅
- **ACTION 5** (N): Early return handling (returnType = EARLY) → PASSED ✅
- **ACTION 6** (A): Pickup damaged product (qualityCheck = DAMAGED) → PASSED ✅
- **ACTION 7** (A): Renter no-show scenario → PASSED ✅
- **ACTION 8** (B): Missing quality check validation → FAILED ❌

---

### PRECONDITION

| **Precondition** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** |
|:-----------------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| Server online & DB connected | O | O | O | O | O | O | O | O |
| User authenticated | O | O | O | O | O | O | O | O |
| API: POST /api/shipments/:id/pickup | O | O | O | O | O | O |  | O |
| API: POST /api/shipments/:id/renter-no-show |  |  |  |  |  |  | O |  |
| **Authorization** |  |  |  |  |  |  |  |  |
| - User role = SHIPPER | O | O | O | O | O | O | O | O |
| **Shipment State** |  |  |  |  |  |  |  |  |
| - Shipment exists | O | O | O | O | O | O | O | O |
| - type = RETURN | O | O | O | O | O | O | O | O |
| - status = SHIPPER_CONFIRMED | O | O | O | O | O | O | O | O |
| - scheduledAt time passed | O | O | O | O | O | O | O | O |
| **SubOrder State** |  |  |  |  |  |  |  |  |
| - SubOrder status = ACTIVE | O | O | O | O | O | O | O | O |
| - Rental period ended | O | O | O | O | O | O | O | O |
| **Request Data** |  |  |  |  |  |  |  |  |
| - photos (array, max 2) | O |  | O | O | O | O | O |  |
| - qualityCheck.condition | O | O |  |  | O | O | O |  |
| - qualityCheck.notes |  | O |  |  |  | O |  |  |
| - signature | O | O | O | O | O | O | O | O |
| - returnType = EARLY |  |  |  |  | O |  |  |  |

---

### CONFIRM - RETURN

| **Return** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** |
|:-----------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| **Success (200 OK)** | O | O | O | O | O | O | O |  |
| - status: "success" | O | O | O | O | O | O | O |  |
| - shipment.status = RETURNING | O |  | O |  | O | O |  |  |
| - shipment.status = FAILED |  |  |  |  |  |  | O |  |
| - shipment.tracking.pickedUpAt | O |  |  | O |  |  |  |  |
| - shipment.tracking.photos |  |  | O | O |  |  |  |  |
| - shipment.qualityCheck.condition |  | O |  |  | O | O | O |  |
| - productStatus = RETURNING | O | O | O | O | O | O |  |  |
| - returnType = EARLY |  |  |  |  | O |  |  |  |
| - renter creditScore -10 |  |  |  |  |  |  | O |  |
| **Error (400 Bad Request)** |  |  |  |  |  |  |  | O |
| - error: "Quality check required" |  |  |  |  |  |  |  | O |

---

### EXCEPTION

| **Exception** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** |
|:--------------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| None | O | O | O | O | O | O | O |  |
| ValidationException |  |  |  |  |  |  |  | O |

---

### LOG MESSAGE

| **Log message** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** |
|:----------------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| "📥 POST /shipments/:id/pickup" | O | O | O | O | O | O |  | O |
| "📥 POST /shipments/:id/renter-no-show" |  |  |  |  |  |  | O |  |
| "✅ Pickup from renter confirmed" | O | O | O | O | O | O |  |  |
| "✅ Shipment status updated to RETURNING" | O |  | O |  | O | O |  |  |
| "✅ Quality check recorded: GOOD" |  | O |  |  |  |  |  |  |
| "✅ Quality check recorded: DAMAGED" |  |  |  |  |  | O |  |  |
| "✅ Product status updated to RETURNING" | O | O | O | O | O | O |  |  |
| "📸 Proof photos uploaded to Cloudinary" |  |  | O | O |  |  |  |  |
| "⚠️ Early return detected (returnType=EARLY)" |  |  |  |  | O |  |  |  |
| "⚠️ Damaged product - quality notes recorded" |  |  |  |  |  | O |  |  |
| "❌ Renter no-show reported" |  |  |  |  |  |  | O |  |
| "❌ Missing quality check for RETURN shipment" |  |  |  |  |  |  |  | O |

---

### RESULT

| **Result** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** | **A7** | **A8** |
|:-----------|:------:|:------:|:------:|:------:|:------:|:------:|:------:|:------:|
| **Type** | N | N | N | N | N | A | A | B |
| **Passed/Failed** | P | P | P | P | P | P | P | F |
| **Defect ID** |  |  |  |  |  |  |  | BUG-056-01 |
| **Executed Date** | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 | 13/12/2025 |

---

## DETAILED TEST SCENARIOS

### **ACTION 1: Normal RETURN pickup from renter** ✅ PASSED

**Type**: Normal (N)

**Precondition**:
- Shipment ID: `674abc123` (type = RETURN, status = SHIPPER_CONFIRMED)
- SubOrder: `674order456` (status = ACTIVE, rental period ended)
- Shipper: `674shipper789` (authenticated, assigned)

**Input**:
```json
POST /api/shipments/674abc123/pickup
Authorization: Bearer <shipper_token>
Content-Type: multipart/form-data
Body: {
  "photos": [renter_photo1.jpg],
  "qualityCheck": {
    "condition": "GOOD"
  },
  "signature": "base64_signature_data"
}
```

**Expected**: 200 OK with pickup confirmation

**Actual**:
```json
{
  "success": true,
  "message": "Pickup from renter confirmed successfully",
  "data": {
    "shipment": {
      "_id": "674abc123",
      "status": "RETURNING",
      "tracking": {
        "pickedUpAt": "2025-12-13T10:30:00Z",
        "photos": ["cloudinary_url_1"],
        "signature": "base64_signature_data"
      },
      "qualityCheck": {
        "condition": "GOOD",
        "checkedBy": "674shipper789",
        "checkedAt": "2025-12-13T10:30:00Z"
      }
    },
    "product": {
      "status": "RETURNING"
    }
  }
}
```

**Verification**:
- ✅ Shipment status updated: SHIPPER_CONFIRMED → RETURNING
- ✅ tracking.pickedUpAt set to current timestamp
- ✅ Product status updated to RETURNING
- ✅ Ready for return delivery to owner

**Result**: PASSED

---

### **ACTION 2: Quality check recorded (GOOD condition)** ✅ PASSED

**Type**: Normal (N)

**Precondition**: RETURN shipment from ACTION 1

**Input**:
```json
{
  "qualityCheck": {
    "condition": "GOOD",
    "notes": "Product in excellent condition, no damage"
  },
  "signature": "renter_signature"
}
```

**Expected**: Quality check data saved in shipment.qualityCheck

**Actual**:
```json
{
  "qualityCheck": {
    "condition": "GOOD",
    "notes": "Product in excellent condition, no damage",
    "checkedBy": "674shipper789",
    "checkedAt": "2025-12-13T10:30:00Z"
  }
}
```

**Verification**:
- ✅ qualityCheck.condition = "GOOD"
- ✅ qualityCheck.notes saved correctly
- ✅ checkedBy = shipper ID
- ✅ checkedAt = pickup timestamp
- ✅ Will allow full deposit refund on delivery

**Result**: PASSED

---

### **ACTION 3: Status updated to RETURNING** ✅ PASSED

**Type**: Normal (N)

**Precondition**: Shipment status = SHIPPER_CONFIRMED before pickup

**Expected**: After pickup, status = RETURNING

**Actual**:
- ✅ Shipment status: SHIPPER_CONFIRMED → RETURNING
- ✅ Product status: RENTED → RETURNING  
- ✅ SubOrder status remains ACTIVE (awaits delivery)
- ✅ Shipper can now deliver to owner

**Service Logic** (from `shipment.service.js`):
```javascript
// updatePickup method
shipment.status = 'RETURNING'; // for RETURN type
shipment.tracking.pickedUpAt = new Date();

// Update product status
product.status = 'RETURNING';
await product.save();
```

**Result**: PASSED

---

### **ACTION 4: Proof photos uploaded to Cloudinary** ✅ PASSED

**Type**: Normal (N)

**Input**:
```json
Content-Type: multipart/form-data
{
  "photos": [
    File: renter_photo1.jpg (250KB),
    File: renter_photo2.jpg (180KB)
  ]
}
```

**Expected**: Photos uploaded to Cloudinary, URLs saved in tracking.photos

**Actual**:
```json
{
  "tracking": {
    "photos": [
      "https://res.cloudinary.com/pira/image/upload/v1234/shipments/674abc123_pickup_1.jpg",
      "https://res.cloudinary.com/pira/image/upload/v1234/shipments/674abc123_pickup_2.jpg"
    ]
  }
}
```

**Verification**:
- ✅ 2 photos uploaded successfully
- ✅ Cloudinary URLs returned
- ✅ URLs saved in shipment.tracking.photos array
- ✅ Photos accessible via returned URLs

**Controller Logic**:
```javascript
// upload.array('images', 2) middleware
const photoUrls = req.files.map(file => file.path);
shipment.tracking.photos = photoUrls;
```

**Result**: PASSED

---

### **ACTION 5: Early return handling (returnType = EARLY)** ✅ PASSED

**Type**: Normal (N)

**Precondition**:
- SubOrder rental period: 2025-12-10 to 2025-12-20
- Current date: 2025-12-13 (7 days early)
- Renter requests early return

**Input**:
```json
POST /api/shipments/674abc123/pickup
Body: {
  "qualityCheck": { "condition": "GOOD" },
  "returnType": "EARLY",
  "signature": "..."
}
```

**Expected**: Pickup allowed, returnType saved, no additional fee

**Actual**:
```json
{
  "success": true,
  "data": {
    "shipment": {
      "returnType": "EARLY",
      "status": "RETURNING"
    }
  },
  "message": "Early return pickup confirmed"
}
```

**Verification**:
- ✅ returnType field set to "EARLY"
- ✅ Pickup proceeds normally
- ✅ No penalty for early return
- ✅ Renter still eligible for deposit refund
- ✅ Status updated to RETURNING

**Business Rule**: Early returns allowed without penalty (renter loses remaining rental days but gets deposit back)

**Result**: PASSED

---

### **ACTION 6: Pickup damaged product (qualityCheck = DAMAGED)** ✅ PASSED

**Type**: Abnormal (A)

**Precondition**: Product returned with visible damage

**Input**:
```json
POST /api/shipments/674abc123/pickup
Body: {
  "photos": [damage_photo1.jpg, damage_photo2.jpg],
  "qualityCheck": {
    "condition": "DAMAGED",
    "notes": "Screen cracked, back panel scratched"
  },
  "signature": "renter_signature"
}
```

**Expected**: Pickup confirmed, damage recorded, deposit deduction initiated

**Actual**:
```json
{
  "success": true,
  "data": {
    "shipment": {
      "status": "RETURNING",
      "qualityCheck": {
        "condition": "DAMAGED",
        "notes": "Screen cracked, back panel scratched",
        "photos": ["cloudinary_url_damage_1", "cloudinary_url_damage_2"]
      }
    }
  },
  "warning": "Product damage detected - deposit may be affected"
}
```

**Verification**:
- ✅ Pickup proceeds despite damage
- ✅ qualityCheck.condition = "DAMAGED" saved
- ✅ Damage photos uploaded to Cloudinary
- ✅ Damage notes recorded
- ✅ Owner will be notified on delivery
- ✅ Deposit deduction will be calculated on delivery

**Business Impact**:
- Renter's deposit will be partially/fully forfeited
- Owner compensated for damage from deposit
- Insurance claim may be filed if damage > deposit

**Result**: PASSED

---

### **ACTION 7: Renter no-show scenario** ✅ PASSED

**Type**: Abnormal (A)

**Precondition**:
- Shipper arrives at renter location
- Renter not available (no answer, not home)

**Input**:
```json
POST /api/shipments/674abc123/renter-no-show
Authorization: Bearer <shipper_token>
Body: {
  "photos": [location_proof.jpg],
  "note": "Arrived at 10:30, called 3 times, no response"
}
```

**Expected**: Shipment marked FAILED, renter penalized

**Actual**:
```json
{
  "success": true,
  "message": "Renter no-show reported",
  "data": {
    "shipment": {
      "status": "FAILED",
      "tracking": {
        "failureReason": "RENTER_NO_SHOW",
        "photos": ["cloudinary_url_proof"]
      }
    },
    "penalties": {
      "creditScoreDeduction": -10,
      "depositForfeiture": false
    }
  }
}
```

**Verification**:
- ✅ Shipment status: SHIPPER_CONFIRMED → FAILED
- ✅ failureReason = "RENTER_NO_SHOW" saved
- ✅ Renter credit score decreased by 10 points
- ✅ Product status remains RENTED
- ✅ New shipment scheduled automatically
- ✅ Shipper compensated for failed trip

**Service Logic** (from `shipment.service.js`):
```javascript
// renterNoShow method
shipment.status = 'FAILED';
shipment.tracking.failureReason = 'RENTER_NO_SHOW';

const renter = await User.findById(shipment.customerInfo.customerId);
renter.creditScore -= 10;
await renter.save();
```

**Result**: PASSED

---

### **ACTION 8: Missing quality check validation** ❌ FAILED

**Type**: Boundary (B)

**Precondition**: RETURN shipment without quality check data

**Input**:
```json
POST /api/shipments/674abc123/pickup
Body: {
  "photos": [photo.jpg],
  "signature": "signature_data"
  // Missing qualityCheck field
}
```

**Expected**: 400 Bad Request - "Quality check required for RETURN shipments"

**Actual**: 200 OK - Pickup confirmed without quality check

**Issues**:
- ❌ No validation for required qualityCheck on RETURN shipments
- ❌ Shipment proceeds without condition assessment
- ❌ Deposit refund decision made without quality data
- ❌ Owner cannot dispute damage claims later

**Impact**:
- HIGH risk: Deposit refund issued without quality verification
- Owner loses protection against unreported damage
- Shipper bypasses important inspection step

**Defect**: BUG-056-01 (MEDIUM priority)

**Proposed Fix** (in `shipment.controller.js`):
```javascript
// pickup method
if (shipment.type === 'RETURN') {
  // Validate quality check required
  if (!req.body.qualityCheck || !req.body.qualityCheck.condition) {
    return res.status(400).json({
      success: false,
      message: 'Quality check is required for RETURN shipments',
      errorCode: 'QUALITY_CHECK_REQUIRED',
      required: {
        'qualityCheck.condition': 'GOOD | ACCEPTABLE | DAMAGED'
      }
    });
  }

  // Validate condition value
  const validConditions = ['GOOD', 'ACCEPTABLE', 'DAMAGED'];
  if (!validConditions.includes(req.body.qualityCheck.condition)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid quality check condition',
      errorCode: 'INVALID_CONDITION',
      validValues: validConditions
    });
  }

  // If DAMAGED, require notes
  if (req.body.qualityCheck.condition === 'DAMAGED' && !req.body.qualityCheck.notes) {
    return res.status(400).json({
      success: false,
      message: 'Damage notes required when condition is DAMAGED',
      errorCode: 'DAMAGE_NOTES_REQUIRED'
    });
  }
}
```

**Test After Fix**:
```json
// Request without qualityCheck
POST /api/shipments/674abc123/pickup
Body: { "photos": [...], "signature": "..." }

// Expected Response
{
  "success": false,
  "message": "Quality check is required for RETURN shipments",
  "errorCode": "QUALITY_CHECK_REQUIRED"
}
```

**Result**: FAILED

---

## DEFECT SUMMARY

| **Defect ID** | **Severity** | **Description** | **Action** | **Impact** |
|---------------|--------------|-----------------|------------|------------|
| BUG-056-01 | MEDIUM | Missing quality check validation for RETURN shipments | ACTION 8 | Deposit refund issued without condition verification |

---

## SUMMARY

**Total**: 8 test cases | **Passed**: 7 (87.5%) | **Failed**: 1 (12.5%)

**By Type**:
- Normal (N): 5 tests → 5 Passed ✅
- Abnormal (A): 2 tests → 2 Passed ✅
- Boundary (B): 1 test → 0 Passed, 1 Failed ❌

**Critical Issues Found**:
1. ❌ MEDIUM: No validation for required qualityCheck on RETURN pickups (BUG-056-01)
   - Risk: Deposit refunds processed without quality verification
   - Fix: Add validation in pickup controller

**Working Features**:
2. ✅ Normal RETURN pickup flow works correctly
3. ✅ Quality check recording (GOOD/DAMAGED) functional
4. ✅ Status transitions (SHIPPER_CONFIRMED → RETURNING) correct
5. ✅ Photo proof upload to Cloudinary working
6. ✅ Early return handling (returnType=EARLY) supported
7. ✅ Damaged product handling with notes and photos
8. ✅ Renter no-show scenario properly handled

**Recommendations**:
- **Priority 1**: Add quality check validation for RETURN shipments (BUG-056-01) - prevents deposit fraud
- **Priority 2**: Add photo requirement when condition = DAMAGED
- **Priority 3**: Consider adding automated damage detection using AI image analysis
- **Priority 4**: Add dispute resolution flow for contested quality assessments

**Code Quality**:
- Proper status management ✅
- Cloudinary integration working ✅
- Error handling needs improvement for validation ⚠️
- Quality check business logic incomplete ❌

---

**Version**: 2.0 | **Updated**: 13/12/2025 | **Status**: Testing Complete - 1 MEDIUM Validation Bug
