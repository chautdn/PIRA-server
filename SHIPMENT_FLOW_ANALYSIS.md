# PHÂN TÍCH FLOW SHIPMENT - HỆ THỐNG THUÊ ĐỒ

## 1. ĐÁNH GIÁ FLOW HIỆN TẠI

### ✅ Điểm mạnh:
- **Flow rõ ràng**: Các bước được mô tả tuần tự từ khi ký hợp đồng → giao hàng → thuê → trả hàng → hoàn thành
- **Xử lý exception tốt**: Có xử lý các trường hợp owner/renter không liên lạc được (no-show)
- **Trách nhiệm rõ ràng**: Phân biệt rõ trách nhiệm của từng bên (owner, renter, shipper)
- **Cơ chế bảo vệ**: Có đóng băng tiền 24h, hệ thống credit/loyalty point, tranh chấp

### 🔧 Cần cải thiện về cách diễn đạt:

**Flow hiện tại (RAW):**
```
"sau khi 2 bên kí hợp đồng xong thì đơn thuê sẽ được tạo và gửi mail và thông báo về cho shipper..."
```

**Đề xuất diễn đạt mượt hơn (cho báo cáo):**

---

## FLOW VẬN CHUYỂN HOÀN CHỈNH

### 1. KHỞI TẠO ĐỢN HÀNG
Sau khi Owner và Renter ký hợp đồng thuê, hệ thống sẽ:
- Tự động tạo đơn vận chuyển (giao + trả)
- Phân công Shipper phụ trách khu vực (theo quận của Owner)
- Gửi thông báo và email cho Shipper được phân công

**Lưu ý**: Mỗi quận tại Đà Nẵng có 1 Shipper chuyên trách, đảm nhận cả quá trình giao và nhận trả hàng.

---

### 2. GIAI ĐOẠN GIAO HÀNG (DELIVERY)

#### 2.1. Shipper xác nhận nhận đơn
- Shipper nhận thông báo và xác nhận đảm nhận vận chuyển
- Di chuyển đến địa điểm của Owner để nhận hàng

#### 2.2. Kiểm tra và nhận hàng từ Owner
**Quy trình kiểm tra:**
- Shipper và Owner cùng kiểm tra tình trạng sản phẩm
- Dán tem xác thực và Owner ký lên tem
- Shipper chụp ảnh/quay video tình trạng sản phẩm **trước khi giao**
- Upload bằng chứng lên hệ thống
- Xác nhận đã nhận hàng từ Owner

**Trường hợp ngoại lệ - Owner không liên lạc được:**
- Đơn hàng bị hủy tự động
- Renter nhận lại tiền (trừ phí vận chuyển)
- Owner bị trừ **20 điểm Credit**
- Gửi thông báo hủy đơn cho Renter

#### 2.3. Giao hàng cho Renter
**Quy trình giao:**
- Shipper di chuyển đến địa điểm của Renter
- Renter kiểm tra sản phẩm với Owner qua video call (nếu cần)
- Renter kiểm tra tình trạng thực tế so với mô tả

**Trường hợp 1 - Renter không nhận hàng (boom hàng):**
- Đơn hàng bị hủy
- Renter bị trừ tiền thuê 1 ngày:
- Nếu thanh toán online: Trừ vào phần đã thanh toán
- Shipper trả hàng về cho Owner

**Trường hợp 2 - Renter từ chối nhận hàng (không đúng mô tả):**
- Renter có thể gửi yêu cầu tranh chấp
- Chuyển sang flow giải quyết tranh chấp
- Hàng tạm giữ đến khi giải quyết xong

**Trường hợp 3 - Renter chấp nhận nhận hàng:**
- Renter kiểm tra và xác nhận nhận hàng
- Shipper chụp ảnh/quay video tình trạng sản phẩm **sau khi giao**
- Upload bằng chứng và xác nhận đã giao hàng thành công
- **Owner nhận 90% tiền thuê** (10% phí nền tảng)
- Tiền được **đóng băng 24 giờ** để xử lý tranh chấp nếu có
- Sản phẩm chuyển sang trạng thái **ACTIVE** (đang được thuê)

---

### 3. GIAI ĐOẠN THUÊ (ACTIVE RENTAL)

