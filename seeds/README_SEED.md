# PIRA Seed Data

## Overview

This directory contains seed scripts for testing various features of the PIRA rental system.

## Available Seed Scripts

### 1. Owner Products with Rental Scenarios

**File**: `seed-owner-products.js`

Creates test products with different rental states to test hide/delete validation logic.

```powershell
node seeds/seed-owner-products.js
```

---

### 2. Early Return Feature - Comprehensive Test Scenarios

**File**: `seed-early-return-scenarios.js`

Creates complete test data for the early return feature with all possible scenarios.

```powershell
node seeds/seed-early-return-scenarios.js
```

#### Test Users Created

- **Renter**: `renter@pira.vn` / `Renter@123`
- **Owner**: `owner@pira.vn` / `Owner@123`
- Both have active wallets with 50,000,000 VND for testing

#### Test Scenarios

1. **PICKUP Order - Valid for Early Return** ✅
   - Active order with proper dates
   - Can create early return request
2. **DELIVERY Order - Valid with Shipment** ✅
   - Active order with delivery shipments
   - Can create early return request
   - Updates existing return shipment
3. **Order Ending Tomorrow - INVALID** ❌
   - Ends within 24 hours
   - Cannot request early return
4. **Order with Pending Early Return Request** ⏳
   - Already has pending request
   - Owner can confirm/reject
5. **Overdue Order - INVALID** ❌
   - End date passed
   - Cannot request early return
6. **Confirmed Early Return - Awaiting Auto-Completion** ⏱️
   - Owner confirmed return
   - Deposit refunded
   - Will auto-complete after 24h
7. **Cancelled Early Return** 🚫
   - Renter cancelled their request
   - Order continues normally
8. **DELIVERY - Can Change Return Address** ✅
   - Active DELIVERY order
   - Can request early return with new address
   - System updates return shipment

#### API Endpoints to Test

```http
# Create early return request
POST /api/early-returns
{
  "subOrderId": "SO-XXX",
  "requestedReturnDate": "2025-11-30",
  "returnAddress": { ... },
  "notes": "Need to return early"
}

# Get renter's requests
GET /api/early-returns/renter?status=PENDING

# Get owner's requests
GET /api/early-returns/owner?status=PENDING

# Owner confirms return
POST /api/early-returns/:id/confirm
{
  "productCondition": "EXCELLENT",
  "notes": "Good condition"
}

# Renter cancels request
POST /api/early-returns/:id/cancel
{
  "reason": "Changed my mind"
}

# Owner creates review (after confirmation)
POST /api/early-returns/:id/review
{
  "rating": 5,
  "comment": "Great renter!",
  "detailedRatings": { ... }
}
```

#### Testing Guide

**Valid Scenarios** (should succeed):

- ✅ Create request for Scenario 1 (PICKUP)
- ✅ Create request for Scenario 2 (DELIVERY)
- ✅ Create request for Scenario 8 (DELIVERY with address change)

**Invalid Scenarios** (should fail with proper error):

- ❌ Scenario 3: "Cannot request early return - order ends within 24 hours"
- ❌ Scenario 4: "Early return request already exists for this order"
- ❌ Scenario 5: "Cannot request early return for overdue order"

**Owner Actions**:

- 📋 View pending requests (Scenario 4)
- ✅ Confirm request → triggers deposit refund
- ❌ Reject request with reason
- ⭐ Create review after confirmation

**Auto-Completion**:

- ⏰ Run cron job manually or wait 1 hour
- ✅ Order status changes to COMPLETED
- 🔔 Notifications sent to both parties

#### Socket.IO Events to Test

- `early-return-request` - Owner receives notification
- `return-confirmed` - Renter receives notification
- `return-auto-completed` - Renter receives notification
- `wallet-updated` - Both parties for deposit refund

---

## Original: Owner Products Seed Data

## Overview

This seed script creates test products **with rental orders** for the owner account to fully test the hide/delete/edit validation logic and rental contingencies.

## Running the Seed Script

```powershell
# From PIRA-server directory
node seeds/seed-owner-products.js
```

## Seeded Data

### Owner Account

- **Email**: chautdnde180063@fpt.edu.vn
- **Name**: Trần Dương Nhật Châu
- **Role**: OWNER
- **ID**: 6916e26eee73c5ebcb2f2f14

