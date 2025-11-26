const express = require('express');
const router = express.Router();
const UploadController = require('../controllers/upload.controller');
const multer = require('multer');

// Use memory storage so we can upload buffer to cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/image', upload.single('image'), UploadController.uploadImage);

module.exports = router;