Trong thời gian thuê, Renter có thể:
- **Gửi yêu cầu trả sớm** (Early Return)
- **Gửi yêu cầu gia hạn** (Extension): Cần Owner phê duyệt và thanh toán thêm

**Khi có thay đổi ngày trả:**
- Hệ thống tự động cập nhật lịch trình
- Gửi thông báo cho Shipper về ngày nhận hàng mới

---

### 4. GIAI ĐOẠN TRẢ HÀNG (RETURN)

#### 4.1. Shipper xác nhận nhận đơn trả hàng
- Nhận thông báo đến ngày trả hàng
- Xác nhận đảm nhận vận chuyển
- Di chuyển đến địa điểm của Renter

#### 4.2. Nhận hàng từ Renter
**Trường hợp 1 - Renter không liên lạc được:**
- Shipper thông báo cho Owner
- Owner gửi yêu cầu tranh chấp lên hệ thống
- Chuyển sang flow giải quyết tranh chấp

**Trường hợp 2 - Renter giao hàng trả:**
- Shipper nhận hàng từ Renter
- Chụp ảnh/quay video tình trạng sản phẩm **sau khi nhận từ Renter**
- Upload bằng chứng lên hệ thống
- Xác nhận đã nhận hàng từ Renter

#### 4.3. Trả hàng cho Owner
- Shipper vận chuyển hàng về cho Owner
- Giao hàng cho Owner tại địa điểm ban đầu
- Xác nhận đã trả hàng lại cho Owner

**Sau khi trả hàng:**
- **Renter nhận lại tiền cọc**
- Tiền cọc được **đóng băng 24 giờ**
- Owner có **24 giờ** để kiểm tra kỹ sản phẩm

---

### 5. HOÀN THÀNH ĐƠN HÀNG

#### 5.1. Trong 24 giờ kiểm tra:
**Nếu không có vấn đề:**
- Đơn tự động chuyển sang **COMPLETED** sau 24h
- Owner và Renter đều được cộng **+5 điểm Loyalty**
- Loyalty Points dùng để đổi voucher giảm giá

**Nếu phát hiện vấn đề:**
- Owner **bắt buộc** gửi yêu cầu tranh chấp trong 24h
- Chuyển sang flow giải quyết tranh chấp
- Tiền cọc và tiền thuê bị giữ lại cho đến khi giải quyết xong

---

## 2. SO SÁNH VỚI HỆ THỐNG HIỆN TẠI

### ✅ Đã có trong code hiện tại:

1. **Tự động tạo shipment khi ký hợp đồng** ✓
   - File: `shipment.service.js` - method `createShipmentsForSubOrder()`
   - Tạo 2 shipments: DELIVERY và RETURN

2. **Phân công shipper theo khu vực** ✓
   - File: `shipment.service.js` - method `autoAssignShipper()`
   - Match ward/district giữa owner và shipper

3. **Upload proof images/videos** ✓
   - File: `shipment.service.js` - methods `uploadProof()`, `getProof()`
   - Lưu imagesBeforeDelivery và imagesAfterDelivery

4. **Owner no-show → Cancel order** ✓
   - File: `shipment.service.js` - method `ownerNoShow()`
   - Trừ 20 credit points
   - Hoàn tiền cho renter (trừ shipping fee)

5. **Renter no-show (boom hàng)** ✓
   - File: `shipment.service.js` - method `renterNoShow()`
   - Trừ tiền thuê 1 ngày từ deposit hoặc payment

6. **Renter reject delivery** ✓
   - File: `shipment.service.js` - method `rejectDelivery()`
   - Có option gửi tranh chấp

7. **Owner nhận 90% tiền thuê** ✓
   - File: `shipment.service.js` - method `markDelivered()`
   - Transfer 90% vào frozen wallet (đóng băng 24h)

8. **Tranh chấp 24h sau khi trả hàng** ✓
   - File: `dispute.service.js`
   - Owner có 24h để mở tranh chấp

9. **Cộng loyalty points khi hoàn thành** ✓
   - File: `rentalOrder.controller.js` - method `autoCompleteOrders()`
   - +5 points cho owner và renter

10. **Real-time notifications** ✓
    - Socket events: `shipment:created`, `notification:new`
    - Email notifications

## 3. CÁC VẤN ĐỀ CÓ THỂ Q&A

