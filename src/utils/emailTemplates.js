const emailTemplates = {
  verificationEmail: (username, verificationUrl) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Xác thực Email</title>
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
            <h1 style="font-size: 24px; color: #333333; margin: 0 0 20px; text-align: center;">Xác thực Email</h1>
            <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">Xin chào ${username},</p>
            <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">Vui lòng nhấp vào nút dưới đây để xác thực email của bạn và kích hoạt tài khoản:</p>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 20px auto;">
              <tr>
                <td style="text-align: center;">
                  <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: #ffffff; text-decoration: none; font-size: 16px; border-radius: 4px; font-weight: bold;">Xác thực Email</a>
                </td>
              </tr>
            </table>
            <p style="font-size: 14px; color: #777777; line-height: 1.6; margin: 20px 0 0;">Liên kết này sẽ hết hạn sau 1 giờ. Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px; text-align: center; background-color: #f8f8f8; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
            <p style="font-size: 14px; color: #777777; margin: 0;">© 2025 PIRA System. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `,

  resetPasswordEmail: (username, resetUrl) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Đặt lại mật khẩu</title>
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
            <h1 style="font-size: 24px; color: #333333; margin: 0 0 20px; text-align: center;">Đặt lại mật khẩu</h1>
            <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">Xin chào ${username},</p>
            <p style="font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 20px;">Bạn đã yêu cầu đặt lại mật khẩu. Vui lòng nhấp vào nút dưới đây để đặt lại mật khẩu của bạn:</p>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 20px auto;">
              <tr>
                <td style="text-align: center;">
                  <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #dc3545; color: #ffffff; text-decoration: none; font-size: 16px; border-radius: 4px; font-weight: bold;">Đặt lại mật khẩu</a>
                </td>
              </tr>
            </table>
            <p style="font-size: 14px; color: #777777; line-height: 1.6; margin: 20px 0 0;">Liên kết này sẽ hết hạn sau 1 giờ. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px; text-align: center; background-color: #f8f8f8; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
            <p style="font-size: 14px; color: #777777; margin: 0;">© 2025 PIRA System. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
};

module.exports = emailTemplates;
