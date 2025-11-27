# Return Shipment Flow - Quick Start Guide

## What's New
Implemented complete return shipment workflow that automatically initiates when rental period ends, allowing shippers to:
1. Accept return tasks
2. Pick up items from renter with photo documentation
3. Deliver items to owner
4. Automatically refund deposit to renter upon completion

## Architecture Components

### New Files Created
```
PIRA-server/
  src/
    services/
      returnShipment.service.js          - Core return shipment logic
    controllers/
      returnShipment.controller.js       - HTTP request handlers
    routes/
      returnShipment.routes.js           - Route definitions
      returnShipment.routes.register.js  - Route registration
    scripts/
      returnShipmentCron.js              - Automatic return initiation
  scripts/
    test-return-shipment.js              - Complete test workflow
  RETURN_SHIPMENT_DOCUMENTATION.md       - Full documentation

PIRA-client/
  src/services/
    returnShipment.js                    - Client-side API service
```

### Modified Files
```
PIRA-server/
  src/
    app.js                               - Added cron job initialization
    models/SubOrder.js                   - Added return fields
    routes/api.js                        - Registered return routes

PIRA-client/
  (no modifications to existing files)
```

## Key Features

### 1. **Automatic Return Initiation** (Daily at 1:00 AM)
- Cron job finds all rentals ending today
- Creates Shipment(s) for each SubOrder
- FromAddress: Renter location
- ToAddress: Owner location

### 2. **Shipper Workflow**
- **View Available Tasks**: GET `/api/return-shipments?status=PENDING`
- **Accept Task**: POST `/api/return-shipments/:shipmentId/confirm`
- **Pickup with Photos**: POST `/api/return-shipments/:shipmentId/pickup`
- **Complete Delivery**: POST `/api/return-shipments/:shipmentId/complete`

### 3. **Automatic Deposit Refund**
- When shipper completes final delivery
- Amount: `subOrder.pricing.subtotalDeposit`
- From: System wallet
- To: Renter wallet
- Updates SubOrder fields:
  - `depositRefunded = true`
  - `depositRefundedAt = now()`

### 4. **Photo Documentation**
- Shipper takes photos at pickup (from renter)
- Shipper takes photos at delivery (to owner)
- Stored in: `tracking.photos` array
- Condition recorded: `tracking.returnCondition`
- Owner condition recorded: `tracking.returnConditionAtOwner`

## Database Schema Changes

### SubOrder Model - New Fields
```javascript
return: {
  status: 'NOT_INITIATED' | 'PENDING' | 'PICKUP_CONFIRMED' | 'IN_TRANSIT' | 'COMPLETED',
  initiatedAt: Date,
  returnType: 'NORMAL' | 'EARLY',
  shipments: [ObjectId] // References to Shipment documents
}

depositRefunded: Boolean        // Whether deposit was refunded
depositRefundedAt: Date         // When deposit was refunded
```

## API Endpoints

### Admin/Owner Operations
```
POST /api/return-shipments/initiate/:subOrderId
  Headers: { Authorization: Bearer <token> }
  Body: {
    returnType: 'NORMAL' | 'EARLY',
    notes: 'optional notes'
  }
```

### Shipper Operations
```
GET /api/return-shipments
  Query: ?status=PENDING|SHIPPER_CONFIRMED|IN_TRANSIT
  
GET /api/return-shipments/:shipmentId

POST /api/return-shipments/:shipmentId/confirm
  Body: {}

POST /api/return-shipments/:shipmentId/pickup
  Body: {
    photos: ['url1', 'url2', 'url3'],
    condition: 'GOOD' | 'DAMAGED',
    notes: 'pickup notes'
  }

POST /api/return-shipments/:shipmentId/complete
  Body: {
    photos: ['url1', 'url2'],
    condition: 'GOOD' | 'DAMAGED',
    notes: 'delivery notes'
  }
```

## Status Flow Diagram

```
PENDING
  ↓ (Shipper confirms)
SHIPPER_CONFIRMED
  ↓ (Shipper picks up from renter)
IN_TRANSIT
  ↓ (Shipper delivers to owner)
DELIVERED
  ↓ (All shipments completed)
[Deposit automatically refunded to renter]
```

## Testing the Flow

### Run Full Integration Test
```bash
cd PIRA-server
npm test scripts/test-return-shipment.js
```

This test will:
1. Find a test SubOrder with DELIVERED status
2. Initiate return shipments
3. Simulate shipper confirming
4. Record pickup with photos
5. Record delivery to owner
6. Verify:
   - Admin wallet decreased by deposit amount
   - Renter wallet increased by deposit amount
   - SubOrder marked as RETURN_COMPLETED
   - Deposit marked as refunded

