const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authMiddleware } = require('../middleware/auth');
const registerRoute = require('./register.routes').registerRoute;

// All report routes require authentication
router.use(authMiddleware.verifyToken);

// User report routes
router.post('/', reportController.createReport);
router.get('/my-reports', reportController.getUserReports);
router.get('/stats', reportController.getReportStats);
router.get('/:reportId', reportController.getReportById);
router.delete('/:reportId', reportController.deleteReport);

// Register routes
registerRoute('/reports', router);

module.exports = router;
