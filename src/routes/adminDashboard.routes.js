const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboard.controller');
const { authMiddleware } = require('../middleware/auth');

/**
 * @route   GET /api/admin/dashboard (đã được mount tại /api/admin/dashboard từ admin.routes.js)
 * @desc    Get admin dashboard statistics
 * @access  Private/Admin
 */
router.get(
  '/',
  adminDashboardController.getDashboard
);

module.exports = router;
