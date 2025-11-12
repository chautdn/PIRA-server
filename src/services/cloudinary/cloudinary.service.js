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
