# Shipping Fee Fix - Summary

## Problem
Shipping fees were showing as **0đ** on the shipper dashboard instead of the actual fee amount (e.g., 23k).

## Root Cause
When creating DELIVERY and RETURN shipments in `ShipmentService.createShipmentForOrders()`, the `fee` field was **not being included** in the payload. The shipments were created with the default fee value of 0.

## Solution

### 1. Updated Shipment Creation (shipment.service.js)
Added `fee: subOrder.pricing?.shippingFee || 0` to both DELIVERY and RETURN shipment payloads:

```javascript
// DELIVERY Shipment
const deliveryPayload = {
  // ... other fields ...
  fee: subOrder.pricing?.shippingFee || 0,  // ← ADDED
  scheduledAt: subOrder.rentalPeriod?.startDate,
  status: 'PENDING'
};

// RETURN Shipment  
const returnPayload = {
  // ... other fields ...
  fee: subOrder.pricing?.shippingFee || 0,  // ← ADDED
  scheduledAt: subOrder.rentalPeriod?.endDate,
  status: 'PENDING'
};
```

### 2. Migration Script (migrate-shipping-fees.js)
Created a migration script to update any existing shipments that were created without fees:
- Checks all shipments in the database
- Compares current fee with SubOrder's shippingFee
- Updates shipments where fee doesn't match SubOrder's fee
- Skips shipments with no SubOrder or zero shippingFee

**To run the migration:**
```bash
node migrate-shipping-fees.js
```

## Files Changed
- `src/services/shipment.service.js` - Added fee field to shipment payloads
- `migrate-shipping-fees.js` - New migration script (created)

## Testing
✅ All new shipments will now automatically include the correct shipping fee from SubOrder.pricing.shippingFee

The fee is now:
- Displayed correctly on the shipper dashboard (e.g., "23k" instead of "0đ")
- Ready to be transferred to the shipper when the shipment status becomes DELIVERED
