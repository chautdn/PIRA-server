const multer = require("multer");

const storage = multer.memoryStorage(); // Lưu ảnh trong bộ nhớ tạm
const upload = multer({ storage });

module.exports = upload;
