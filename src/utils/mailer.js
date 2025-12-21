require('dotenv').config();
const nodemailer = require('nodemailer');

const sendMail = async ({ email, subject, html }) => {
  try {
    // Sending email

    // Validate email configuration
    if (!process.env.MAIL_HOST_USERNAME || !process.env.MAIL_HOST_PASSWORD) {
      throw new Error(
        'Email configuration is missing. Please check MAIL_HOST_USERNAME and MAIL_HOST_PASSWORD in .env file'
      );
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_HOST_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.MAIL_HOST_USERNAME.trim(),
        pass: process.env.MAIL_HOST_PASSWORD.trim()
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Verify transporter configuration
    await transporter.verify();
    // Email transporter verified successfully

    const message = {
      from: `"${process.env.MAIL_FROM_NAME || 'PIRA'}" <${process.env.MAIL_HOST_USERNAME}>`,
      to: email,
      subject,
      html
    };

    // Sending email message
    const result = await transporter.sendMail(message);
    // Email sent successfully

    return result;
  } catch (error) {
    // Error sending email

    // Throw detailed error
    throw new Error(`Không thể gửi email: ${error.message}`);
  }
};

/**
 * Send shipper notification email about new shipment
 */
const sendShipperNotificationEmail = async (
  shipper,
  shipment,
  product,
  renterInfo,
  orderDetails
) => {
  try {
    const emailTemplates = require('./emailTemplates');

    if (!shipper.email) {
      // Shipper email not found
      return null;
    }

    const shipperName =
      `${shipper.profile?.firstName || ''} ${shipper.profile?.lastName || ''}`.trim() ||
      shipper.email;
    const shipmentType = shipment.type === 'DELIVERY' ? 'Giao hàng' : 'Nhận trả';
    const scheduledDate = new Date(shipment.scheduledAt).toLocaleDateString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const html = emailTemplates.shipperNotificationEmail(
      shipperName,
      shipment.shipmentId,
      shipment.type,
      product?.name || 'Sản phẩm',
      {
        name: renterInfo?.name || shipment.contactInfo?.name,
        phone: renterInfo?.phone || shipment.contactInfo?.phone,
        email: renterInfo?.email || ''
      },
      scheduledDate,
      {
        rentalStartDate: orderDetails?.rentalStartDate || 'N/A',
        rentalEndDate: orderDetails?.rentalEndDate || 'N/A',
        notes: shipment.contactInfo?.notes || ''
      }
    );

    const subject = `[PIRA] Đơn hàng vận chuyển mới #${shipment.shipmentId} - ${shipmentType}`;

    // Sending shipper notification email

    const result = await sendMail({
      email: shipper.email,
      subject,
      html
    });

    // Shipper notification email sent successfully
    return result;
  } catch (error) {
    // Error sending shipper notification email
    throw error;
  }
};

/**
 * Send dispute notification email to respondent
 * @param {Object} respondent - Respondent user object
 * @param {Object} complainant - Complainant user object (person who created dispute)
 * @param {Object} dispute - Dispute object
 * @param {String} productName - Product name
 */
const sendDisputeNotificationEmail = async (respondent, complainant, dispute, productName) => {
  try {
    const emailTemplates = require('./emailTemplates');

    if (!respondent.email) {
      // Respondent email not found
      return null;
    }

    const respondentName =
      respondent.profile?.fullName ||
      `${respondent.profile?.firstName || ''} ${respondent.profile?.lastName || ''}`.trim() ||
      respondent.email;

    const complainantName =
      complainant.profile?.fullName ||
      `${complainant.profile?.firstName || ''} ${complainant.profile?.lastName || ''}`.trim() ||
      complainant.email;

    // Mapping dispute type to Vietnamese label
    const disputeTypeLabels = {
      WRONG_PRODUCT: 'Sản phẩm sai mô tả',
      DAMAGED_ON_DELIVERY: 'Hư hỏng khi giao hàng',
      DAMAGED_ON_RETURN: 'Hư hỏng khi trả hàng',
      DAMAGED_BY_SHIPPER: 'Hư hỏng do shipper',
      RENTER_NO_RETURN: 'Renter không trả hàng',
      OTHER: 'Khác'
    };

    const disputeTypeLabel = disputeTypeLabels[dispute.type] || dispute.type;

    const createdAt = new Date(dispute.createdAt).toLocaleString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const disputeUrl = `${process.env.CLIENT_URL || 'https://pira.asia'}/disputes/${dispute._id}`;

    const html = emailTemplates.disputeNotificationEmail(
      respondentName,
      complainantName,
      dispute.disputeId,
      disputeTypeLabel,
      productName || 'Sản phẩm',
      dispute.description,
      disputeUrl,
      createdAt
    );

    const subject = `[PIRA] ⚠️ Bạn có khiếu nại mới #${dispute.disputeId}`;

    // Sending dispute notification email

    const result = await sendMail({
      email: respondent.email,
      subject,
      html
    });

    // Dispute notification email sent successfully
    return result;
  } catch (error) {
    // Error sending dispute notification email
    // Don't throw error to prevent blocking the main flow
    return null;
  }
};

module.exports = sendMail;
module.exports.sendShipperNotificationEmail = sendShipperNotificationEmail;
module.exports.sendDisputeNotificationEmail = sendDisputeNotificationEmail;
