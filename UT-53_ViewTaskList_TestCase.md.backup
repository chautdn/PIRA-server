# TEST CASE DOCUMENT - UT-53

| **Function Code** | UT-53 |  | **Function Name** | View Shipment List (Shipper) |
|-------------------|-------|--|-------------------|-----------------------------|
| **Created By** | TuanNDQ |  | **Executed By** | QA Tester |
| **Lines of code** | 48 |  | **Lack of test cases** |  |
| **Test requirement** | Shipper can view list of delivery tasks assigned to them |  |  |  |

| **Passed** | **Failed** |  | **Untested** |  | **N/A/B** |  |  | **Total Test Cases** |
|------------|------------|--|--------------|--|-----------|--|--|----------------------|
| 5 | 1 |  | 0 |  | 3/2/1 | 0 | 0 | 6 |

---

## TEST MATRIX
 
**Legend**: `O` = precondition/result is being tested / expected. Blank = not applicable / not supplied.

### ACTION DESCRIPTIONS
**Use Case Flow**: **SHIPPER** xem danh sách delivery tasks được assign, filter theo status (PENDING, IN_PROGRESS, COMPLETED), sort theo priority/date.

- **ACTION 1** (N): Shipper views all assigned tasks → PASSED ✅
- **ACTION 2** (N): Filter tasks by status → PASSED ✅
- **ACTION 3** (N): Tasks sorted by priority → PASSED ✅
- **ACTION 4** (A): Non-shipper cannot view shipper tasks → PASSED ✅
- **ACTION 5** (A): Shipper only sees their tasks → PASSED ✅
- **ACTION 6** (B): Empty task list handling → FAILED ❌

---

### PRECONDITION

| **Precondition** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:-----------------|:------:|:------:|:------:|:------:|:------:|:------:|
| Server online & DB connected | O | O | O | O | O | O |
| User authenticated | O | O | O | O | O | O |
| API: GET /api/shipper/tasks | O | O | O | O | O | O |
| **Authorization** |  |  |  |  |  |  |
| - User role = SHIPPER | O | O | O |  | O | O |
| **Data State** |  |  |  |  |  |  |
| - Tasks assigned to shipper | O | O | O | O | O |  |
| - Multiple task statuses |  | O |  |  |  |  |
| - Different priority levels |  |  | O |  |  |  |
| - No tasks assigned |  |  |  |  |  | O |

---

### CONFIRM - RETURN

| **Return** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:-----------|:------:|:------:|:------:|:------:|:------:|:------:|
| **Success (200 OK)** | O | O | O |  | O |  |
| - success: true | O | O | O |  | O |  |
| - data: tasks array | O | O | O |  | O |  |
| - filtered by status |  | O |  |  |  |  |
| - sorted by priority |  |  | O |  |  |  |
| - only shipper's tasks | O | O | O |  | O |  |
| - empty array if no tasks |  |  |  |  |  | O |
| **Error (403 Forbidden)** |  |  |  |  |  |  |
| - error: "Not a shipper" |  |  |  |  |  |  |

---

### EXCEPTION

| **Exception** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:--------------|:------:|:------:|:------:|:------:|:------:|:------:|
| None | O | O | O |  | O |  |
| UnauthorizedException |  |  |  | O |  |  |
| EmptyDataException |  |  |  |  |  | O |

---

### LOG MESSAGE

| **Log message** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:----------------|:------:|:------:|:------:|:------:|:------:|:------:|
| "✅ Fetching shipper tasks..." | O | O | O | O | O | O |
| "✅ Applying status filter..." |  | O |  |  |  |  |
| "✅ Sorting by priority..." |  |  | O |  |  |  |
| "✅ Tasks retrieved successfully" | O | O | O |  | O |  |
| "❌ Unauthorized: Not a shipper" |  |  |  | O |  |  |
| "⚠️ No tasks assigned" |  |  |  |  |  | O |

---

### RESULT

| **Result** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:-----------|:------:|:------:|:------:|:------:|:------:|:------:|
| **Type** | N | N | N | A | A | B |
| **Passed/Failed** | P | P | P | P | P | F |
| **Defect ID** |  |  |  |  |  | BUG-053-01 |
| **Executed Date** | 11/12/2025 | 11/12/2025 | 11/12/2025 | 11/12/2025 | 11/12/2025 | 11/12/2025 |

---

## DETAILED TEST SCENARIOS

### **ACTION 1: Shipper views all assigned tasks** ✅ PASSED

**Type**: Normal (N)

**Input**:
```json
GET /api/shipper/tasks
Authorization: Bearer <shipper_token>
```

**Expected**: 200 OK với all tasks assigned to shipper

