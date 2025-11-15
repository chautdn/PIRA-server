const { t } = require('./i18nServer');

function verificationEmail(username, verificationUrl, locale = 'vi') {
  const title = t('email.verification.title', locale);
  const greeting = t('email.verification.greeting', locale, { username });
  const instruction = t('email.verification.instruction', locale);
  const button = t('email.verification.button', locale);
  const expire = t('email.verification.expire', locale);

  return `<!DOCTYPE html>
    <html lang="${locale}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <tr>
          <td style="padding: 20px 0; text-align: center; background-color: #007bff; border-top-left-radius: 8px; border-top-right-radius: 8px;">
            <img src="https://via.placeholder.com/150x50?text=PIRA+System" alt="Logo" style="max-width: 150px; height: auto;">
          </td>
        </tr>
        <tr>
          <td style="padding: 30px;">
            <h1 style="font-size: 24px; color: #333333; margin: 0 0 20px; text-align: center;">${title}</h1>
            <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">${greeting}</p>
            <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">${instruction}</p>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 20px auto;">
              <tr>
                <td style="text-align: center;">
                  <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: #ffffff; text-decoration: none; font-size: 16px; border-radius: 4px; font-weight: bold;">${button}</a>
                </td>
              </tr>
            </table>
            <p style="font-size: 14px; color: #777777; line-height: 1.6; margin: 20px 0 0;">${expire}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px; text-align: center; background-color: #f8f8f8; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
            <p style="font-size: 14px; color: #777777; margin: 0;">© ${new Date().getFullYear()} PIRA System. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

function resetPasswordEmail(username, resetUrl, locale = 'vi') {
  const title = t('email.reset.title', locale);
  const greeting = t('email.reset.greeting', locale, { username });
  const instruction = t('email.reset.instruction', locale);
  const button = t('email.reset.button', locale);
  const expire = t('email.reset.expire', locale);

  return `<!DOCTYPE html>
    <html lang="${locale}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <tr>
          <td style="padding: 20px 0; text-align: center; background-color: #dc3545; border-top-left-radius: 8px; border-top-right-radius: 8px;">
            <img src="https://via.placeholder.com/150x50?text=PIRA+System" alt="Logo" style="max-width: 150px; height: auto;">
          </td>
        </tr>
        <tr>
          <td style="padding: 30px;">
            <h1 style="font-size: 24px; color: #333333; margin: 0 0 20px; text-align: center;">${title}</h1>
            <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">${greeting}</p>
            <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">${instruction}</p>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 20px auto;">
              <tr>
                <td style="text-align: center;">
                  <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #dc3545; color: #ffffff; text-decoration: none; font-size: 16px; border-radius: 4px; font-weight: bold;">${button}</a>
                </td>
              </tr>
            </table>
            <p style="font-size: 14px; color: #777777; line-height: 1.6; margin: 20px 0 0;">${expire}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px; text-align: center; background-color: #f8f8f8; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
            <p style="font-size: 14px; color: #777777; margin: 0;">© ${new Date().getFullYear()} PIRA System. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

module.exports = { verificationEmail, resetPasswordEmail };
