const Contract = require('../models/Contract');
const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const User = require('../models/User');
const Product = require('../models/Product');
const fs = require('fs').promises;
const path = require('path');
const PDFDocument = require('pdfkit');

class ContractService {
  /**
   * Tạo nội dung hợp đồng từ template
   */
  async generateContractContent(contractId) {
    const contract = await Contract.findById(contractId).populate([
      { path: 'owner', select: 'profile email' },
      { path: 'renter', select: 'profile email' },
      { path: 'product' }
    ]);

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    // Lấy thông tin SubOrder để có đầy đủ chi tiết
    const subOrder = await SubOrder.findById(contract.order).populate('masterOrder');

    const contractTemplate = await this.getContractTemplate();

    // Thay thế các placeholder trong template
    const contractContent = contractTemplate
      .replace(/{{CONTRACT_NUMBER}}/g, contract.contractNumber || 'N/A')
      .replace(/{{CONTRACT_DATE}}/g, new Date().toLocaleDateString('vi-VN'))
      .replace(/{{OWNER_NAME}}/g, contract.owner.profile.fullName || '')
      .replace(/{{OWNER_EMAIL}}/g, contract.owner.email || '')
      .replace(/{{OWNER_PHONE}}/g, contract.owner.profile.phone || '')
      .replace(/{{OWNER_ADDRESS}}/g, this.formatAddress(contract.owner.profile.address))
      .replace(/{{OWNER_ID_NUMBER}}/g, contract.owner.profile.idNumber || '')
      .replace(/{{RENTER_NAME}}/g, contract.renter.profile.fullName || '')
      .replace(/{{RENTER_EMAIL}}/g, contract.renter.email || '')
      .replace(/{{RENTER_PHONE}}/g, contract.renter.profile.phone || '')
      .replace(/{{RENTER_ADDRESS}}/g, this.formatAddress(contract.renter.profile.address))
      .replace(/{{RENTER_ID_NUMBER}}/g, contract.renter.profile.idNumber || '')
      .replace(/{{PRODUCT_NAME}}/g, contract.product.name || '')
      .replace(/{{PRODUCT_DESCRIPTION}}/g, contract.product.description || '')
      .replace(/{{PRODUCT_SERIAL}}/g, contract.product.serialNumber || 'N/A')
      .replace(/{{PRODUCT_VALUE}}/g, this.formatCurrency(contract.product.price))
      .replace(/{{START_DATE}}/g, new Date(contract.terms.startDate).toLocaleDateString('vi-VN'))
      .replace(/{{END_DATE}}/g, new Date(contract.terms.endDate).toLocaleDateString('vi-VN'))
      .replace(/{{RENTAL_RATE}}/g, this.formatCurrency(contract.terms.rentalRate))
      .replace(/{{DEPOSIT_AMOUNT}}/g, this.formatCurrency(contract.terms.deposit))
      .replace(
        /{{TOTAL_AMOUNT}}/g,
        this.formatCurrency(contract.terms.rentalRate + contract.terms.deposit)
      )
      .replace(
        /{{DELIVERY_ADDRESS}}/g,
        subOrder ? this.formatAddress(subOrder.masterOrder.deliveryAddress) : ''
      )
      .replace(
        /{{DELIVERY_METHOD}}/g,
        subOrder
          ? subOrder.masterOrder.deliveryMethod === 'PICKUP'
            ? 'Nhận trực tiếp'
            : 'Giao tận nơi'
          : ''
      )
      .replace(/{{PLATFORM_NAME}}/g, 'PIRA - Nền tảng cho thuê sản phẩm')
      .replace(/{{PLATFORM_ADDRESS}}/g, 'Tầng 5, Tòa nhà FPT, Quận 9, TP.HCM')
      .replace(/{{PLATFORM_PHONE}}/g, '1900-1234')
      .replace(/{{PLATFORM_EMAIL}}/g, 'support@pira.vn');

    return contractContent;
  }

