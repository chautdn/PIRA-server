# Return Shipment Flow Documentation

## Overview
Luồng trả hàng được thiết kế để xử lý việc shipper nhận hàng từ renter, chụp ảnh để chứng minh tình trạng, và giao lại cho owner. Sau khi hoàn thành, tiền cọc sẽ được hoàn lại cho renter.

## Architecture

### Models
- **Shipment**: `type: 'RETURN'` - Tracks return shipments
  - `returnType`: 'NORMAL' | 'EARLY' - Type of return
  - `fromAddress`: Renter's address (pickup location)
  - `toAddress`: Owner's address (delivery location)
  - `status`: PENDING → SHIPPER_CONFIRMED → IN_TRANSIT → DELIVERED
  - `tracking.photos`: Array of photos for condition verification

- **SubOrder**: New fields added
  - `return.status`: NOT_INITIATED | PENDING | PICKUP_CONFIRMED | IN_TRANSIT | COMPLETED
  - `return.shipments`: Array of return Shipment IDs
  - `depositRefunded`: Boolean - Whether deposit was refunded
  - `depositRefundedAt`: Date - When deposit was refunded

### Services
- **ReturnShipmentService** (`src/services/returnShipment.service.js`)
  - `createReturnShipment()` - Create return task(s)
  - `shipperConfirmReturn()` - Shipper accepts return task
  - `shipperPickupReturn()` - Pickup from renter with photos
  - `shipperCompleteReturn()` - Complete delivery to owner, refund deposit
  - `listReturnShipmentsForShipper()` - List available/assigned returns
  - `getReturnShipmentDetail()` - Get return shipment details

### Controllers
- **ReturnShipmentController** (`src/controllers/returnShipment.controller.js`)
  - HTTP endpoints for all service methods
  - Authentication and authorization

## Workflow

### 1. Initiate Return (Admin/Owner)
**Trigger**: Automatically when rental period ends (via cron job)
```
POST /api/return-shipments/initiate/:subOrderId
Body: {
  returnType: 'NORMAL' | 'EARLY',
  notes: 'Optional notes'
}
```

**What happens**:
- Creates Shipment(s) for each product in SubOrder
- Type: 'RETURN'
- FromAddress: Renter's address
- ToAddress: Owner's address
- Status: PENDING
- Updates SubOrder: `return.status = 'PENDING'`

**Response**:
```json
{
  "status": "success",
  "data": {
    "subOrderId": "...",
    "shipmentGroupId": "RET...",
    "returnShipments": [
      {
        "_id": "...",
        "shipmentId": "...",
        "type": "RETURN",
        "status": "PENDING",
        "fromAddress": {...},
        "toAddress": {...}
      }
    ]
  }
}
```

### 2. Shipper Lists Available Returns
**Trigger**: Shipper checks their app for new tasks
```
GET /api/return-shipments
GET /api/return-shipments?status=PENDING
GET /api/return-shipments?status=SHIPPER_CONFIRMED
GET /api/return-shipments?status=IN_TRANSIT
```

**Response**:
```json
{
  "status": "success",
  "count": 5,
  "data": [
    {
      "_id": "...",
      "shipmentId": "...",
      "type": "RETURN",
      "returnType": "NORMAL",
      "status": "PENDING",
      "fromAddress": {
        "streetAddress": "123 Main St",
        "ward": "Ward 1",
        "district": "District 1",
        "city": "HCMC"
      },
      "toAddress": {...},
      "subOrder": {
        "_id": "...",
        "subOrderNumber": "...",
        "products": [...]
      }
    }
  ]
}
```

### 3. Shipper Confirms Return Task
**Trigger**: Shipper clicks "Accept" on a return task
```
POST /api/return-shipments/:shipmentId/confirm
Body: {}
```

**What happens**:
- Sets `shipper` field to shipper's ID
- Status: PENDING → SHIPPER_CONFIRMED

**Response**:
```json
{
  "status": "success",
  "message": "Return shipment confirmed",
  "data": {
    "shipmentId": "...",
    "status": "SHIPPER_CONFIRMED",
    "shipper": "..."
  }
}
```

### 4. Shipper Picks Up from Renter
**Trigger**: Shipper arrives at renter's location, takes photos
```
POST /api/return-shipments/:shipmentId/pickup
Body: {
  "photos": [
    "https://cloudinary.com/image1.jpg",
    "https://cloudinary.com/image2.jpg",
    "https://cloudinary.com/image3.jpg"
  ],
  "condition": "GOOD",
  "notes": "Product in good condition, all items received"
}
```

**What happens**:
- Status: SHIPPER_CONFIRMED → IN_TRANSIT
- Records: `tracking.pickedUpAt`
- Stores photos: `tracking.photos`
- Records condition: `tracking.returnCondition`
- Records notes: `tracking.notes`

**Response**:
```json
{
  "status": "success",
  "message": "Return shipment picked up and in transit",
  "data": {
    "shipmentId": "...",
    "status": "IN_TRANSIT",
    "tracking": {
      "pickedUpAt": "2024-01-15T10:30:00Z",
      "photos": ["..."],
      "returnCondition": "GOOD",
      "notes": "..."
    }
  }
}
```

