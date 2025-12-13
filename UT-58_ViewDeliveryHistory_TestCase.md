# TEST CASE DOCUMENT - UT-58

| **Function Code** | UT-58 |  | **Function Name** | View Delivery History (Shipper) |
|-------------------|-------|--|-------------------|----------------------------------|
| **Created By** | TuanNDQ |  | **Executed By** | QA Tester |
| **Lines of code** | 35 |  | **Lack of test cases** |  |
| **Test requirement** | **SHIPPER** can view history of all completed deliveries |  |  |  |

| **Passed** | **Failed** |  | **Untested** |  | **N/A/B** |  |  | **Total Test Cases** |
|------------|------------|--|--------------|--|-----------|--|--|----------------------|
| 5 | 0 |  | 0 |  | 3/1/1 | 0 | 0 | 5 |

---

## TEST MATRIX
 
**Legend**: `O` = precondition/result is being tested / expected. Blank = not applicable / not supplied.

### ACTION DESCRIPTIONS
**Use Case Flow**: **SHIPPER** xem lịch sử các đơn giao hàng đã hoàn thành, filter theo date range, view earnings.

- **ACTION 1** (N): Shipper views delivery history → PASSED ✅
- **ACTION 2** (N): Filter by date range → PASSED ✅
- **ACTION 3** (N): View earnings summary → PASSED ✅
- **ACTION 4** (A): Non-shipper cannot access → PASSED ✅
- **ACTION 5** (B): Empty history handling → PASSED ✅

---

### PRECONDITION

| **Precondition** | **A1** | **A2** | **A3** | **A4** | **A5** |
|:-----------------|:------:|:------:|:------:|:------:|:------:|
| Server online & DB connected | O | O | O | O | O |
| User authenticated | O | O | O | O | O |
| API: GET /api/shipper/delivery-history | O | O | O | O | O |
| **Authorization** |  |  |  |  |  |
| - User role = SHIPPER | O | O | O |  | O |
| **Data State** |  |  |  |  |  |
| - Completed deliveries exist | O | O | O | O |  |
| - Multiple dates |  | O |  |  |  |
| - Payment info available |  |  | O |  |  |

---

### CONFIRM - RETURN

| **Return** | **A1** | **A2** | **A3** | **A4** | **A5** |
|:-----------|:------:|:------:|:------:|:------:|:------:|
| **Success (200 OK)** | O | O | O |  | O |
| - success: true | O | O | O |  | O |
| - data: history array | O | O | O |  | O |
| - filtered by date |  | O |  |  |  |
| - earnings summary |  |  | O |  |  |
| - empty array if no history |  |  |  |  | O |
| **Error (403 Forbidden)** |  |  |  |  |  |
| - error: "Not a shipper" |  |  |  |  |  |

---

### EXCEPTION

| **Exception** | **A1** | **A2** | **A3** | **A4** | **A5** |
|:--------------|:------:|:------:|:------:|:------:|:------:|
| None | O | O | O |  | O |
| UnauthorizedException |  |  |  | O |  |

---

### LOG MESSAGE

| **Log message** | **A1** | **A2** | **A3** | **A4** | **A5** |
|:----------------|:------:|:------:|:------:|:------:|:------:|
| "📥 GET /shipments/my (delivery history)" | O | O | O | O | O |
| "✅ Found X completed shipments for shipper" | O | O | O |  | O |
| "🔍 Applying date range filter: startDate - endDate" |  | O |  |  |  |
| "💰 Calculating earnings summary..." |  |  | O |  |  |
| "✅ Total earnings: X VND from Y deliveries" |  |  | O |  |  |
| "❌ Only shippers can view delivery history" |  |  |  | O |  |
| "ℹ️ No completed deliveries found" |  |  |  |  | O |

---

### RESULT

| **Result** | **A1** | **A2** | **A3** | **A4** | **A5** |
|:-----------|:------:|:------:|:------:|:------:|:------:|
| **Type** | N | N | N | A | B |
| **Passed/Failed** | P | P | P | P | P |
| **Defect ID** |  |  |  |  |  |
| **Executed Date** | 11/12/2025 | 11/12/2025 | 11/12/2025 | 11/12/2025 | 11/12/2025 |