  /**
   * Lấy template hợp đồng
   */
  async getContractTemplate() {
    return `
HỢP ĐỒNG CHO THUÊ SẢN PHẨM ĐIỆN TỬ

Số hợp đồng: {{CONTRACT_NUMBER}}
Ngày ký: {{CONTRACT_DATE}}

============================================
BÊN CHO THUÊ (BÊN A):
============================================
Họ và tên: {{OWNER_NAME}}
Email: {{OWNER_EMAIL}}
Số điện thoại: {{OWNER_PHONE}}
Địa chỉ: {{OWNER_ADDRESS}}
Số CMND/CCCD: {{OWNER_ID_NUMBER}}

============================================
BÊN THUÊ (BÊN B):
============================================
Họ và tên: {{RENTER_NAME}}
Email: {{RENTER_EMAIL}}
Số điện thoại: {{RENTER_PHONE}}
Địa chỉ: {{RENTER_ADDRESS}}
Số CMND/CCCD: {{RENTER_ID_NUMBER}}

============================================
BÊN TRUNG GIAN (BÊN C):
============================================
Tên: {{PLATFORM_NAME}}
Địa chỉ: {{PLATFORM_ADDRESS}}
Điện thoại: {{PLATFORM_PHONE}}
Email: {{PLATFORM_EMAIL}}

============================================
THÔNG TIN SẢN PHẨM:
============================================
Tên sản phẩm: {{PRODUCT_NAME}}
Mô tả: {{PRODUCT_DESCRIPTION}}
Số serial: {{PRODUCT_SERIAL}}
Giá trị sản phẩm: {{PRODUCT_VALUE}} VND

============================================
ĐIỀU KHOẢN THUÊ:
============================================
1. THỜI GIAN THUÊ:
   - Từ ngày: {{START_DATE}}
   - Đến ngày: {{END_DATE}}

2. GIÁ THUÊ:
   - Giá thuê: {{RENTAL_RATE}} VND
   - Tiền đặt cọc: {{DEPOSIT_AMOUNT}} VND
   - Tổng cộng: {{TOTAL_AMOUNT}} VND

3. GIAO NHẬN:
   - Hình thức: {{DELIVERY_METHOD}}
   - Địa chỉ giao hàng: {{DELIVERY_ADDRESS}}

============================================
NGHĨA VỤ CỦA CÁC BÊN:
============================================

NGHĨA VỤ CỦA BÊN A (CHỦ CHO THUÊ):
1. Giao sản phẩm đúng thời gian, đúng chất lượng như đã cam kết
2. Đảm bảo sản phẩm hoạt động bình thường trong suốt thời gian thuê
3. Hướng dẫn sử dụng sản phẩm (nếu cần)
4. Nhận lại sản phẩm sau khi kết thúc thời gian thuê
5. Hoàn trả tiền đặt cọc cho Bên B sau khi nhận lại sản phẩm nguyên vẹn

NGHĨA VỤ CỦA BÊN B (NGƯỜI THUÊ):
1. Thanh toán đầy đủ tiền thuê và tiền đặt cọc theo thỏa thuận
2. Sử dụng sản phẩm đúng mục đích và cẩn thận
3. Không được chuyển nhượng, cho mượn sản phẩm cho bên thứ 3
4. Bồi thường thiệt hại nếu làm hỏng hoặc mất sản phẩm
5. Trả sản phẩm đúng thời hạn và trong tình trạng như khi nhận

NGHĨA VỤ CỦA BÊN C (NỀN TẢNG):
1. Đảm bảo an toàn giao dịch giữa hai bên
2. Giữ tiền đặt cọc và tiền thuê trong tài khoản ký quỹ
3. Xử lý tranh chấp (nếu có) theo quy định
4. Chuyển tiền cho Bên A sau khi giao dịch hoàn tất
5. Hoàn tiền cọc cho Bên B khi nhận lại sản phẩm nguyên vẹn

============================================
XỬ LÝ TRANH CHẤP:
============================================
1. Các tranh chấp phát sinh sẽ được giải quyết thông qua thương lượng
2. Nếu không thương lượng được, sẽ đưa ra trọng tài của Bên C
3. Quyết định của Bên C có tính chất ràng buộc với cả hai bên
4. Trường hợp vi phạm nghiêm trọng, có thể khởi kiện ra tòa án

============================================
ĐIỀU KHOẢN CHUNG:
============================================
1. Hợp đồng có hiệu lực kể từ khi cả hai bên ký xác nhận
2. Hợp đồng được lập thành 3 bản có giá trị pháp lý như nhau
3. Mọi sửa đổi phải có sự đồng ý bằng văn bản của cả ba bên
4. Hợp đồng áp dụng theo pháp luật Việt Nam

============================================
CHỮ KÝ XÁC NHẬN:
============================================

BÊN A (CHỦ CHO THUÊ)          BÊN B (NGƯỜI THUÊ)          BÊN C (NỀN TẢNG)
{{OWNER_NAME}}                {{RENTER_NAME}}             {{PLATFORM_NAME}}

Chữ ký: ________________     Chữ ký: ________________     Chữ ký: [ĐIỆN TỬ]

Ngày ký: {{CONTRACT_DATE}}    Ngày ký: {{CONTRACT_DATE}}    Ngày ký: {{CONTRACT_DATE}}

============================================
`;
  }