### Q1: Shipper có bắt buộc phải xác nhận nhận đơn không?
**Hiện trạng**: Có bước `acceptShipment()` nhưng không bắt buộc

**Vấn đề**: 
- Nếu shipper không accept, đơn hàng sẽ ở trạng thái PENDING mãi
- Owner và Renter đợi không biết shipper có nhận hay không

**Giải pháp đề xuất**:
```javascript
// Option 1: Timeout tự động
- Sau 2 giờ không accept → Tự động assign shipper khác
- Shipper bị trừ điểm penalty

// Option 2: Bắt buộc accept trong 30 phút
- Gửi reminder notification mỗi 10 phút
- Sau 30 phút → Báo cáo admin và phạt shipper

// Option 3: Pre-accept (khuyến nghị)
- Shipper đăng ký ca làm việc trước
- Hệ thống chỉ assign cho shipper đang online
- Tự động accept nếu trong ca làm việc
```
---

### Q2: Làm sao đảm bảo shipper upload đúng ảnh sản phẩm?
**Vấn đề**: 
- Shipper có thể upload ảnh bất kỳ để qua mặt hệ thống
- Không có cơ chế verify ảnh có đúng sản phẩm không

**Giải pháp**:
1. **Bắt buộc chụp ảnh có tem xác thực**
   - Owner ký lên tem trước khi giao
   - Shipper phải chụp rõ tem trong ảnh
   
2. **Metadata kiểm tra**
   - Kiểm tra GPS location của ảnh
   - Kiểm tra timestamp không được chỉnh sửa
   
3. **AI Image Verification (tương lai)**
   - So sánh ảnh upload với ảnh sản phẩm gốc
   - Phát hiện ảnh fake/photoshop

---

### Q3: Renter từ chối nhận hàng vì "không đúng mô tả" - Làm sao tránh lạm dụng?
**Vấn đề**: 
- Renter có thể cố tình từ chối để hủy đơn miễn phí
- Owner bị thiệt khi đã chuẩn bị hàng

**Giải pháp hiện tại**:
- Renter PHẢI mở tranh chấp kèm bằng chứng
- Nếu tranh chấp không hợp lệ → Renter bị phạt

---

---

### Q6: Làm sao xử lý khi sản phẩm hỏng trong quá trình vận chuyển?
**Kịch bản**:
- Shipper đang vận chuyển, xe gặp tai nạn
- Sản phẩm bị hư hỏng do shipper

**Giải pháp**:
1. **Bảo hiểm vận chuyển**
   - Shipper phải có bảo hiểm trách nhiệm dân sự
   - Nền tảng mua bảo hiểm cho mỗi đơn hàng
   
2. **Chế độ bồi thường**
   ```javascript
   // Trong shipment schema
   insurance: {
     provider: String,
     policyNumber: String,
     coverage: Number,  // Giá trị tối đa bồi thường
     premium: Number    // Phí bảo hiểm
   }
   ```

3. **Quy trình claim**
   - Shipper báo cáo sự cố ngay lập tức
   - Upload ảnh hiện trường
   - Admin verify và xử lý bồi thường

---

### Q7: Renter thuê nhiều sản phẩm từ nhiều owner - Shipper giao thế nào?
**Kịch bản**:
- Renter thuê 3 sản phẩm từ 3 owner khác nhau cùng quận
- Tạo 3 shipment riêng lẻ?

**Giải pháp hiện tại**:
- Mỗi SubOrder (mỗi owner) có shipment riêng
- Shipper có thể nhận nhiều đơn cùng lúc

---

## 4. TRẢ LỜI CÁC CÂU HỎI ĐÃ CÓ

### ❓ Q1: "Nếu thanh toán online thì trừ vào tiền thuê, còn nếu thanh toán trực tiếp thì tụi tao có giữ cọc và sẽ trừ vào cọc" - Nếu tiền cọc ít hơn tiền thuê 1 ngày thì sao?

**Phân tích tình huống**:
```
Ví dụ:
- Tiền thuê: 500,000đ/ngày
- Tiền cọc: 300,000đ
- Renter boom hàng → Phạt 1 ngày = 500,000đ

Vấn đề: Cọc chỉ có 300,000đ → Thiếu 200,000đ
```

**Giải pháp đề xuất**:

