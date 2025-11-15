const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const { t } = require('./i18nServer');

class ContractGenerator {
  // Tạo HTML cho hợp đồng
  async generateContractHTML(order, locale = 'vi') {
  const fmtDate = (d) => {
    try {
    return new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN');
    } catch (e) {
    return new Date(d).toLocaleDateString();
    }
  };

  const title = t('contract.title', locale);
  const contractNoLabel = t('contract.contractNo', locale);
  const lessorLabel = t('contract.lessor', locale);
  const lesseeLabel = t('contract.lessee', locale);
  const productInfo = t('contract.productInfo', locale);
  const productName = t('contract.productName', locale);
  const description = t('contract.description', locale);
  const conditionLabel = t('contract.condition', locale);
  const rentalPeriod = t('contract.rentalPeriod', locale);
  const startDate = t('contract.startDate', locale);
  const endDate = t('contract.endDate', locale);
  const durationLabel = t('contract.duration', locale);
  const unitDay = t('contract.unit_day', locale);
  const unitWeek = t('contract.unit_week', locale);
  const unitMonth = t('contract.unit_month', locale);
  const pricingLabel = t('contract.pricing', locale);
  const rentalPrice = t('contract.rentalPrice', locale);
  const depositLabel = t('contract.deposit', locale);
  const deliveryFeeLabel = t('contract.deliveryFee', locale);
  const totalLabel = t('contract.total', locale);
  const lessorObl = t('contract.lessorObligations', locale);
  const lesseeObl = t('contract.lesseeObligations', locale);
  const penalties = t('contract.penalties', locale);
  const lateReturn = t('contract.lateReturn', locale);
  const damage = t('contract.damage', locale);
  const loss = t('contract.loss', locale);
  const otherTerms = t('contract.otherTerms', locale);
  const signatures = t('contract.signatures', locale);
  const generatedAt = t('contract.generatedAt', locale, { datetime: new Date().toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN') });
  const legalNotice = t('contract.legalNotice', locale);

  const conditionText = order.product.condition === 'NEW' ? (locale === 'en' ? 'New' : 'Mới') : (locale === 'en' ? 'Used' : 'Đã sử dụng');
  const durationUnit = order.rental.duration?.unit === 'DAY' ? unitDay : order.rental.duration?.unit === 'WEEK' ? unitWeek : unitMonth;

  const template = `<!DOCTYPE html>
  <html lang="${locale}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
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
      <div class="title">${title}</div>
      <p>${contractNoLabel}: <strong>${order.contract?.contractNumber || 'PENDING'}</strong></p>
    </div>

    <div class="parties">
      <div class="party">
        <h3>${lessorLabel}</h3>
        <p><strong>${t('contract.productName', locale)}:</strong> ${order.owner.fullName || order.owner.profile?.firstName + ' ' + order.owner.profile?.lastName}</p>
        <p><strong>Email:</strong> ${order.owner.email}</p>
        <p><strong>${t('contract.deliveryFee', locale)}:</strong> ${order.owner.phone || order.owner.profile?.phone || 'N/A'}</p>
      </div>
      <div class="party">
        <h3>${lesseeLabel}</h3>
        <p><strong>${t('contract.productName', locale)}:</strong> ${order.renter.fullName || order.renter.profile?.firstName + ' ' + order.renter.profile?.lastName}</p>
        <p><strong>Email:</strong> ${order.renter.email}</p>
        <p><strong>${t('contract.deliveryFee', locale)}:</strong> ${order.renter.phone || order.renter.profile?.phone || 'N/A'}</p>
      </div>
    </div>

    <div class="terms">
      <h3>${t('contract.productInfo', locale)}</h3>
            
      <h4>1. ${t('contract.productInfo', locale)}</h4>
      <table>
        <tr>
          <th>${productName}</th>
          <td>${order.product.title}</td>
        </tr>
        <tr>
          <th>${description}</th>
          <td>${order.product.description || 'N/A'}</td>
        </tr>
        <tr>
          <th>${conditionLabel}</th>
          <td>${conditionText}</td>
        </tr>
      </table>

      <h4>2. ${rentalPeriod}</h4>
      <table>
        <tr>
          <th>${startDate}</th>
          <td>${fmtDate(order.rental.startDate)}</td>
        </tr>
        <tr>
          <th>${endDate}</th>
          <td>${fmtDate(order.rental.endDate)}</td>
        </tr>
        <tr>
          <th>${durationLabel}</th>
          <td>${order.rental.duration?.value} ${durationUnit}</td>
        </tr>
      </table>

      <h4>3. ${pricingLabel}</h4>
      <table>
        <tr>
          <th>${rentalPrice}</th>
          <td>${order.pricing.subtotal.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} VND</td>
        </tr>
        <tr>
          <th>${depositLabel}</th>
          <td>${order.pricing.deposit.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} VND</td>
        </tr>
        <tr>
          <th>${deliveryFeeLabel}</th>
          <td>${order.pricing.deliveryFee.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} VND</td>
        </tr>
        <tr>
          <th style="background-color: #e8f5e8;"><strong>${totalLabel}</strong></th>
          <td style="background-color: #e8f5e8;"><strong>${order.pricing.total.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} VND</strong></td>
        </tr>
      </table>

      <h4>4. ${t('contract.rightsObligations', locale)}</h4>
            
      <h5>${lessorObl}</h5>
      <ul>
        <li>${t('contract.lessorObligations', locale)}</li>
      </ul>

      <h5>${lesseeObl}</h5>
      <ul>
        <li>${t('contract.lesseeObligations', locale)}</li>
      </ul>

      <h4>${penalties}</h4>
      <ul>
        <li><strong>${lateReturn}:</strong> ${(order.pricing.rentalRate * 1.5).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} VND/${unitDay}</li>
        <li><strong>${damage}:</strong> ${t('contract.damage', locale)} ${ (order.pricing.deposit * 0.5).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} VND</li>
        <li><strong>${loss}:</strong> ${t('contract.loss', locale)}</li>
      </ul>

      <h4>${otherTerms}</h4>
      <ul>
        <li>${t('contract.generatedAt', locale, { datetime: new Date().toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN') })}</li>
        <li>${legalNotice}</li>
      </ul>
    </div>

    <div class="signatures">
      <div style="text-align: center;">
        <p><strong>${signatures}</strong></p>
        <p>(${t('contract.signatures', locale)})</p>
        <div class="signature-box" id="owner-signature"></div>
        <p>${order.owner.fullName || order.owner.profile?.firstName + ' ' + order.owner.profile?.lastName}</p>
      </div>
      <div style="text-align: center;">
        <p><strong>${signatures}</strong></p>
        <p>(${t('contract.signatures', locale)})</p>
        <div class="signature-box" id="renter-signature"></div>
        <p>${order.renter.fullName || order.renter.profile?.firstName + ' ' + order.renter.profile?.lastName}</p>
      </div>
    </div>

    <div class="footer">
      <p>${generatedAt}</p>
      <p>${legalNotice}</p>
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
