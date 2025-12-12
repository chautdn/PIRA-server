const express = require('express');
const router = express.Router();
const multer = require('multer');
const ClarifaiService = require('../services/ai/clarifai.service');
const CategoryMappingService = require('../services/ai/categoryMapping.service');
const VisualSearchService = require('../services/ai/visualSearch.service');
const ChatbotService = require('../services/ai/chatbot.service');
const { registerRoute } = require('./register.routes');

// Cấu hình multer để upload file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh'), false);
    }
  }
});

/**
 * POST /api/ai/analyze-image
 * Phân tích ảnh và trả về labels từ Clarifai
 */
router.post('/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng upload ảnh'
      });
    }

    console.log('📸 Analyzing image:', req.file.originalname, req.file.size, 'bytes');

    // Phân tích ảnh với Clarifai
    const analysisResult = await ClarifaiService.analyzeImageWithWorkflow(req.file.buffer);

    console.log('📥 Clarifai result:', JSON.stringify(analysisResult, null, 2));

    // Trích xuất labels
    const labels = extractLabelsFromAnalysis(analysisResult);

    console.log('✅ Extracted labels:', labels);

    res.json({
      success: true,
      labels,
      message: 'Phân tích ảnh thành công'
    });
  } catch (error) {
    console.error('❌ Error analyzing image:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi phân tích ảnh'
    });
  }
});

/**
 * Trích xuất labels từ Clarifai analysis
 */
function extractLabelsFromAnalysis(analysisResult) {
  const labels = [];

  try {
    // QUAN TRỌNG: Chỉ lấy từ conceptDetection (general-image-recognition)
    // Bỏ qua NSFW labels (sfw, nsfw)
    if (analysisResult.conceptDetection && analysisResult.conceptDetection.rawConcepts) {
      const concepts = analysisResult.conceptDetection.rawConcepts;
      concepts.forEach((concept) => {
        const name = concept.name.toLowerCase();

        // Bỏ qua NSFW labels và các labels không liên quan
        if (name === 'sfw' || name === 'nsfw' || name === 'no person' || name === 'indoors') {
          return;
        }

        if (concept.value >= 0.5) {
          labels.push({
            name: concept.name,
            confidence: concept.value,
            id: concept.id || concept.name
          });
        }
      });
    }

    // Sort theo confidence
    labels.sort((a, b) => b.confidence - a.confidence);

    console.log(
      '✅ Final labels (filtered):',
      labels.map((l) => l.name)
    );

    // Top 10 labels
    return labels.slice(0, 10);
  } catch (error) {
    console.error('❌ Error extracting labels:', error);
    return [];
  }
}

/**
 * POST /api/ai/visual-search
 * Tìm kiếm sản phẩm dựa trên hình ảnh
 * Phân tích hình ảnh → Match với categories → Tìm products phù hợp
 */
router.post('/visual-search', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng upload ảnh'
      });
    }

    console.log('🖼️ Visual search for image:', req.file.originalname);

    // 1. Phân tích ảnh với Clarifai
    const analysisResult = await ClarifaiService.analyzeImageWithWorkflow(req.file.buffer);

    // 2. Check NSFW
    if (!analysisResult.nsfwDetection.safe) {
      return res.status(400).json({
        success: false,
        message: 'Hình ảnh không phù hợp (chứa nội dung không phù hợp)'
      });
    }

    // 3. Trích xuất concepts
    const concepts =
      analysisResult.conceptDetection.rawConcepts
        ?.filter((c) => c.value >= 0.5)
        .map((c) => ({
          name: c.name,
          value: c.value,
          id: c.id || c.name
        }))
        .slice(0, 20) || []; // Top 20 concepts

    if (concepts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không thể nhận diện được nội dung trong ảnh'
      });
    }

    console.log(
      '🏷️ Extracted concepts:',
      concepts.map((c) => `${c.name}(${(c.value * 100).toFixed(0)}%)`)
    );

    // 4. Tìm kiếm products dựa trên concepts
    const searchOptions = {
      limit: parseInt(req.query.limit) || 20,
      minScore: parseFloat(req.query.minScore) || 0.1,
      includeInactive: req.query.includeInactive === 'true'
    };

    const searchResult = await VisualSearchService.searchByImageConcepts(concepts, searchOptions);

    console.log(`✅ Found ${searchResult.totalFound} products`);

    res.json({
      success: true,
      data: {
        products: searchResult.products,
        matchedCategories: searchResult.matchedCategories.map((mc) => ({
          id: mc.category._id,
          name: mc.category.name,
          slug: mc.category.slug,
          score: mc.score.toFixed(2),
          matchedConcepts: mc.matchedConcepts.map((c) => c.name)
        })),
        searchInfo: {
          totalFound: searchResult.totalFound,
          concepts: searchResult.searchConcepts,
          topConcepts: concepts.slice(0, 5).map((c) => ({
            name: c.name,
            confidence: (c.value * 100).toFixed(1) + '%'
          }))
        }
      },
      message: 'Tìm kiếm thành công'
    });
  } catch (error) {
    console.error('❌ Visual search error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi tìm kiếm bằng hình ảnh'
    });
  }
});

/**
 * POST /api/ai/chat
 * Chatbot AI - Trả lời câu hỏi của khách hàng
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập tin nhắn'
      });
    }

    console.log('💬 User message:', message);

    // Process message with chatbot service
    const response = await ChatbotService.processMessage(message, conversationHistory || []);

    console.log('🤖 Bot response:', response.reply.substring(0, 100) + '...');

    res.json({
      success: true,
      data: response,
      message: 'Xử lý thành công'
    });
  } catch (error) {
    console.error('❌ Chatbot error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi khi xử lý tin nhắn'
    });
  }
});

// Register route
registerRoute('/ai', router);

module.exports = router;
