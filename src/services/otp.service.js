const crypto = require('crypto');
const sendMail = require('../utils/mailer');
const emailTemplates = require('../utils/emailTemplates');
const { BadRequest } = require('../core/error');

/**
 * OTP Service for Contract Signing
 * - Generate OTP (6 digits)
 * - Send OTP via email
 * - Verify OTP
 * - Track resend attempts (max 3 times)
 * - OTP expires after 5 minutes
 */
class OTPService {
  constructor() {
    // In-memory storage for OTP data
    // Structure: { userId_contractId: { otp, expiresAt, attempts, sentCount } }
    this.otpStore = new Map();

    // Cleanup expired OTPs every 5 minutes
    setInterval(() => this.cleanupExpiredOTPs(), 5 * 60 * 1000);
  }

  /**
   * Generate a 6-digit OTP
   */
  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Get OTP key for storage
   */
  getOTPKey(userId, contractId) {
    return `${userId}_${contractId}`;
  }

  /**
   * Send OTP to user's email for contract signing
   * @param {Object} params
   * @param {string} params.userId - User ID (owner or renter)
   * @param {string} params.contractId - Contract ID
   * @param {string} params.userEmail - User email
   * @param {string} params.userName - User name
   * @param {string} params.userRole - 'owner' or 'renter'
   * @param {string} params.orderId - Order ID for display
   * @returns {Promise<Object>} - { success, message, expiresAt }
   */
  async sendOTP({ userId, contractId, userEmail, userName, userRole, orderId }) {
    const key = this.getOTPKey(userId, contractId);
    const existingOTP = this.otpStore.get(key);

    // Check if user has exceeded resend limit
    if (existingOTP && existingOTP.sentCount >= 3) {
      throw new BadRequest('Bạn đã vượt quá số lần gửi OTP (tối đa 3 lần). Vui lòng thử lại sau.');
    }

    // Check if need to wait before resending (30 seconds cooldown)
    if (existingOTP && existingOTP.lastSentAt) {
      const timeSinceLastSend = Date.now() - existingOTP.lastSentAt;
      const cooldownTime = 30 * 1000; // 30 seconds

      if (timeSinceLastSend < cooldownTime) {
        const remainingSeconds = Math.ceil((cooldownTime - timeSinceLastSend) / 1000);
        throw new BadRequest(`Vui lòng đợi ${remainingSeconds} giây trước khi gửi lại OTP.`);
      }
    }

    // Generate new OTP
    const otp = this.generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    const sentCount = existingOTP ? existingOTP.sentCount + 1 : 1;

    // Store OTP data
    this.otpStore.set(key, {
      otp,
      expiresAt,
      attempts: 0, // Verification attempts
      sentCount,
      lastSentAt: Date.now(),
      userEmail,
      userName,
      userRole,
      orderId
    });

    console.log(`📧 Sending OTP to ${userEmail} (${userRole}): ${otp}`);
    console.log(
      `🔑 OTP Key: ${key}, Expires at: ${new Date(expiresAt).toISOString()}, Sent count: ${sentCount}/3`
    );

    try {
      // Send OTP email
      const emailHtml = emailTemplates.contractSigningOTP(userName, userRole, orderId, otp, 5);

      await sendMail({
        email: userEmail,
        subject: `Mã xác minh ký hợp đồng thuê #${orderId} - PIRA`,
        html: emailHtml
      });

      console.log(`✅ OTP email sent successfully to ${userEmail}`);

      return {
        success: true,
        message: `Mã OTP đã được gửi đến email ${this.maskEmail(userEmail)}. Mã có hiệu lực trong 5 phút.`,
        expiresAt,
        sentCount,
        remainingAttempts: 3 - sentCount
      };
    } catch (error) {
      console.error('❌ Error sending OTP email:', error);
      // Remove OTP from store if email sending failed
      this.otpStore.delete(key);
      throw new BadRequest('Không thể gửi mã OTP. Vui lòng thử lại sau.');
    }
  }

  /**
   * Verify OTP
   * @param {Object} params
   * @param {string} params.userId - User ID
   * @param {string} params.contractId - Contract ID
   * @param {string} params.otp - OTP to verify
   * @returns {Promise<Object>} - { success, message }
   */
  async verifyOTP({ userId, contractId, otp }) {
    const key = this.getOTPKey(userId, contractId);
    const otpData = this.otpStore.get(key);

    // Check if OTP exists
    if (!otpData) {
      throw new BadRequest('Mã OTP không tồn tại hoặc đã hết hạn. Vui lòng gửi lại mã mới.');
    }

    // Check if OTP is expired
    if (Date.now() > otpData.expiresAt) {
      this.otpStore.delete(key);
      throw new BadRequest('Mã OTP đã hết hạn. Vui lòng gửi lại mã mới.');
    }

    // Increment verification attempts
    otpData.attempts += 1;

    // Check if exceeded max attempts (5 attempts)
    if (otpData.attempts > 5) {
      this.otpStore.delete(key);
      throw new BadRequest('Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã OTP mới.');
    }

    // Verify OTP
    if (otpData.otp !== otp.trim()) {
      console.log(`❌ Invalid OTP attempt ${otpData.attempts}/5 for key: ${key}`);
      this.otpStore.set(key, otpData); // Update attempts
      throw new BadRequest(`Mã OTP không chính xác. Bạn còn ${5 - otpData.attempts} lần thử.`);
    }

    // OTP is correct - remove from store
    this.otpStore.delete(key);
    console.log(`✅ OTP verified successfully for key: ${key}`);

    return {
      success: true,
      message: 'Xác minh OTP thành công. Bạn có thể tiếp tục ký hợp đồng.'
    };
  }

  /**
   * Get OTP status (for debugging/admin purposes)
   */
  getOTPStatus(userId, contractId) {
    const key = this.getOTPKey(userId, contractId);
    const otpData = this.otpStore.get(key);

    if (!otpData) {
      return { exists: false };
    }

    const isExpired = Date.now() > otpData.expiresAt;
    const remainingTime = Math.max(0, Math.ceil((otpData.expiresAt - Date.now()) / 1000));

    return {
      exists: true,
      isExpired,
      remainingTime,
      sentCount: otpData.sentCount,
      attempts: otpData.attempts,
      expiresAt: new Date(otpData.expiresAt).toISOString()
    };
  }

  /**
   * Cleanup expired OTPs from memory
   */
  cleanupExpiredOTPs() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, data] of this.otpStore.entries()) {
      if (now > data.expiresAt) {
        this.otpStore.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired OTP(s)`);
    }
  }

  /**
   * Mask email for privacy (e.g., test@example.com -> t***@example.com)
   */
  maskEmail(email) {
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) {
      return `${localPart[0]}***@${domain}`;
    }
    return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
  }

  /**
   * Clear all OTPs for a user (e.g., when user logs out or for testing)
   */
  clearUserOTPs(userId) {
    let clearedCount = 0;
    for (const [key] of this.otpStore.entries()) {
      if (key.startsWith(`${userId}_`)) {
        this.otpStore.delete(key);
        clearedCount++;
      }
    }
    console.log(`🗑️ Cleared ${clearedCount} OTP(s) for user ${userId}`);
  }
}

module.exports = new OTPService();