**Actual**: 
```json
{
  "success": true,
  "data": [
    {
      "_id": "674ftask1",
      "type": "PICKUP_FROM_OWNER",
      "order": {...},
      "status": "PENDING",
      "priority": "HIGH",
      "scheduledDate": "2025-12-12",
      "addresses": {
        "from": "123 Nguyen Hue",
        "to": "456 Le Loi"
      }
    }
  ],
  "totalTasks": 15,
  "pendingCount": 8
}
```
- ✅ 200 OK
- ✅ All shipper's tasks returned
- ✅ Task details complete (type, order, addresses)
- ✅ Summary counts included

**Result**: PASSED

---

### **ACTION 2: Filter tasks by status** ✅ PASSED

**Type**: Normal (N)

**Input**:
```json
GET /api/shipper/tasks?status=PENDING
Authorization: Bearer <shipper_token>
```

**Expected**: Only PENDING tasks

**Actual**:
- ✅ 200 OK
- ✅ All returned tasks have status = PENDING
- ✅ IN_PROGRESS and COMPLETED excluded
- ✅ Count matches filter

**Result**: PASSED

---

### **ACTION 3: Tasks sorted by priority** ✅ PASSED

**Type**: Normal (N)

**Input**:
```json
GET /api/shipper/tasks?sortBy=priority
Authorization: Bearer <shipper_token>
```

**Expected**: Tasks ordered: HIGH → MEDIUM → LOW

**Actual**:
```json
{
  "data": [
    { "priority": "HIGH", ... },
    { "priority": "HIGH", ... },
    { "priority": "MEDIUM", ... },
    { "priority": "LOW", ... }
  ]
}
```
- ✅ Correct priority order
- ✅ Urgent tasks on top
- ✅ Sort works as expected

**Result**: PASSED

---

### **ACTION 4: Non-shipper cannot view shipper tasks** ✅ PASSED

**Type**: Abnormal (A)

**Input**:
```json
GET /api/shipper/tasks
Authorization: Bearer <owner_token>
```

**Expected**: 403 Forbidden hoặc empty array

**Actual**:
- ✅ 403 Forbidden
- ✅ Error: "Bạn không phải là shipper"
- ✅ Role-based access control works

**Result**: PASSED

---

### **ACTION 5: Shipper only sees their tasks** ✅ PASSED

**Type**: Abnormal (A)

**Precondition**: 
- Shipper A có 10 tasks
- Shipper B có 15 tasks

**Input**:
```json
GET /api/shipper/tasks
Authorization: Bearer <shipper_A_token>
```

**Expected**: Chỉ 10 tasks của Shipper A

**Actual**:
- ✅ Returns exactly 10 tasks
- ✅ All tasks assigned to Shipper A
- ✅ Shipper B's tasks not visible
- ✅ Data isolation works

**Result**: PASSED

---

### **ACTION 6: Empty task list handling** ❌ FAILED

**Type**: Boundary (B)

**Precondition**: Shipper mới, chưa có tasks assigned

**Input**:
```json
GET /api/shipper/tasks
Authorization: Bearer <new_shipper_token>
```

**Expected**: 200 OK với empty array và helpful message

**Actual**: 500 Internal Server Error

**Issues**:
- ❌ Server crash khi không có tasks
- ❌ Không handle empty result
- ❌ Null reference error

**Error Log**:
```
TypeError: Cannot read property 'length' of undefined
  at getTasks (shipperController.js:45)
```

**Defect**: BUG-053-01 (MEDIUM)

**Proposed Fix**:
```javascript
const tasks = await DeliveryTask.find({ 
  assignedShipper: shipperId 
}).lean();

// Handle empty result
if (!tasks || tasks.length === 0) {
  return res.status(200).json({
    success: true,
    data: [],
    totalTasks: 0,
    message: 'Bạn chưa có đơn giao hàng nào'
  });
}

return res.status(200).json({
  success: true,
  data: tasks,
  totalTasks: tasks.length
});
```

**Result**: FAILED

---

## DEFECT SUMMARY

| **Defect ID** | **Severity** | **Description** | **Action** |
|---------------|--------------|-----------------|------------|
| BUG-053-01 | MEDIUM | Server crash when no tasks assigned - null reference | ACTION 6 |

---

## SUMMARY

**Total**: 6 test cases | **Passed**: 5 (83.3%) | **Failed**: 1 (16.7%)

**By Type**:
- Normal (N): 3 tests → 3 Passed ✅
- Abnormal (A): 2 tests → 2 Passed ✅
- Boundary (B): 1 test → 0 Passed, 1 Failed ❌

**Critical Issues**:
1. ❌ MEDIUM: Empty task list causes server crash
2. ✅ Role-based access control works correctly
3. ✅ Filtering and sorting functional

**Recommendations**:
- Priority 1: Fix null reference error for empty tasks (BUG-053-01)
- Priority 2: Add default sorting (upcoming tasks first)
- Priority 3: Add geolocation-based task suggestions

---

**Version**: 2.0 | **Updated**: 11/12/2025 | **Status**: Testing Complete - Medium Priority Bug Found
