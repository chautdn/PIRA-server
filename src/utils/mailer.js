require('dotenv').config();
const nodemailer = require('nodemailer');

const sendMail = async ({ email, subject, html }) => {
  try {
    console.log('=== Sending Email ===');
    console.log('To:', email);
    console.log('Subject:', subject);
    console.log('MAIL_HOST:', process.env.MAIL_HOST);
    console.log('MAIL_HOST_USERNAME:', process.env.MAIL_HOST_USERNAME);
    console.log('MAIL_HOST_PASSWORD exists:', !!process.env.MAIL_HOST_PASSWORD);
    console.log('MAIL_FROM_NAME:', process.env.MAIL_FROM_NAME);

    // Validate email configuration
    if (!process.env.MAIL_HOST_USERNAME || !process.env.MAIL_HOST_PASSWORD) {
      throw new Error('Email configuration is missing. Please check MAIL_HOST_USERNAME and MAIL_HOST_PASSWORD in .env file');
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
    console.log('✅ Email transporter verified successfully');

    const message = {
      from: `"${process.env.MAIL_FROM_NAME || 'PIRA'}" <${process.env.MAIL_HOST_USERNAME}>`,
      to: email,
      subject,
      html
    };

    console.log('Sending email message...');
    const result = await transporter.sendMail(message);
    console.log('✅ Email sent successfully');
    console.log('Message ID:', result.messageId);
    console.log('Response:', result.response);
    console.log('===================');
    
    return result;
  } catch (error) {
    console.error('❌ Error sending email:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    console.error('===================');
    
    // Throw detailed error
    throw new Error(`Không thể gửi email: ${error.message}`);
  }
};

module.exports = sendMail;
