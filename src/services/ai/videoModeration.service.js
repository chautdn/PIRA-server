/**
 * videoModeration.service.js
 *
 * Service for moderating e-commerce product videos using
 * Google Cloud Video Intelligence API.
 *
 * Features:
 * - Detects explicit / NSFW content
 * - Extracts labels to validate product category
 * - Rejects videos with explicit content likelihood >= LIKELY
 */

const video = require('@google-cloud/video-intelligence');
const CloudinaryService = require('../cloudinary/cloudinary.service');
const CategoryMappingService = require('./categoryMapping.service');
const Category = require('../../models/Category');
const path = require('path');

// Initialize client with service account
// Priority: 1) Individual env variables, 2) File path from env, 3) Default file path
let client;

if (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
  // Use individual credentials from environment variables
  console.log('🔑 Using Video Intelligence credentials from environment variables');
  const credentials = {
    type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE || 'service_account',
    project_id: process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID,
    private_key_id: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_ID,
    auth_uri:
      process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri:
      process.env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url:
      process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_CERT_URL ||
      'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_CERT_URL,
    universe_domain: process.env.GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN || 'googleapis.com'
  };
  client = new video.VideoIntelligenceServiceClient({ credentials });
} else {
  // Use service account file
  const keyFilePath =
    process.env.GOOGLE_VIDEO_INTELLIGENCE_CREDENTIALS ||
    path.join(__dirname, '../../../../pira-481915-ca92faf6fdef.json');
  console.log('🔑 Using Video Intelligence credentials from file:', keyFilePath);
  client = new video.VideoIntelligenceServiceClient({ keyFilename: keyFilePath });
}

class VideoModerationService {
  /**
   * Get category keywords for video validation
   * Extends image category mapping to video context
   */
  static getCategoryKeywords(categoryName) {
    // Use existing category mapping service
    return CategoryMappingService.getCategoryKeywords(categoryName);
  }

  /**
   * Upload video to Cloudinary
   * @param {Buffer} videoBuffer - Video buffer
   * @param {Object} options - Upload options
   * @returns {Object} Upload result
   */
  static async uploadVideoToCloudinary(videoBuffer, options = {}) {
    try {
      return await CloudinaryService.uploadVideo(videoBuffer, {
        folder: 'products/videos',
        resource_type: 'video',
        ...options
      });
    } catch (error) {
      throw new Error(`Failed to upload video: ${error.message}`);
    }
  }

  /**
   * Analyze a video for explicit content and category match
   * @param {string} gcsUri - gs:// bucket path to the video (optional)
   * @param {string} videoUrl - HTTP URL to video (for base64 conversion)
   * @param {string} categoryId - Product category ID
   * @param {Buffer} videoBuffer - Video buffer (alternative to URLs)
   * @returns {Object} Moderation result
   */
  static async moderateVideo({ gcsUri, videoUrl, videoBuffer, categoryId }) {
    try {
      const category = await Category.findById(categoryId);
      if (!category) {
        throw new Error('Category not found');
      }

      // Special handling for "Khác" category - more lenient validation
      const categoryName = category.name.toLowerCase();
      const isOtherCategory =
        categoryName === 'khác' ||
        categoryName === 'other' ||
        categoryName.includes('khác') ||
        categoryName.includes('other');

      let inputContent;

      // Determine input type
      if (gcsUri) {
        inputContent = { inputUri: gcsUri };
      } else if (videoBuffer) {
        // Convert buffer to base64
        inputContent = { inputContent: videoBuffer.toString('base64') };
      } else {
        throw new Error('Either gcsUri or videoBuffer must be provided');
      }

      const request = {
        ...inputContent,
        features: ['EXPLICIT_CONTENT_DETECTION', 'LABEL_DETECTION']
      };

      // Start video analysis
      const [operation] = await client.annotateVideo(request);
      console.log('Video analysis started, waiting for completion...');

      // Wait for operation to complete
      const [response] = await operation.promise();
      console.log('Video analysis completed');

      const result = response.annotationResults[0];

      // ----- EXPLICIT CONTENT CHECK -----
      let explicit = false;
      let explicitFrames = [];

      if (result.explicitAnnotation?.frames) {
        for (const frame of result.explicitAnnotation.frames) {
          const likelihood = frame.pornographyLikelihood;
          if (likelihood === 'LIKELY' || likelihood === 'VERY_LIKELY') {
            explicit = true;
            explicitFrames.push({
              timeOffset: frame.timeOffset,
              likelihood: likelihood
            });
          }
        }
      }

      if (explicit) {
        return {
          approved: false,
          reason: 'EXPLICIT_CONTENT',
          details: {
            message: 'Video contains inappropriate/explicit content',
            explicitFrames: explicitFrames,
            suggestion: 'Please upload appropriate, family-friendly videos only.'
          }
        };
      }

      // ----- LABEL EXTRACTION -----
      const detectedLabels = new Set();
      let allLabels = [];

      if (result.segmentLabelAnnotations) {
        for (const label of result.segmentLabelAnnotations) {
          const labelText = label.entity.description.toLowerCase();
          detectedLabels.add(labelText);
          allLabels.push({
            label: labelText,
            confidence: label.confidence || 0
          });
        }
      }

      // ----- CATEGORY VALIDATION -----
      // For "Khác" category, skip strict validation
      if (isOtherCategory) {
        return {
          approved: true,
          labels: Array.from(detectedLabels),
          allLabels: allLabels,
          categoryValidation: {
            isRelevant: true,
            confidence: 'HIGH',
            matchScore: 5,
            note: 'Lenient validation for "Khác" category'
          }
        };
      }

      // Get category keywords
      const categoryKeywords = this.getCategoryKeywords(category.name);

      // Check if any detected label matches category keywords
      let matched = false;
      let matchedKeywords = [];

      for (const keyword of categoryKeywords) {
        const keywordLower = keyword.toLowerCase();
        if (detectedLabels.has(keywordLower)) {
          matched = true;
          matchedKeywords.push(keyword);
        }
      }

      // Calculate match score
      const matchScore = matchedKeywords.length;
      const confidence = matchScore >= 2 ? 'HIGH' : matchScore === 1 ? 'MEDIUM' : 'LOW';

      // For strict categories, require at least one match
      if (!matched && !isOtherCategory) {
        return {
          approved: false,
          reason: 'CATEGORY_MISMATCH',
          labels: Array.from(detectedLabels),
          allLabels: allLabels,
          categoryValidation: {
            isRelevant: false,
            expectedCategory: category.name,
            expectedKeywords: categoryKeywords,
            matchedKeywords: matchedKeywords,
            confidence: confidence,
            matchScore: matchScore
          },
          details: {
            message: 'Video content does not match the selected product category',
            suggestion: 'Please upload videos that clearly show the product matching your category.'
          }
        };
      }

      return {
        approved: true,
        labels: Array.from(detectedLabels),
        allLabels: allLabels,
        categoryValidation: {
          isRelevant: true,
          matchedKeywords: matchedKeywords,
          confidence: confidence,
          matchScore: matchScore
        }
      };
    } catch (error) {
      console.error('Video moderation error:', error);

      // For API errors, allow video but log warning
      if (error.message.includes('Category not found')) {
        throw error;
      }

      // Return a fallback response for API failures
      return {
        approved: true,
        warning: 'Video analysis failed, uploaded without validation',
        error: error.message,
        labels: [],
        categoryValidation: {
          isRelevant: true,
          note: 'Validation skipped due to API error'
        }
      };
    }
  }

