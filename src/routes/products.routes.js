const express = require('express');
const Product = require('../models/Product');
const { registerRoute } = require('./register.routes');

const router = express.Router();

// GET /api/products?page=1&limit=12
router.get('/', async (req, res) => {
  const { page = 1, limit = 12 } = req.query;
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 12;
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    Product.find({ status: 'ACTIVE' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Product.countDocuments({ status: 'ACTIVE' })
  ]);

  res.json({
    data: items,
    pagination: { page: pageNum, limit: limitNum, total }
  });
});

registerRoute('/products', router);

module.exports = router;