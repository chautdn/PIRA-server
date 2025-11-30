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
 * POST /api/upload/videos
 * Upload multiple videos to Cloudinary (for dispute evidence)
 * Max 3 videos, max 50MB per video
 */
router.post('/videos', authMiddleware.verifyToken, upload.array('videos', 3), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No videos provided' });
    }

    // Check file size (max 50MB per video)
    const maxSize = 50 * 1024 * 1024; // 50MB
    for (const file of req.files) {
      if (file.size > maxSize) {
        return res.status(400).json({ 
          message: 'Video quá lớn. Kích thước tối đa 50MB mỗi video' 
        });
      }
    }

    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: 'disputes/evidence',
            chunk_size: 6000000, // 6MB chunks
            eager: [
              { quality: 'auto', format: 'mp4' }
            ],
            eager_async: true
          },
          (error, result) => {
            if (error) reject(error);
            else resolve({
              url: result.secure_url,
              duration: result.duration,
              format: result.format
            });
          }
        ).end(file.buffer);
      });
    });

    const videoResults = await Promise.all(uploadPromises);

    res.json({
      success: true,
      videos: videoResults,
      message: `Uploaded ${videoResults.length} videos successfully`
    });
  } catch (error) {
    console.error('Upload videos error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to upload videos',
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
