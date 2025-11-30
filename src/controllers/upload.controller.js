const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary');

class UploadController {
  async uploadImage(req, res) {
    try {
      if (!req.file) return res.status(400).json({ status: 'error', message: 'No file uploaded' });

      // Upload buffer to Cloudinary via upload_stream
      const buffer = req.file.buffer;
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: 'pira/uploads' }, (error, result) => {
          if (error) return reject(error);
          resolve(result);
        });
        streamifier.createReadStream(buffer).pipe(stream);
      });

      return res.json({ status: 'success', data: { url: uploadResult.secure_url, public_id: uploadResult.public_id } });
    } catch (err) {
      console.error('uploadImage error', err);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }
}

module.exports = new UploadController();
