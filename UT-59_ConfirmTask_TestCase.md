# TEST CASE DOCUMENT - UT-59

| **Function Code** | UT-59 |  | **Function Name** | Confirm Task (Shipper) |
|-------------------|-------|--|-------------------|------------------------|
| **Created By** | TuanNDQ |  | **Executed By** | QA Tester |
| **Lines of code** | 42 |  | **Lack of test cases** |  |
| **Test requirement** | **SHIPPER** confirms accepting/completing any delivery task |  |  |  |

| **Passed** | **Failed** |  | **Untested** |  | **N/A/B** |  |  | **Total Test Cases** |
|------------|------------|--|--------------|--|-----------|--|--|----------------------|
| 4 | 2 |  | 0 |  | 3/2/1 | 0 | 0 | 6 |

---

## TEST MATRIX
 
**Legend**: `O` = precondition/result is being tested / expected. Blank = not applicable / not supplied.

### ACTION DESCRIPTIONS
**Use Case Flow**: **SHIPPER** accept task assignment, update status, confirm ready to start, validate task constraints.

- **ACTION 1** (N): Shipper accepts task assignment → PASSED ✅
- **ACTION 2** (N): Task status updated to ASSIGNED → PASSED ✅
- **ACTION 3** (N): Shipper notified of task details → PASSED ✅
- **ACTION 4** (A): Accept already assigned task → FAILED ❌
- **ACTION 5** (A): Accept without required certification → FAILED ❌
- **ACTION 6** (B): Accept task outside service area → PASSED ✅

---

### PRECONDITION

| **Precondition** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:-----------------|:------:|:------:|:------:|:------:|:------:|:------:|
| Server online & DB connected | O | O | O | O | O | O |
| User authenticated | O | O | O | O | O | O |
| API: POST /api/shipper/tasks/:id/confirm | O | O | O | O | O | O |
| **Authorization** |  |  |  |  |  |  |
| - User role = SHIPPER | O | O | O | O | O | O |
| - Shipper account active | O | O | O | O | O | O |
| **Task State** |  |  |  |  |  |  |
| - Task status = PENDING | O | O | O |  | O | O |
| - Task unassigned | O | O | O |  | O | O |
| - Task already assigned |  |  |  | O |  |  |
| **Shipper State** |  |  |  |  |  |  |
| - Has required certification | O | O | O | O |  | O |
| - Within service area | O | O | O | O | O |  |

---

### CONFIRM - RETURN

| **Return** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:-----------|:------:|:------:|:------:|:------:|:------:|:------:|
| **Success (200 OK)** | O | O | O |  |  | O |
| - success: true | O | O | O |  |  | O |
| - message: "Task đã được nhận" | O |  |  |  |  |  |
| - task status = ASSIGNED |  | O |  |  |  |  |
| - notification sent |  |  | O |  |  |  |
| **Error (400 Bad Request)** |  |  |  | O | O |  |
| - error: "Task already assigned" |  |  |  | O |  |  |
| - error: "Missing certification" |  |  |  |  | O |  |
| **Warning (200 OK)** |  |  |  |  |  | O |
| - warning: "Outside service area" |  |  |  |  |  | O |

---

### EXCEPTION

| **Exception** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:--------------|:------:|:------:|:------:|:------:|:------:|:------:|
| None | O | O | O |  |  | O |
| ValidationException |  |  |  | O | O |  |

---

### LOG MESSAGE

| **Log message** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:----------------|:------:|:------:|:------:|:------:|:------:|:------:|
| "✅ Checking task availability..." | O | O | O | O | O | O |
| "✅ Verifying shipper certification..." | O | O | O | O | O | O |
| "✅ Assigning task to shipper..." |  | O |  |  |  |  |
| "✅ Sending task details..." |  |  | O |  |  |  |
| "✅ Task confirmed" | O | O | O |  |  | O |
| "❌ Task already assigned" |  |  |  | O |  |  |
| "❌ Certification required" |  |  |  |  | O |  |
| "⚠️ Outside service area" |  |  |  |  |  | O |

---

### RESULT

| **Result** | **A1** | **A2** | **A3** | **A4** | **A5** | **A6** |
|:-----------|:------:|:------:|:------:|:------:|:------:|:------:|
| **Type** | N | N | N | A | A | B |
| **Passed/Failed** | P | P | P | F | F | P |
| **Defect ID** |  |  |  | BUG-059-01 | BUG-059-02 |  |
| **Executed Date** | 11/12/2025 | 11/12/2025 | 11/12/2025 | 11/12/2025 | 11/12/2025 | 11/12/2025 |

---

## DETAILED TEST SCENARIOS

### **ACTION 1: Shipper accepts task assignment** ✅ PASSED

**Type**: Normal (N)

**Input**:
```json
POST /api/shipper/tasks/674ftask123/confirm
Authorization: Bearer <shipper_token>
Body: {
  "estimatedTime": "30 minutes",
  "note": "Sẵn sàng nhận đơn"
}
```

**Expected**: 200 OK, task assigned

**Actual**: 
- ✅ 200 OK
- ✅ Task assigned to shipper
- ✅ Response includes task details

**Result**: PASSED

---

### **ACTION 2: Task status updated to ASSIGNED** ✅ PASSED

**Type**: Normal (N)

**Expected**: Task status PENDING → ASSIGNED

