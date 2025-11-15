require('dotenv').config();
const nodemailer = require('nodemailer');
const { t } = require('./i18nServer');

/**
 * sendMail options: { email, subject, html, locale }
 */
const sendMail = async ({ email, subject, html, locale = 'vi' }) => {
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
    return result;
  } catch (error) {
    // Use server i18n messages
    const errMsg = t('mailer.sendFailed', locale);
    throw new Error(errMsg);
  }
};

module.exports = sendMail;
