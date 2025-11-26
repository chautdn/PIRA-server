const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class ContractGenerator {
  // Tạo HTML cho hợp đồng
  async generateContractHTML(order) {
    const template = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Hợp đồng thuê sản phẩm</title>
        <style>
            body { font-family: 'Times New Roman', serif; line-height: 1.6; margin: 40px; }
            .header { text-align: center; margin-bottom: 30px; }
            .title { font-size: 18px; font-weight: bold; text-transform: uppercase; }
            .parties { display: flex; justify-content: space-between; margin: 20px 0; }
            .party { width: 45%; }
            .terms { margin: 20px 0; }
            .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
            .signature-box { width: 200px; height: 100px; border: 1px solid #ccc; margin-top: 20px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
            th { background-color: #f5f5f5; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="title">HỢP ĐỒNG THUÊ SẢN PHẨM</div>
            <p>Số: <strong>${order.contract?.contractNumber || 'PENDING'}</strong></p>
        </div>

        <div class="parties">
            <div class="party">
                <h3>BÊN CHO THUÊ (Bên A)</h3>
                <p><strong>Họ tên:</strong> ${ order.owner.profile?.firstName + ' ' + order.owner.profile?.lastName}</p>
                <p><strong>Email:</strong> ${order.owner.email}</p>
                <p><strong>Số điện thoại:</strong> ${order.owner.phone || order.owner.profile?.phone || 'N/A'}</p>
            </div>
            <div class="party">
                <h3>BÊN THUÊ (Bên B)</h3>
                <p><strong>Họ tên:</strong> ${order.renter.fullName || order.renter.profile?.firstName + ' ' + order.renter.profile?.lastName}</p>
                <p><strong>Email:</strong> ${order.renter.email}</p>
                <p><strong>Số điện thoại:</strong> ${order.renter.phone || order.renter.profile?.phone || 'N/A'}</p>
            </div>
        </div>

        <div class="terms">
            <h3>ĐIỀU KHOẢN HỢP ĐỒNG</h3>
            
            <h4>1. Thông tin sản phẩm thuê</h4>
            <table>
                <tr>
                    <th>Tên sản phẩm</th>
                    <td>${order.product.title}</td>
                </tr>
                <tr>
                    <th>Mô tả</th>
                    <td>${order.product.description || 'N/A'}</td>
                </tr>
                <tr>
                    <th>Tình trạng</th>
                    <td>${order.product.condition === 'NEW' ? 'Mới' : 'Đã sử dụng'}</td>
                </tr>
            </table>

            <h4>2. Thời gian thuê</h4>
            <table>
                <tr>
                    <th>Ngày bắt đầu</th>
                    <td>${new Date(order.rental.startDate).toLocaleDateString('vi-VN')}</td>
                </tr>
                <tr>
                    <th>Ngày kết thúc</th>
                    <td>${new Date(order.rental.endDate).toLocaleDateString('vi-VN')}</td>
                </tr>
                <tr>
                    <th>Thời gian thuê</th>
                    <td>${order.rental.duration?.value} ${
                      order.rental.duration?.unit === 'DAY'
                        ? 'ngày'
                        : order.rental.duration?.unit === 'WEEK'
                          ? 'tuần'
                          : 'tháng'
                    }</td>
                </tr>
            </table>

            <h4>3. Chi phí</h4>
            <table>
                <tr>
                    <th>Giá thuê</th>
                    <td>${order.pricing.subtotal.toLocaleString('vi-VN')} VND</td>
                </tr>
                <tr>
                    <th>Tiền cọc</th>
                    <td>${order.pricing.deposit.toLocaleString('vi-VN')} VND</td>
                </tr>
                <tr>
                    <th>Phí giao hàng</th>
                    <td>${order.pricing.deliveryFee.toLocaleString('vi-VN')} VND</td>
                </tr>
                <tr>
                    <th style="background-color: #e8f5e8;"><strong>Tổng cộng</strong></th>
                    <td style="background-color: #e8f5e8;"><strong>${order.pricing.total.toLocaleString('vi-VN')} VND</strong></td>
                </tr>
            </table>

            <h4>4. Quyền và nghĩa vụ của các bên</h4>
            
            <h5>4.1. Bên cho thuê (Bên A) có nghĩa vụ:</h5>
            <ul>
                <li>Giao sản phẩm đúng thời gian, địa điểm đã thỏa thuận</li>
                <li>Đảm bảo sản phẩm hoạt động tốt trong thời gian thuê</li>
                <li>Hướng dẫn sử dụng sản phẩm (nếu cần)</li>
                <li>Hoàn trả tiền cọc sau khi nhận lại sản phẩm (trừ các khoản phạt nếu có)</li>
            </ul>

            <h5>4.2. Bên thuê (Bên B) có nghĩa vụ:</h5>
            <ul>
                <li>Thanh toán đầy đủ theo thỏa thuận</li>
                <li>Sử dụng sản phẩm đúng mục đích, bảo quản cẩn thận</li>
                <li>Không tự ý sửa chữa, thay đổi sản phẩm</li>
                <li>Trả sản phẩm đúng thời hạn, địa điểm đã thỏa thuận</li>
                <li>Bồi thường thiệt hại nếu làm hỏng sản phẩm</li>
            </ul>

            <h4>5. Điều khoản phạt</h4>
            <ul>
                <li><strong>Trả muộn:</strong> ${(order.pricing.rentalRate * 1.5).toLocaleString('vi-VN')} VND/ngày</li>
                <li><strong>Hư hỏng:</strong> Tối đa ${(order.pricing.deposit * 0.5).toLocaleString('vi-VN')} VND hoặc chi phí sửa chữa thực tế</li>
                <li><strong>Mất sản phẩm:</strong> Bồi thường 100% giá trị sản phẩm</li>
            </ul>

            <h4>6. Điều khoản khác</h4>
            <ul>
                <li>Hợp đồng có hiệu lực khi cả hai bên đã ký</li>
                <li>Mọi tranh chấp được giải quyết thông qua thương lượng, hòa giải</li>
                <li>Hợp đồng được lập thành 02 bản, mỗi bên giữ 01 bản</li>
                <li>Hợp đồng tuân theo pháp luật Việt Nam</li>
            </ul>
        </div>

        <div class="signatures">
            <div style="text-align: center;">
                <p><strong>BÊN CHO THUÊ</strong></p>
                <p>(Ký và ghi rõ họ tên)</p>
                <div class="signature-box" id="owner-signature"></div>
                <p>${order.owner.fullName || order.owner.profile?.firstName + ' ' + order.owner.profile?.lastName}</p>
            </div>
            <div style="text-align: center;">
                <p><strong>BÊN THUÊ</strong></p>
                <p>(Ký và ghi rõ họ tên)</p>
                <div class="signature-box" id="renter-signature"></div>
                <p>${order.renter.fullName || order.renter.profile?.firstName + ' ' + order.renter.profile?.lastName}</p>
            </div>
        </div>

        <div class="footer">
            <p>Hợp đồng được tạo tự động bởi hệ thống PIRA vào ${new Date().toLocaleString('vi-VN')}</p>
            <p>Đây là hợp đồng điện tử có giá trị pháp lý theo Luật Giao dịch điện tử Việt Nam</p>
        </div>
    </body>
    </html>`;

    return template;
  }

  // Tạo PDF từ HTML
  async generateContractPDF(htmlContent, outputPath = null) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        },
        printBackground: true
      });

      if (outputPath) {
        fs.writeFileSync(outputPath, pdfBuffer);
        return outputPath;
      }

      // Save to uploads/contracts directory
      const contractsDir = path.join(__dirname, '../../uploads/contracts');
      if (!fs.existsSync(contractsDir)) {
        fs.mkdirSync(contractsDir, { recursive: true });
      }

      const filename = `contract-${Date.now()}.pdf`;
      const filepath = path.join(contractsDir, filename);
      fs.writeFileSync(filepath, pdfBuffer);

      return `/uploads/contracts/${filename}`;
    } finally {
      await browser.close();
    }
  }

  // Thêm chữ ký vào hợp đồng HTML
  addSignatureToHTML(htmlContent, signatures) {
    let updatedHTML = htmlContent;

    if (signatures.owner && signatures.owner.signed) {
      updatedHTML = updatedHTML.replace(
        'id="owner-signature"',
        `id="owner-signature" style="background-image: url('${signatures.owner.signature}'); background-size: contain; background-repeat: no-repeat; background-position: center;"`
      );
    }

    if (signatures.renter && signatures.renter.signed) {
      updatedHTML = updatedHTML.replace(
        'id="renter-signature"',
        `id="renter-signature" style="background-image: url('${signatures.renter.signature}'); background-size: contain; background-repeat: no-repeat; background-position: center;"`
      );
    }

    return updatedHTML;
  }
}

module.exports = {
  generateContractHTML: async (order) => {
    const generator = new ContractGenerator();
    return await generator.generateContractHTML(order);
  },
  generateContractPDF: async (htmlContent, outputPath) => {
    const generator = new ContractGenerator();
    return await generator.generateContractPDF(htmlContent, outputPath);
  },
  addSignatureToHTML: (htmlContent, signatures) => {
    const generator = new ContractGenerator();
    return generator.addSignatureToHTML(htmlContent, signatures);
  }
};