  /**
   * Tạo file PDF từ nội dung hợp đồng
   */
  async generateContractPDF(contractId) {
    const contract = await Contract.findById(contractId);
    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    const content = await this.generateContractContent(contractId);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        // Font tiếng Việt
        doc.font('Helvetica');

        // Header
        doc.fontSize(18).text('HỢP ĐỒNG CHO THUÊ SẢN PHẨM', 0, 50, { align: 'center' });

        doc
          .fontSize(12)
          .text(`Số hợp đồng: ${contract.contractNumber || 'N/A'}`, 50, 100)
          .text(`Ngày ký: ${new Date().toLocaleDateString('vi-VN')}`, 50, 120);

        // Content
        const lines = content.split('\n');
        let y = 150;

        lines.forEach((line) => {
          if (y > 750) {
            // Trang mới
            doc.addPage();
            y = 50;
          }

          if (line.includes('====')) {
            return; // Skip separator lines
          }

          if (line.trim() === '') {
            y += 10;
            return;
          }

          // Bold headers
          if (
            line.includes('BÊN ') ||
            line.includes('THÔNG TIN ') ||
            line.includes('ĐIỀU KHOẢN ') ||
            line.includes('NGHĨA VỤ ')
          ) {
            doc.font('Helvetica-Bold').fontSize(12).text(line.trim(), 50, y);
            y += 20;
          } else {
            doc.font('Helvetica').fontSize(10).text(line.trim(), 50, y);
            y += 15;
          }
        });

        // Digital signature section
        if (
          contract.signatures &&
          contract.signatures.owner.signed &&
          contract.signatures.renter.signed
        ) {
          doc.addPage();
          doc.fontSize(14).text('CHỮ KÝ ĐIỆN TỬ', 0, 50, { align: 'center' });

          y = 100;
          doc
            .fontSize(10)
            .text(
              `Chữ ký chủ cho thuê: ${contract.signatures.owner.signedAt ? 'Đã ký ngày ' + contract.signatures.owner.signedAt.toLocaleDateString('vi-VN') : 'Chưa ký'}`,
              50,
              y
            );

          y += 30;
          doc.text(
            `Chữ ký người thuê: ${contract.signatures.renter.signedAt ? 'Đã ký ngày ' + contract.signatures.renter.signedAt.toLocaleDateString('vi-VN') : 'Chưa ký'}`,
            50,
            y
          );

          y += 30;
          doc.text(
            `Chữ ký nền tảng: Đã ký điện tử ngày ${new Date().toLocaleDateString('vi-VN')}`,
            50,
            y
          );
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Gửi thông báo ký hợp đồng
   */
  async sendContractNotification(contractId, userId, action) {
    // Implementation sẽ tích hợp với notification service
    console.log(`Contract notification: ${action} by ${userId} for contract ${contractId}`);

    // Có thể gửi email, push notification, etc.
    return true;
  }

  /**
   * Kiểm tra trạng thái ký hợp đồng
   */
  async checkSignatureStatus(contractId) {
    const contract = await Contract.findById(contractId).populate(['owner', 'renter']);

    if (!contract) {
      throw new Error('Không tìm thấy hợp đồng');
    }

    const ownerSigned = contract.signatures.owner.signed;
    const renterSigned = contract.signatures.renter.signed;

    let status = 'PENDING_SIGNATURE';
    let nextAction = 'Chờ ký từ cả hai bên';

    if (ownerSigned && renterSigned) {
      status = 'SIGNED';
      nextAction = 'Hợp đồng đã hoàn tất';
    } else if (ownerSigned && !renterSigned) {
      status = 'PENDING_RENTER';
      nextAction = 'Chờ người thuê ký';
    } else if (!ownerSigned && renterSigned) {
      status = 'PENDING_OWNER';
      nextAction = 'Chờ chủ cho thuê ký';
    }

    return {
      contractId,
      status,
      nextAction,
      signatures: {
        owner: {
          name: contract.owner.profile.fullName,
          signed: ownerSigned,
          signedAt: contract.signatures.owner.signedAt
        },
        renter: {
          name: contract.renter.profile.fullName,
          signed: renterSigned,
          signedAt: contract.signatures.renter.signedAt
        }
      }
    };
  }

  /**
   * Utility methods
   */
  formatAddress(address) {
    if (!address) return '';

    const parts = [
      address.streetAddress,
      address.ward,
      address.district,
      address.city,
      address.province
    ].filter((part) => part && part.trim());

    return parts.join(', ');
  }

  formatCurrency(amount) {
    if (!amount) return '0';
    return new Intl.NumberFormat('vi-VN').format(amount);
  }
}

module.exports = new ContractService();
