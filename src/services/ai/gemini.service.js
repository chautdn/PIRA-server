const { GoogleGenAI } = require('@google/genai');

/**
 * AI Service for Chatbot
 * Sử dụng Google Gemini AI (NEW SDK)
 */
class AIService {
  constructor() {
    this.ai = null;
    this.initialized = false;
  }

  /**
   * Initialize Gemini AI (lazy initialization)
   */
  initialize() {
    if (this.initialized) return;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      console.warn('⚠️ GEMINI_API_KEY not set. AI features disabled.');
      console.warn('   Get free key: https://aistudio.google.com/apikey');
      this.initialized = true;
      return;
    }

    try {
      // NEW API: Client automatically gets API key from GEMINI_API_KEY env var
      this.ai = new GoogleGenAI({});
      this.initialized = true;
    } catch (error) {
      console.error('❌ Gemini AI initialization failed:', error.message);
      this.ai = null;
      this.initialized = true;
    }
  }

  /**
   * Generate AI response with context (with retry logic)
   * @param {string} userMessage - User's message
   * @param {Array} conversationHistory - Previous messages
   * @param {Object} context - Additional context (products, categories, etc.)
   * @returns {string} AI response
   */
  async generateResponse(userMessage, conversationHistory = [], context = {}) {
    // Lazy initialization
    if (!this.initialized) {
      this.initialize();
    }

    if (!this.ai) {
      throw new Error('Gemini AI not initialized');
    }

    // Build prompts
    const systemPrompt = this.buildSystemPrompt(context);
    const conversationText = this.buildConversationHistory(conversationHistory);
    const fullPrompt = `${systemPrompt}

${conversationText}

User: ${userMessage}

AI Assistant:`;

    // Retry configuration for 503 errors
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: fullPrompt
        });

        return response.text;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;

        // 503 Service Unavailable - Retry with exponential backoff
        if (error.status === 503 && !isLastAttempt) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
          console.warn(
            `⚠️ Gemini overloaded (attempt ${attempt + 1}/${maxRetries}). Retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue; // Retry
        }

        // 429 Quota Exceeded - Don't retry
        if (error.status === 429) {
          console.error('🚫 Gemini API quota exceeded. Please check: https://ai.dev/usage');
          const quotaError = new Error('Gemini API đã vượt quá quota miễn phí hôm nay.');
          quotaError.status = 429;
          quotaError.isQuotaError = true;
          throw quotaError;
        }

        // 503 on last attempt or other errors
        console.error('AI generation error:', error);

        if (error.status === 503) {
          const overloadError = new Error('Gemini AI đang quá tải. Vui lòng thử lại sau vài giây.');
          overloadError.status = 503;
          overloadError.isOverloadError = true;
          throw overloadError;
        }

        throw error;
      }
    }
  }

  /**
   * Build system prompt with Pira context
   */
  buildSystemPrompt(context = {}) {
    let prompt = `Bạn là trợ lý ảo thông minh của Pira - nền tảng cho thuê sản phẩm tại Việt Nam.

**VỀ PIRA:**
- Nền tảng cho thuê sản phẩm P2P (peer-to-peer)
- Người dùng có thể: thuê sản phẩm, đăng sản phẩm cho thuê
- Các loại sản phẩm: máy ảnh, balo, điện thoại, laptop, thiết bị thể thao, v.v.
- Thanh toán qua ví Pira an toàn
- Có shipper giao nhận tận nơi

**QUY TRÌNH THUÊ:**
1. Tìm sản phẩm (tìm kiếm hoặc duyệt danh mục)
2. Đặt thuê (chọn ngày, thanh toán qua ví)
3. Nhận hàng (shipper giao tận nơi)
4. Trả hàng (shipper đến lấy, hoàn tiền cọc)

**GIÁ THUÊ (tham khảo):**
- Balo: 20,000 - 100,000đ/ngày
- Máy ảnh: 50,000 - 200,000đ/ngày
- Điện thoại: 100,000 - 300,000đ/ngày
- Laptop: 150,000 - 500,000đ/ngày

**CHÍNH SÁCH:**
- Cần đặt cọc (tùy chủ sản phẩm)
- Hủy trước 24h: hoàn 90%
- Hủy trong 24h: hoàn 50%
- Sản phẩm lỗi: hoàn 100%
- Tranh chấp: Admin làm trung gian`;

    // Add available products context
    if (context.availableProducts && context.availableProducts.length > 0) {
      prompt += `\n\n**SẢN PHẨM ĐANG CÓ:**\n`;
      context.availableProducts.slice(0, 5).forEach((p, i) => {
        prompt += `${i + 1}. ${p.title} - ${new Intl.NumberFormat('vi-VN').format(p.pricing?.dailyRate || 0)}đ/ngày`;
        if (p.category?.name) prompt += ` (${p.category.name})`;
        prompt += '\n';
      });
    }

    // Add categories context
    if (context.categories && context.categories.length > 0) {
      prompt += `\n**DANH MỤC SẢN PHẨM:**\n`;
      context.categories.slice(0, 10).forEach((c) => {
        prompt += `- ${c.name}\n`;
      });
    }

    prompt += `\n\n**NHIỆM VỤ CỦA BẠN:**
- Trả lời câu hỏi về sản phẩm, giá, chính sách một cách thân thiện
- Giúp tìm sản phẩm phù hợp
- Hướng dẫn cách thuê/đăng sản phẩm
- Nếu không biết chắc chắn, hãy gợi ý liên hệ support
- Trả lời bằng tiếng Việt, ngắn gọn, dễ hiểu
- Sử dụng emoji phù hợp để tạo cảm giác thân thiện
- Nếu user hỏi về sản phẩm cụ thể, gợi ý từ danh sách sản phẩm có sẵn`;

    return prompt;
  }

  /**
   * Build conversation history text
   */
  buildConversationHistory(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return '';
    }

    let text = '**LỊCH SỬ HỘI THOẠI:**\n';

    // Only last 5 messages
    const recentMessages = conversationHistory.slice(-5);

    recentMessages.forEach((msg) => {
      const role = msg.role === 'user' ? 'User' : 'AI Assistant';
      text += `${role}: ${msg.content}\n`;
    });

    return text;
  }

  /**
   * Check if AI is available
   */
  isAvailable() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.ai !== null;
  }
}

// Export singleton instance
module.exports = new AIService();