---

## DETAILED TEST SCENARIOS

### **ACTION 1: Shipper views delivery history** ✅ PASSED

**Type**: Normal (N)

**Input**:
```json
GET /api/shipper/delivery-history
Authorization: Bearer <shipper_token>
```

**Expected**: 200 OK với completed deliveries

**Actual**: 
```json
{
  "success": true,
  "data": [
    {
      "_id": "674ftask1",
      "order": {...},
      "completedAt": "2025-12-10T18:00:00Z",
      "deliveryType": "FULL_CYCLE",
      "earnings": 50000,
      "rating": 5
    }
  ],
  "totalDeliveries": 45,
  "totalEarnings": 2250000
}
```
- ✅ 200 OK
- ✅ All completed tasks shown
- ✅ Earnings per task

**Result**: PASSED

---

### **ACTION 2: Filter by date range** ✅ PASSED

**Type**: Normal (N)

**Input**:
```json
GET /api/shipper/delivery-history?startDate=2025-12-01&endDate=2025-12-10
Authorization: Bearer <shipper_token>
```

**Expected**: Only deliveries in range

**Actual**:
- ✅ 200 OK
- ✅ Filtered results correct
- ✅ Earnings recalculated for period

**Result**: PASSED

---

### **ACTION 3: View earnings summary** ✅ PASSED

**Type**: Normal (N)

**Expected**: Earnings breakdown

**Actual**:
```json
{
  "earnings": {
    "thisMonth": 450000,
    "lastMonth": 380000,
    "total": 2250000,
    "pending": 100000,
    "breakdown": {
      "deliveryFees": 2000000,
      "tips": 150000,
      "bonuses": 100000
    }
  }
}
```
- ✅ Complete earnings data
- ✅ Breakdown by type
- ✅ Pending payments shown

**Result**: PASSED

---

### **ACTION 4: Non-shipper cannot access** ✅ PASSED

**Type**: Abnormal (A)

**Input**:
```json
GET /api/shipper/delivery-history
Authorization: Bearer <owner_token>
```

**Expected**: 403 Forbidden

**Actual**:
- ✅ 403 Forbidden
- ✅ Error: "Chỉ shipper mới xem được"
- ✅ Role check works

**Result**: PASSED

---

### **ACTION 5: Empty history handling** ✅ PASSED

**Type**: Boundary (B)

**Precondition**: Shipper mới, chưa complete delivery nào

**Input**:
```json
GET /api/shipper/delivery-history
Authorization: Bearer <new_shipper_token>
```

**Expected**: 200 OK với empty array

**Actual**:
```json
{
  "success": true,
  "data": [],
  "totalDeliveries": 0,
  "totalEarnings": 0,
  "message": "Bạn chưa hoàn thành đơn giao hàng nào"
}
```
- ✅ 200 OK
- ✅ Empty array
- ✅ Helpful message
- ✅ No server error

**Result**: PASSED

---

## DEFECT SUMMARY

| **Defect ID** | **Severity** | **Description** | **Action** |
|---------------|--------------|-----------------|------------|
| N/A | N/A | No defects found | N/A |

---

## SUMMARY

**Total**: 5 test cases | **Passed**: 5 (100%) | **Failed**: 0 (0%)

**By Type**:
- Normal (N): 3 tests → 3 Passed ✅
- Abnormal (A): 1 test → 1 Passed ✅
- Boundary (B): 1 test → 1 Passed ✅

**Critical Issues**:
- ✅ ALL TESTS PASSED
- ✅ History tracking works correctly
- ✅ Earnings calculation accurate

**Recommendations**:
- Add: Export to CSV/PDF
- Add: Performance metrics (on-time rate, ratings)
- Add: Charts for earnings over time

---

**Version**: 2.0 | **Updated**: 11/12/2025 | **Status**: Testing Complete - All Tests Passed ✅
