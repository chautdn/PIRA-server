require('dotenv').config();
const nodemailer = require('nodemailer');

const sendMail = async ({ email, subject, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      service: 'gmail',
      auth: {
        user: process.env.MAIL_HOST_USERNAME,
        pass: process.env.MAIL_HOST_PASSWORD
      }
    });

    const message = {
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_HOST_USERNAME}>`,
      to: email,
      subject,
      html
    };

    const result = await transporter.sendMail(message);
    console.log(`Đã gửi email tới ${email}`);
    return result;
  } catch (error) {
    console.error('Lỗi khi gửi email:', error);
    throw new Error('Không thể gửi email');
  }
};

module.exports = sendMail;