  /**
   * Upload and moderate video
   * Complete workflow: Upload to Cloudinary -> Moderate content -> Return result
   *
   * @param {Buffer} videoBuffer - Video file buffer
   * @param {string} categoryId - Product category ID
   * @param {Object} options - Additional options (filename, etc.)
   * @returns {Object} Upload and moderation result
   */
  static async uploadAndModerateVideo(videoBuffer, categoryId, options = {}) {
    try {
      // Step 1: Upload to Cloudinary first
      const uploadResult = await this.uploadVideoToCloudinary(videoBuffer, options);

      // Step 2: Moderate the uploaded video using its URL
      // Note: Google Video Intelligence works best with GCS URIs,
      // but can also process videos from public URLs or base64
      const moderationResult = await this.moderateVideo({
        videoBuffer: videoBuffer, // Use buffer for moderation
        categoryId: categoryId
      });

      // Step 3: Check if approved
      if (!moderationResult.approved) {
        // Delete uploaded video from Cloudinary if not approved
        await CloudinaryService.deleteVideo(uploadResult.publicId);

        return {
          success: false,
          approved: false,
          reason: moderationResult.reason,
          details: moderationResult.details,
          labels: moderationResult.labels
        };
      }

      // Step 4: Return success with upload and moderation data
      return {
        success: true,
        approved: true,
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        duration: uploadResult.duration,
        format: uploadResult.format,
        size: uploadResult.bytes,
        thumbnail: uploadResult.thumbnail,
        moderation: {
          labels: moderationResult.labels,
          categoryValidation: moderationResult.categoryValidation,
          warning: moderationResult.warning
        }
      };
    } catch (error) {
      console.error('Upload and moderation error:', error);
      throw new Error(`Failed to upload and moderate video: ${error.message}`);
    }
  }

  /**
   * Batch upload and moderate multiple videos
   * @param {Array} videoFiles - Array of video file buffers with metadata
   * @param {string} categoryId - Product category ID
   * @returns {Object} Results for all videos
   */
  static async uploadAndModerateVideos(videoFiles, categoryId) {
    const results = [];
    const errors = [];

    for (const file of videoFiles) {
      try {
        const result = await this.uploadAndModerateVideo(file.buffer, categoryId, {
          filename: file.originalname
        });

        if (result.success) {
          results.push({
            filename: file.originalname,
            ...result
          });
        } else {
          errors.push({
            filename: file.originalname,
            type: result.reason,
            reason: result.details?.message || 'Video validation failed',
            error: result.details
          });
        }
      } catch (error) {
        errors.push({
          filename: file.originalname,
          type: 'PROCESSING_ERROR',
          reason: error.message,
          error: error.message
        });
      }
    }

    // If all videos failed, throw error
    if (results.length === 0 && errors.length > 0) {
      const error = new Error('All videos failed validation');
      error.validationErrors = errors;
      throw error;
    }

    // Return results (may include both successes and errors)
    return {
      uploadedVideos: results,
      validationErrors: errors
    };
  }
}

module.exports = VideoModerationService;
