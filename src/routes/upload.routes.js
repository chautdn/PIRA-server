const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');
const cloudinary = require('../config/cloudinary');

/**
 * POST /api/upload/images
 * Upload multiple images to Cloudinary (for disputes, evidence, etc.)
 */
router.post('/images', authMiddleware.verifyToken, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images provided' });
    }

    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'disputes/evidence',
            quality: 'auto',
            fetch_format: 'auto'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        ).end(file.buffer);
      });
    });

    const imageUrls = await Promise.all(uploadPromises);

    res.json({
      success: true,
      urls: imageUrls,
      message: `Uploaded ${imageUrls.length} images successfully`
    });
  } catch (error) {
    console.error('Upload images error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to upload images',
      error: error.message 
    });
  }
});

/**
 * POST /api/upload/document
 * Upload single document to Cloudinary
 */
router.post('/document', authMiddleware.verifyToken, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No document provided' });
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'disputes/documents'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    res.json({
      success: true,
      url: result.secure_url,
      message: 'Document uploaded successfully'
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to upload document',
      error: error.message 
    });
  }
});

module.exports = router;

// const express = require('express');
// const router = express.Router();
// const UploadController = require('../controllers/upload.controller');
// const multer = require('multer');

// // Use memory storage so we can upload buffer to cloudinary
// const storage = multer.memoryStorage();
// const upload = multer({ storage });

// router.post('/image', upload.single('image'), UploadController.uploadImage);

// module.exports = router;