#### Option 1: Quy định cọc tối thiểu (Khuyến nghị)
#### Option 2: Trừ dần và ghi nợ
#### Option 3: Bắt buộc thanh toán trước COD

**Khuyến nghị áp dụng**: Kết hợp cả 3
- Option 1: Ngăn chặn từ đầu
- Option 2: Xử lý trường hợp đặc biệt
- Option 3: Bảo vệ owner với đơn COD

---

### ❓ Q2: Tại sao shipper lại có thêm bước phải nhận đơn, nếu shipper không nhận đơn thì sao?

**Lý do cần bước "Accept Shipment"**:

1. **Xác nhận khả năng thực hiện**
   - Shipper có thể đang bận việc khác
   - Shipper có thể bị ốm đột xuất
   - Shipper cần check lịch trình cá nhân

2. **Quyền từ chối hợp lý**
   - Đơn hàng quá xa so với vị trí hiện tại
   - Sản phẩm quá lớn/nặng vượt khả năng vận chuyển
   - Thời gian giao hàng không phù hợp

3. **Tránh tự động hóa cứng nhắc**
   - Nếu bắt buộc nhận → Shipper bỏ việc khi gặp vấn đề
   - Nếu không có bước xác nhận → Owner/Renter không biết ai đảm nhận

### ❓ Q3: Tại sao shipper phải nhận đồng thời cả đơn giao và trả?

**Lý do thiết kế như vậy**:

#### 1. **Trách nhiệm liên tục (Continuity of Care)**
```
Shipper A:
- Ngày 1: Nhận hàng từ Owner → Giao cho Renter
  → Chụp ảnh tình trạng ban đầu (baseline)

- Ngày 10: Nhận hàng từ Renter → Trả cho Owner  
  → So sánh với ảnh ban đầu
  → Xác định trách nhiệm nếu có hư hỏng
```

**Nếu 2 shipper khác nhau**:
- Shipper B nhận trả không biết tình trạng ban đầu
- Khó xác định lỗi của ai: Shipper A, Renter, hay Shipper B?

#### 2. **Kinh tế chi phí**
- Shipper đã biết route Owner ↔ Renter
- Không cần training/brief shipper mới
- Tiết kiệm chi phí điều phối

#### 3. **Xây dựng trách nhiệm**
- Shipper biết mình sẽ phải trả lại → Cẩn thận hơn khi giao
- Shipper có động lực đảm bảo renter giữ gìn tốt

**Nhược điểm và giải pháp**:

| Nhược điểm | Giải pháp |
|------------|-----------|
| Shipper nghỉ việc/bị tai nạn giữa chừng | Backup shipper trong cùng khu vực, kế thừa proof images |
| Shipper bận vào ngày trả hàng | Cho phép swap với shipper khác + transfer proof data |
| Khoảng cách 2 chuyến khác nhau (renter chuyển địa điểm) | Tính phí bổ sung cho chuyến khác biệt |


**Cải tiến - Team Shipper**:
```javascript
// Thay vì 1 shipper, assign 1 team (2-3 người)
// Bất kỳ member nào cũng có thể đảm nhận
// Proof data shared trong team
```

---

### ❓ Q4: Nếu lúc trả hàng renter đổi vị trí trả hàng so với vị trí lúc đầu thì xử lý sao?

**Kịch bản thực tế**:
```
Lúc giao hàng:
- Địa chỉ Renter: 123 Nguyễn Văn Linh, Quận Hải Châu
- Khoảng cách từ Owner: 5km
- Phí ship: 45,000đ

Lúc trả hàng (10 ngày sau):
- Renter đã chuyển về: 456 Hoàng Sa, Quận Sơn Trà (10km từ owner)
- Hoặc Renter đi du lịch: Hội An, Quảng Nam (30km)
```

**Vấn đề**:
- Shipper đã tính phí dựa trên route ban đầu (Owner ↔ Renter location cũ)
- Địa chỉ mới xa hơn → Shipper tốn thêm xăng, thời gian
- Không công bằng nếu shipper phải tự gánh chi phí thêm

---

#### **Giải pháp đề xuất**:

**Option 1: Tính phí bổ sung tự động (Khuyến nghị)**
**Option 2: Giới hạn bán kính thay đổi**
**Option 3: Renter tự đến trả tại địa chỉ Owner (Self Return)**
