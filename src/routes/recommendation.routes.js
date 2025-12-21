const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendation.controller');
const { authMiddleware } = require('../middleware/auth');

// Optional authentication middleware - sets req.user if token exists, but doesn't fail if missing
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    authMiddleware.verifyToken(req, res, (err) => {
      // Continue even if token verification fails
      next();
    });
  } else {
    next();
  }
};

// Track category click (requires authentication)
router.post(
  '/track-click',
  authMiddleware.verifyToken,
  recommendationController.trackCategoryClick
);

// Get products by owner (optional auth for personalized recommendations)
router.get(
  '/owner/:ownerId/products',
  optionalAuth,
  recommendationController.getProductsByOwner
);

// Get hot/trending products (public endpoint)
router.get(
  '/hot',
  recommendationController.getHotProducts
);

// Get personalized recommendations (optional auth - fallback to hot products if not logged in)
router.get(
  '/for-you',
  optionalAuth,
  recommendationController.getRecommendedProducts
);

// Get top rated and most rented products (public endpoint)
router.get(
  '/top-rated-most-rented',
  recommendationController.getTopRatedAndMostRented
);

module.exports = router;