### Renter Account (Test User)

- **Email**: renter@test.com
- **Name**: Test Renter
- **Role**: RENTER
- **Password**: Same as owner (for testing)

### Products Created (with Rental Scenarios)

1. **Canon EOS R6 Mark II** - Status: `ACTIVE`
   - Daily Rate: 150,000 VND
   - Deposit: 5,000,000 VND
   - Stock: 1 unit (1 available)
   - **Rentals**: NONE
   - ✅ **Can hide & delete** (no active or pending rentals)

2. **Sony A7 IV** - Status: `ACTIVE`
   - Daily Rate: 180,000 VND
   - Deposit: 6,000,000 VND
   - Stock: 1 unit (1 available)
   - **Rentals**: 1 PENDING request (awaiting owner confirmation)
   - ❌ **CANNOT hide/delete** (must approve or reject pending request first)
   - ⚠️ Test: Owner must handle the pending request before hiding/deleting

3. **GoPro Hero 12 Black** - Status: `ACTIVE`
   - Daily Rate: 50,000 VND
   - Deposit: 1,500,000 VND
   - Stock: 3 units (1 available, 2 rented)
   - **Rentals**: 2 ACTIVE rentals
   - ⚠️ **Can hide** (won't affect existing rentals)
   - ❌ **CANNOT delete** (has active rentals - must wait until returned)
   - 💡 Multi-unit product: hiding only prevents NEW rentals

4. **DJI Mavic 3 Pro** - Status: `OWNER_HIDDEN`
   - Daily Rate: 200,000 VND
   - Deposit: 8,000,000 VND
   - Stock: 1 unit
   - **Rentals**: NONE
   - 🔒 Hidden from public, visible to owner only
   - ✅ **Can unhide or delete** (no rentals)

5. **Nikon Z9** - Status: `DRAFT`
   - Daily Rate: 250,000 VND
   - Deposit: 10,000,000 VND
   - Stock: 1 unit
   - **Rentals**: NONE
   - 📝 Draft status (not published)
   - ✅ **Can delete or activate**

6. **MacBook Pro 16" M3 Max** - Status: `RENTED`
   - Daily Rate: 300,000 VND
   - Deposit: 15,000,000 VND
   - Stock: 1 unit (0 available, 1 rented)
   - **Rentals**: 1 ACTIVE rental (currently in use)
   - ❌ **CANNOT hide/delete** (has active rental - must wait until returned)

### Rental Orders Created

| Sub Order | Product     | Status               | Dates                               | Notes                 |
| --------- | ----------- | -------------------- | ----------------------------------- | --------------------- |
| SO-XXX-1  | Sony A7 IV  | PENDING_CONFIRMATION | Starts in 2 days                    | Awaiting owner action |
| SO-XXX-2  | MacBook Pro | ACTIVE               | Started 3 days ago, ends in 11 days | Currently in use      |
| SO-XXX-3  | GoPro #1    | ACTIVE               | Started yesterday, ends in 4 days   | Currently in use      |
| SO-XXX-4  | GoPro #2    | ACTIVE               | Started today, ends in 3 days       | Currently in use      |

## Testing Scenarios

### ✅ Scenario 1: Hide Product with No Rentals (Canon)

```
Action: Hide Canon EOS R6 Mark II
Expected: Success
- Product status changes to OWNER_HIDDEN
- Product disappears from public listings
- Product still visible to owner in /owner/products
- Can unhide later
```

### ❌ Scenario 2: Try to Hide Product with Pending Request (Sony)

```
Action: Hide Sony A7 IV
Expected: FAIL with error message
Error: "Cannot hide product with pending rental requests. Please approve or reject all requests first."
- Modal/alert shows error
- Product status remains ACTIVE
- User must go to rental orders and handle the pending request
```

### ❌ Scenario 3: Try to Delete Product with Pending Request (Sony)

```
Action: Delete Sony A7 IV
Expected: FAIL with error message
Error: "Cannot delete product with pending rental requests"
- Deletion blocked
- Suggest approving/rejecting requests first
```

### ❌ Scenario 4: Try to Delete Product with Active Rentals (MacBook)

```
Action: Delete MacBook Pro M3
Expected: FAIL with error message
Error: "Cannot delete product with active rentals. Please wait until all rentals are completed."
- Deletion blocked
- Shows active rental count
```

### ⚠️ Scenario 5: Hide Multi-Unit Product with Some Rentals (GoPro)

```
Action: Hide GoPro Hero 12 Black
Expected: Success (with warning)
- Hide succeeds even though 2/3 units are rented
- Active rentals continue unaffected
- No NEW rentals can be made
- Warning: "Product hidden. Existing rentals will continue."
```

### ❌ Scenario 6: Try to Delete Multi-Unit Product with Active Rentals (GoPro)

```
Action: Delete GoPro Hero 12 Black
Expected: FAIL with error message
Error: "Cannot delete product with active rentals (2 units currently rented)"
- Deletion blocked even if only some units are rented
```

### ✅ Scenario 7: Unhide Hidden Product (DJI Mavic)

```
Action: Unhide DJI Mavic 3 Pro
Expected: Success
- Product status changes from OWNER_HIDDEN to ACTIVE
- Product appears in public listings again
```

### ✅ Scenario 8: Delete Product with No Rentals

```
Action: Delete Canon EOS R6 Mark II
Expected: Success
- Product status changes to OWNER_DELETED
- Product disappears from both owner and public views
- Data preserved in database (soft delete)
```

### ✅ Scenario 9: Edit Product (Any)

```
Action: Edit any product
Allowed Changes:
- ✅ Title
- ✅ Description
- ✅ Images (with AI validation)

Read-Only Fields:
- ❌ Price/Daily Rate
- ❌ Deposit
- ❌ Category
- ❌ Brand
- ❌ Condition

Expected: Only safe fields can be modified
```

## Validation Logic Summary

### Hide Product Rules

1. ✅ **Allowed if**: No rentals OR only completed rentals
2. ✅ **Allowed if**: Multi-unit product with SOME units rented (won't affect existing)
3. ❌ **Blocked if**: Has PENDING rental requests
4. ❌ **Blocked if**: Single-unit product with ACTIVE rental

### Delete Product Rules

1. ✅ **Allowed if**: No rentals at all
2. ✅ **Allowed if**: Only completed/cancelled rentals
3. ❌ **Blocked if**: Has PENDING rental requests
4. ❌ **Blocked if**: Has ANY active rentals (regardless of available quantity)

### Rental Request Status

- **PENDING_CONFIRMATION**: Owner must approve/reject
- **ACTIVE**: Rental is ongoing
- **COMPLETED**: Rental finished, product returned
- **CANCELLED**: Rental was cancelled

## API Endpoints to Test

### Check Rental Status

```http
GET /api/owner/products/:productId/rental-status
```

### Hide Product

```http
PATCH /api/owner/products/:productId/hide
```

### Unhide Product

```http
PATCH /api/owner/products/:productId/unhide
```

### Delete Product

```http
DELETE /api/owner/products/:productId
```

## Database Cleanup

### Remove all seeded data

```powershell
mongosh "mongodb://localhost:27017/PIRA_System" --eval "
  db.products.deleteMany({owner: ObjectId('6916e26eee73c5ebcb2f2f14')});
  db.suborders.deleteMany({owner: ObjectId('6916e26eee73c5ebcb2f2f14')});
  db.masterorders.deleteMany({});
  db.users.deleteOne({email: 'renter@test.com'});
"
```

### Re-run seed script

```powershell
node seeds/seed-owner-products.js
```

## Notes

- **Rental Orders**: Fully seeded with proper SubOrder and MasterOrder structure
- **Validation**: Backend service `checkProductRentalStatus` validates all scenarios
- **Multi-Unit Products**: GoPro demonstrates hide behavior with partial availability
- **Pending Requests**: Sony A7 IV demonstrates blocking hide/delete until handled
- **Active Rentals**: MacBook and GoPro demonstrate active rental blocking

## Next Steps

1. ✅ Products and rentals seeded successfully
2. ⏭️ Start server: `npm run dev`
3. ⏭️ Test owner products page: http://localhost:3000/owner/products
4. ⏭️ Try each test scenario above
5. ⏭️ Verify validation messages appear correctly
6. ⏭️ Test modal confirmations for each action
7. ⏭️ Check that hidden/deleted products behave correctly in public listings