### 5. Shipper Delivers to Owner
**Trigger**: Shipper arrives at owner's location, takes photos
```
POST /api/return-shipments/:shipmentId/complete
Body: {
  "photos": [
    "https://cloudinary.com/image1.jpg",
    "https://cloudinary.com/image2.jpg"
  ],
  "condition": "GOOD",
  "notes": "All items delivered in good condition"
}
```

**What happens**:
1. Status: IN_TRANSIT → DELIVERED
2. Records: `tracking.deliveredAt`
3. Stores photos: `tracking.photos`
4. Records owner condition: `tracking.returnConditionAtOwner`
5. Checks if ALL shipments completed
6. If all completed:
   - Updates SubOrder: `status = 'RETURN_COMPLETED'`
   - **Refunds deposit to renter**:
     - Amount: `subOrder.pricing.subtotalDeposit`
     - From: System wallet
     - To: Renter wallet
     - Creates transaction record
     - Sets `depositRefunded = true`
     - Sets `depositRefundedAt = now`

**Response**:
```json
{
  "status": "success",
  "message": "Return shipment completed and deposit refunded",
  "data": {
    "shipmentId": "...",
    "status": "DELIVERED",
    "tracking": {
      "pickedUpAt": "2024-01-15T10:30:00Z",
      "deliveredAt": "2024-01-15T14:15:00Z",
      "photos": ["..."],
      "returnConditionAtOwner": "GOOD"
    }
  }
}
```

## Automatic Triggers

### Return Shipment Cron Job
**File**: `src/scripts/returnShipmentCron.js`
**Schedule**: Daily at 1:00 AM
**What it does**:
1. Finds all SubOrders where rental period ends today
2. Status is ACTIVE or DELIVERED
3. Return status is NOT_INITIATED
4. Automatically creates return shipments for each
5. Type: 'NORMAL', returnType: 'NORMAL'

**Logs**:
```
🔄 [Cron] Checking for rental orders to return...
   Found 5 orders ready for return
   📦 Processing return for SubOrder: SO-001
      Owner: John Doe
      Rental End Date: 2024-01-15
   ✅ Return shipments created: 3
   ✅ Return shipment cron completed:
      Created: 5
      Failed: 0
```

## Payment Flow Summary

### Complete Rental Lifecycle Payment
```
1. Renter pays upfront
   ├─ Admin wallet: +150k (50k rental + 100k deposit)
   └─ Renter wallet: -150k

2. Renter confirms delivery
   ├─ Admin wallet: -50k (rental fee)
   ├─ Owner wallet: +50k (rental fee)
   └─ Deposit stays in admin: 100k

3. Rental period ends, return initiated
   └─ Return shipments created automatically

4. Shipper completes return delivery
   ├─ Admin wallet: -100k (deposit refund)
   ├─ Renter wallet: +100k (deposit returned)
   └─ Order status: RETURN_COMPLETED
```

## Error Handling

### Validation
- SubOrder must exist
- Renter must exist
- Shipper must have SHIPPER role
- Shipment must exist
- Status transitions must be valid (no skipping statuses)

### Transaction Handling
- All database operations use MongoDB sessions
- Wallet transfers are atomic
- If any step fails, entire transaction rolls back
- Failed operations are logged with full error context

### Retry Logic
- Deposit refund can fail if system wallet insufficient
- Error is logged but doesn't fail the return completion
- Refund can be retried manually via admin panel

## Key Differences from Delivery Flow

| Aspect | Delivery | Return |
|--------|----------|--------|
| **Direction** | Owner → Renter | Renter → Owner |
| **Shipment Type** | type: 'DELIVERY' | type: 'RETURN' |
| **From Address** | Owner's address | Renter's address |
| **To Address** | Renter's address | Owner's address |
| **Money Transfer** | Rental fee: Admin → Owner | Deposit refund: Admin → Renter |
| **Photo Purpose** | Proof of delivery | Proof of condition |
| **Trigger** | Order placed | Rental period ends |
| **Auto Trigger** | On payment | Daily cron job at 1 AM |

## Testing

### Test Scenario 1: Normal Return Flow
```bash
# 1. Create rental order
POST /api/rental-orders with proper payment

# 2. Renter confirms delivery
POST /api/shipments/:shipmentId/renter-confirm

# 3. Manual trigger: Initiate return
POST /api/return-shipments/initiate/:subOrderId

# 4. Shipper accepts
POST /api/return-shipments/:shipmentId/confirm

# 5. Shipper picks up
POST /api/return-shipments/:shipmentId/pickup
Body: { photos: [...], condition: "GOOD" }

# 6. Shipper delivers
POST /api/return-shipments/:shipmentId/complete
Body: { photos: [...], condition: "GOOD" }

# 7. Verify deposit refunded to renter
GET /api/system-wallet/transactions?type=TRANSFER&to=renterId
```

### Test Scenario 2: Early Return
```
Same as above but:
- returnType: 'EARLY'
- Triggered before rental period ends
```

## Notes
- Photos are stored as URLs in Cloudinary (or other storage)
- Multiple products from same owner create multiple Shipments
- All Shipments must complete before deposit is refunded
- Return workflow can be triggered manually or automatically
- Shipper can reject/fail return (status: FAILED, CANCELLED)
