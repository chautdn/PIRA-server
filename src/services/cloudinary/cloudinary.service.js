const cloudinary = require('../../config/cloudinary');

class CloudinaryService {
  /**
   * Upload image to Cloudinary
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {Object} Upload result
   */
  static async uploadImage(imageBuffer) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'image',
            quality: 'auto',
            fetch_format: 'auto',
            folder: 'products'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(imageBuffer);
    });
  }

  /**
   * Upload file (image or video) to Cloudinary with auto detection
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} mimeType - File MIME type (optional, for detection)
   * @returns {Object} Upload result
   */
  static async uploadFile(fileBuffer, mimeType) {
    return new Promise((resolve, reject) => {
      // Detect resource type based on mime type, default to 'auto'
      let resourceType = 'auto';
      let uploadOptions = {
        folder: 'shipment-proofs'
      };

      if (mimeType) {
        if (mimeType.startsWith('video/')) {
          resourceType = 'video';
          // For videos, add video-specific options
          uploadOptions.resource_type = 'video';
        } else if (mimeType.startsWith('image/')) {
          resourceType = 'image';
          uploadOptions.resource_type = 'image';
          uploadOptions.quality = 'auto';
        } else {
          // For unknown types, use auto
          uploadOptions.resource_type = 'auto';
        }
      } else {
        // No mime type provided, use auto
        uploadOptions.resource_type = 'auto';
      }

      cloudinary.uploader
        .upload_stream(uploadOptions, (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            resolve(result);
          }
        })
        .end(fileBuffer);
    });
  }

  /**
   * Upload video to Cloudinary
   * @param {Buffer} videoBuffer - Video buffer
   * @param {Object} options - Upload options
   * @returns {Object} Upload result
   */
  static async uploadVideo(videoBuffer, options = {}) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: 'video',
            folder: options.folder || 'products/videos',
            ...options
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary video upload error:', error);
              reject(error);
            } else {
              resolve({
                url: result.secure_url,
                publicId: result.public_id,
                duration: result.duration,
                format: result.format,
                bytes: result.bytes,
                width: result.width,
                height: result.height,
                thumbnail: result.secure_url.replace(/\.[^.]+$/, '.jpg')
              });
            }
          }
        )
        .end(videoBuffer);
    });
  }

  /**
   * Delete image from Cloudinary
   * @param {string} publicId - Image public ID
   * @returns {Object} Deletion result
   */
  static async deleteImage(publicId) {
    try {
      return await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.warn('Failed to delete from cloudinary:', error.message);
      throw error;
    }
  }

  /**
   * Delete video from Cloudinary
   * @param {string} publicId - Video public ID
   * @returns {Object} Deletion result
   */
  static async deleteVideo(publicId) {
    try {
      return await cloudinary.uploader.destroy(publicId, {
        resource_type: 'video'
      });
    } catch (error) {
      console.warn('Failed to delete video from cloudinary:', error.message);
      throw error;
    }
  }

  /**
   * Delete multiple videos from Cloudinary
   * @param {Array} publicIds - Array of public IDs
   */
  static async deleteVideos(publicIds) {
    try {
      const promises = publicIds.map((publicId) => this.deleteVideo(publicId));
      return await Promise.all(promises);
    } catch (error) {
      console.error('Error deleting videos:', error);
      throw error;
    }
  }

  /**
   * Extract public ID from Cloudinary URL
   * @param {string} url - Cloudinary URL
   * @returns {string} Public ID
   */
  static extractPublicIdFromUrl(url) {
    const matches = url.match(/\/([^\/]+)\.[^.]+$/);
    return matches ? matches[1] : null;
  }
}

module.exports = CloudinaryService;
