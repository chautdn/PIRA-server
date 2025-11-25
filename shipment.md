Giai đoạn 0 — Tiền đề

Renter tạo yêu cầu thuê → Owner xác nhận.

Hệ thống sinh Delivery Order.

Admin phân công shipper.

→ Status ban đầu của shipment: PENDING_PICKUP
Giai đoạn 1 — Shipper nhận nhiệm vụ
1. Hệ thống gửi thông báo đến Shipper

Thông tin gồm:

rentalOrderId

sản phẩm + số lượng

địa chỉ owner (pickup)

địa chỉ renter (delivery)

thông tin owner + renter

ngày lấy/giao dự kiến

2. Shipper xem đơn (status = "PENDING_PICKUP")
3. Shipper bấm “Xác nhận nhận nhiệm vụ”

→ Status: PENDING_PICKUP → PICKUP_CONFIRMED

Giai đoạn 2 — Đến nhà Owner để lấy hàng

Khi shipper đến địa chỉ Owner:

2.1 Xác minh Owner

So khớp thông tin hệ thống

Có thể yêu cầu CCCD để đối chiếu

2.2 Kiểm tra sản phẩm thực tế

Tên sản phẩm

Mô tả

Serial (nếu có)

Số lượng

Phụ kiện đi kèm

2.3 Kiểm tra tình trạng ban đầu

Shipper upload lên hệ thống:

Hình ảnh sản phẩm

Video quay 360°

Ảnh tem niêm phong của Owner (nếu Owner tự niêm phong)

Ghi chú tình trạng: "EXCELLENT" | "GOOD" | "FAIR" | "DAMAGED"

2.4 Dán tem niêm phong (2 TEM)

Tem 1: xác nhận sản phẩm từ Owner

Tem 2: bảo vệ trong quá trình vận chuyển (chống tráo đồ, chống xâm nhập)

→ Shipper chụp ảnh/ video tem sau khi dán

2.5 Ký biên bản bàn giao với Owner

Có thể là PDF điện tử hoặc giấy (scan/ chụp ảnh lại)

Shipper & Owner ký

Hệ thống lưu bản PDF/ảnh

2.6 Shipper cập nhật trạng thái

→ Status: PICKED_UP_FROM_OWNER

📎 Evidence cần lưu:

Ảnh sản phẩm

Ảnh/video tình trạng

Ảnh tem 1 + tem 2

Biên bản bàn giao Owner

Notes

Giai đoạn 3 — Vận chuyển
3.1 Trước khi rời điểm Owner

Hệ thống kiểm tra:

Đơn có bị yêu cầu hủy? (nếu có → shipper chờ admin)

Không cho hủy nếu sản phẩm đã được giao cho shipper

3.2 Trong khi giao hàng

Shipper cập nhật:

Status: ON_DELIVERY

Định kỳ cập nhật vị trí (nếu cần)

Gần đến nhà renter → chuyển:
→ Status: ARRIVING_AT_RENTER

Rủi ro công ty + shipper chịu trách nhiệm:

Mất hàng

Bị cướp

Hư hỏng do vận chuyển

Giai đoạn 4 — Giao hàng cho Renter
4.1 Xác minh Renter

Tên

Điện thoại

CCCD (đối chiếu ngắn, không lưu toàn bộ số)

4.2 Kiểm tra niêm phong + sản phẩm

Renter kiểm tra tem 1 + tem 2

Kiểm tra sản phẩm thực tế

Kiểm tra phụ kiện

4.3 Shipper upload bằng chứng

Ảnh/Video quá trình mở tem

Ảnh tem trước & sau khi mở

Video kiểm tra sản phẩm

(Nếu có hình renter trong khung hình → renter đồng ý)

4.4 Renter xác nhận nhận hàng

Renter bấm “Đã nhận hàng đúng sản phẩm”

Email thông báo gửi về Owner + Renter

4.5 Thanh toán nếu COD

Shipper thu tiền thuê + tiền cọc

Hệ thống xác nhận Payment → "PAID"

4.6 Shipper xác nhận hoàn tất

→ Status: DELIVERED

Giai đoạn 5 — Sau giao hàng

Shipper upload thêm:

Ảnh sản phẩm đã bàn giao

Ảnh CCCD renter (che số — chỉ hiển thị 6 số đầu/cuối)

Ảnh/video kiểm tra + niêm phong

Hệ thống:

Ghi deliveredAt

Update order → RENTAL_ACTIVE

Bắt đầu bộ đếm thời gian thuê

Thông báo Owner + Admin