### Manual Testing Steps
```bash
# 1. Create a rental order and confirm delivery
POST /api/rental-orders
POST /api/shipments/:shipmentId/renter-confirm

# 2. Initiate return (or wait for auto-trigger at 1 AM)
POST /api/return-shipments/initiate/:subOrderId

# 3. List available returns
GET /api/return-shipments?status=PENDING

# 4. Shipper accepts
POST /api/return-shipments/:shipmentId/confirm

# 5. Shipper picks up
POST /api/return-shipments/:shipmentId/pickup
Body: {
  "photos": ["https://...jpg"],
  "condition": "GOOD",
  "notes": "Item in good condition"
}

# 6. Shipper delivers
POST /api/return-shipments/:shipmentId/complete
Body: {
  "photos": ["https://...jpg"],
  "condition": "GOOD",
  "notes": "Delivered to owner"
}

# 7. Verify deposit refunded
GET /api/wallets/:renterId
```

## Payment Summary

### Complete Rental Lifecycle
```
1. Order Placement
   Admin: +150k (50k rental + 100k deposit)
   Renter: -150k

2. Renter Confirms Delivery (Day 1)
   Admin: -50k
   Owner: +50k
   Deposit: 100k (stays in admin)

3. Rental Period Ends (Day 7, automatically at 1 AM)
   Return shipments created automatically

4. Shipper Completes Return (Day 8)
   Admin: -100k (deposit refund)
   Renter: +100k (deposit returned)

FINAL BALANCES:
   Admin: -150k + 50k + 100k = 0 VND (breaks even)
   Owner: +50k (keeps rental fee)
   Renter: -150k + 50k + 100k = 0 VND (breaks even, got all money back)
```

## Configuration

### Environment Variables
```bash
# .env (already in place)
SYSTEM_ADMIN_ID=          # Optional, uses 'SYSTEM_AUTO_TRANSFER' if empty
```

### Return Shipment Cron Schedule
- **File**: `src/scripts/returnShipmentCron.js`
- **Schedule**: Daily at 1:00 AM (UTC)
- **Edit**: Change cron expression in `startReturnShipmentCronJob()`
- **Example**: `'0 1 * * *'` = 1:00 AM daily

## Troubleshooting

### Return Shipments Not Being Created
1. Check logs at 1:00 AM UTC
2. Verify MongoDB connection
3. Check if SubOrders have `return.status = 'NOT_INITIATED'`
4. Verify `products.rentalPeriod.endDate` is set correctly

### Deposit Not Refunding
1. Check SystemWallet has sufficient balance
2. Verify `subtotalDeposit` is set in pricing
3. Check logs for transfer errors
4. Run manual transfer test:
   ```bash
   npm test scripts/test-transfer-from-admin.js
   ```

### Shipper Can't Confirm Return
1. Verify shipper has SHIPPER role
2. Verify shipment status is PENDING
3. Check authentication token

## Next Steps

### Frontend Implementation Needed
- [ ] Create Shipper Return Dashboard component
- [ ] List available return tasks
- [ ] Photo upload UI component
- [ ] Status tracking UI
- [ ] Condition selection dropdown (GOOD/DAMAGED)
- [ ] Display refund confirmation to renter

### Future Enhancements
- [ ] Damage assessment and partial refund logic
- [ ] Return status notifications to renter/owner
- [ ] Return tracking history view
- [ ] Integration with damage insurance claims
- [ ] Support for return cancellation/rejection

## Monitoring

### Logs to Watch For
```
✅ Return shipment cron completed:
   Created: 5
   Failed: 0

📦 Creating return shipment for SubOrder SO-001
✅ Return shipments created: 3

🚚 Shipper confirming return
✅ Shipper confirmed return shipment

💰 Processing deposit refund
✅ Deposit refunded: 100000 VND
```

### Database Queries for Monitoring
```javascript
// Find all pending returns
db.shipments.find({ type: 'RETURN', status: 'PENDING' })

// Find completed returns
db.shipments.find({ type: 'RETURN', status: 'DELIVERED' })

// Check refunded deposits
db.suborders.find({ depositRefunded: true })

// Monitor system wallet transactions
db.transactions.find({ type: 'TRANSFER', description: /Deposit refund/ })
```

## Support
For issues or questions, check:
1. `RETURN_SHIPMENT_DOCUMENTATION.md` - Full technical documentation
2. `scripts/test-return-shipment.js` - Reference implementation
3. Git logs for detailed commit messages