**Actual**:
```json
{
  "task": {
    "status": "ASSIGNED",
    "assignedShipper": "674fshipper1",
    "assignedAt": "2025-12-11T10:00:00Z",
    "estimatedCompletion": "2025-12-11T10:30:00Z"
  }
}
```
- ✅ Status updated
- ✅ Shipper ID linked
- ✅ Timestamps recorded

**Result**: PASSED

---

### **ACTION 3: Shipper notified of task details** ✅ PASSED

**Type**: Normal (N)

**Expected**: Notification với full task info

**Actual**:
- ✅ Notification sent
- ✅ Includes: addresses, contact info, product details
- ✅ Navigation link included
- ✅ Priority level shown

**Result**: PASSED

---

### **ACTION 4: Accept already assigned task** ❌ FAILED

**Type**: Abnormal (A)

**Precondition**: Task đã assigned to another shipper

**Input**:
```json
POST /api/shipper/tasks/674ftask456/confirm
Authorization: Bearer <shipper_B_token>
```

**Expected**: 400 Bad Request - "Task đã được nhận"

**Actual**: 200 OK - Task reassigned to shipper B

**Issues**:
- ❌ Cho phép reassign task đã có shipper
- ❌ Shipper A mất task
- ❌ No concurrent assignment check

**Defect**: BUG-059-01 (MEDIUM)

**Proposed Fix**:
```javascript
const task = await DeliveryTask.findById(taskId);

if (task.assignedShipper && task.status === 'ASSIGNED') {
  return res.status(400).json({
    success: false,
    message: 'Task này đã được shipper khác nhận',
    errorCode: 'TASK_ALREADY_ASSIGNED',
    assignedTo: task.assignedShipper,
    assignedAt: task.assignedAt
  });
}

// Use atomic update to prevent race condition
const updated = await DeliveryTask.findOneAndUpdate(
  { 
    _id: taskId, 
    assignedShipper: null  // Only update if not assigned
  },
  { 
    assignedShipper: shipperId,
    status: 'ASSIGNED',
    assignedAt: new Date()
  },
  { new: true }
);

if (!updated) {
  return res.status(409).json({
    success: false,
    message: 'Task vừa được shipper khác nhận',
    errorCode: 'CONCURRENT_ASSIGNMENT'
  });
}
```

**Result**: FAILED

---

### **ACTION 5: Accept without required certification** ❌ FAILED

**Type**: Abnormal (A)

**Precondition**: 
- Task requires VEHICLE_LICENSE
- Shipper không có license

**Input**:
```json
POST /api/shipper/tasks/674ftask789/confirm
Authorization: Bearer <uncertified_shipper_token>
```

**Expected**: 400 Bad Request - "Cần có bằng lái xe"

**Actual**: 200 OK - Task assigned

**Issues**:
- ❌ No certification validation
- ❌ Unqualified shipper assigned
- ❌ Safety and compliance risk

**Defect**: BUG-059-02 (HIGH)

**Proposed Fix**:
```javascript
const task = await DeliveryTask.findById(taskId);
const shipper = await Shipper.findById(shipperId);

// Check required certifications
const requiredCerts = task.requiredCertifications || [];

for (const cert of requiredCerts) {
  if (!shipper.certifications || !shipper.certifications.includes(cert)) {
    return res.status(400).json({
      success: false,
      message: `Bạn cần có chứng chỉ: ${cert}`,
      errorCode: 'MISSING_CERTIFICATION',
      required: cert,
      yourCertifications: shipper.certifications || []
    });
  }
}
```

**Result**: FAILED

---

### **ACTION 6: Accept task outside service area** ✅ PASSED

**Type**: Boundary (B)

**Precondition**: 
- Shipper service area: District 1, 3, 5
- Task in District 10

**Input**:
```json
POST /api/shipper/tasks/674ftask999/confirm
Authorization: Bearer <shipper_token>
```

**Expected**: 200 OK với warning

**Actual**:
```json
{
  "success": true,
  "warning": "Task này nằm ngoài khu vực phục vụ của bạn",
  "task": {...},
  "extraDistance": "8.5 km"
}
```
- ✅ Allowed but warned
- ✅ Extra distance shown
- ✅ Shipper can decide

**Result**: PASSED

---

## DEFECT SUMMARY

| **Defect ID** | **Severity** | **Description** | **Action** |
|---------------|--------------|-----------------|------------|
| BUG-059-01 | MEDIUM | No concurrent assignment protection - race condition | ACTION 4 |
| BUG-059-02 | HIGH | No certification validation - safety risk | ACTION 5 |

---

## SUMMARY

**Total**: 6 test cases | **Passed**: 4 (66.7%) | **Failed**: 2 (33.3%)

**By Type**:
- Normal (N): 3 tests → 3 Passed ✅
- Abnormal (A): 2 tests → 0 Passed, 2 Failed ❌
- Boundary (B): 1 test → 1 Passed ✅

**Critical Issues**:
1. ❌ HIGH: Certification not validated - safety and compliance risk
2. ❌ MEDIUM: Race condition in task assignment
3. ✅ Basic task confirmation works
4. ✅ Service area warning system works

**Recommendations**:
- Priority 1: Implement certification validation (BUG-059-02)
- Priority 2: Add atomic updates for task assignment (BUG-059-01)
- Priority 3: Add concurrent assignment tests
- Priority 4: Implement task auto-unassign if shipper doesn't start within timeframe

---

**Version**: 2.0 | **Updated**: 11/12/2025 | **Status**: Testing Complete - High Priority Bugs Found
