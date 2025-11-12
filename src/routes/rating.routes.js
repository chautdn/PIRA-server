const express = require('express');
const router = express.Router();
const { registerRoute } = require('./register.routes');
const ratingController = require('../controllers/rating.controller');
const upload = require('../middleware/upload');
// Create review (multipart/form-data)
router.post('/', upload.array('photos', 6), ratingController.createReview);

// Update review - uploader (may include new photos)
router.put('/:id', upload.array('photos', 6), ratingController.updateReview);

// Delete review
router.delete('/:id', ratingController.deleteReview);

// Reply to review
// Reply to review (allow photos)
router.post('/:id/reply', upload.array('photos', 6), ratingController.replyToReview);

// Reply to a specific response (nested reply)
router.post('/:id/responses/:responseId/reply', upload.array('photos', 6), ratingController.replyToResponse);

// Update a nested response
// Allow adding photos when updating a response
router.put('/:id/responses/:responseId', upload.array('photos', 6), ratingController.updateResponse);

// Delete a nested response
router.delete('/:id/responses/:responseId', ratingController.deleteResponse);

// Mark helpful / like
router.post('/:id/helpful', ratingController.incrementHelpfulness);

// Get reviews by product
router.get('/product/:productId', ratingController.getReviewsByProduct);

// Admin helper to fix shipper reviewees for a product
router.post('/product/:productId/fix-shipper-reviews', ratingController.fixShipperReviews);

registerRoute('/ratings', router);

module.exports = router;
