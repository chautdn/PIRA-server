const express = require('express');
const router = express.Router();
const multer = require('multer');
const ClarifaiService = require('../services/ai/clarifai.service');
const CategoryMappingService = require('../services/ai/categoryMapping.service');
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

// Register route
registerRoute('/ai', router);

module.exports = router;
