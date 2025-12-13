# Order Completion Flow (After Changes)

## Timeline sau khi shipper xác nhận trả hàng cho owner:

```
T+0h (Return delivery confirmed by shipper)
├── ✅ Shipment status = DELIVERED
├── ✅ SubOrder products[].productStatus = INACTIVE  
├── ✅ Award creditScore +5 to owner
├── ✅ Award loyaltyPoints +5 to both owner & renter
└── ⏰ SCHEDULE order completion + funds unlock after 24h

T+24h (Auto-triggered)
├── ✅ MasterOrder.status = COMPLETED
├── ✅ SubOrder.status = COMPLETED
├── 🔓 Owner's frozen funds → available (rental + extension fees)
└── ✅ Owner can withdraw money immediately
```

## So sánh với logic CŨ:

### ❌ CŨ (Sai):
```
T+0h: Return delivery → Order COMPLETED ngay
       → Owner có tiền ngay
```

### ✅ MỚI (Đúng):
```
T+0h: Return delivery → Schedule completion
T+24h: Order COMPLETED + Unlock frozen funds → Owner có tiền
```

## Lý do thay đổi:

1. **Thời gian kiểm tra chất lượng**: Owner cần 24h để kiểm tra sản phẩm sau khi nhận lại
2. **Thời gian dispute**: Renter có 24h để mở dispute nếu có vấn đề  
3. **Bảo vệ cả 2 bên**: 
   - Renter được bảo vệ trong 24h (có thể dispute nếu owner báo sản phẩm hỏng)
   - Owner nhận tiền sau khi đã kiểm tra và chắc chắn không có vấn đề
4. **Unlock cùng lúc với completion**: Đơn giản hóa logic, tránh nhầm lẫn

## Testing:

```bash
# Test with 10 second delay (instead of 24h)
node test-order-completion.js <masterOrderId> <subOrderId> 10

# Check pending completions
node test-order-completion.js --check
```

## Files changed:

1. **orderScheduler.service.js** (NEW)
   - scheduleOrderCompletion(): Schedule order → COMPLETED after 24h
   - completeOrder(): Set status COMPLETED + schedule frozen unlock
   
2. **shipment.service.js** (MODIFIED)
   - Removed immediate COMPLETED status update
   - Added call to scheduleOrderCompletion()
   - Removed immediate frozen unlock scheduling (moved to orderScheduler)

## Notes:

- Scheduler uses in-memory Map (for testing)
- In production, should use Redis or database for persistence
- If server restarts, scheduled completions will be lost (use persistent storage)
