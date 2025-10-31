const express = require('express');
const Product = require('../models/Product');
require('../models/Category');
const { removeVietnameseTones } = require('../utils/helper');
const { registerRoute } = require('./register.routes');

const router = express.Router();

// GET /api/products/:id - get product by id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('owner')
      .populate('category');
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
    res.json({ data: product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});


// GET /api/products?page=1&limit=12&search=abc
router.get('/', async (req, res) => {
  const { page = 1, limit = 12, search = '', name = '', location = '', status = '', category = '', district = '', condition = '', minPrice = '', maxPrice = '', inStock = '' } = req.query;
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 12;
  const skip = (pageNum - 1) * limitNum;

  // Xây dựng query động
  let query = {};
  if (status) query.status = status;
  else query.status = 'ACTIVE';

  // Xử lý search/filter không dấu ở backend (lọc JS)
  const searchNoMark = removeVietnameseTones(search || '').toLowerCase();
  const nameNoMark = removeVietnameseTones(name || '').toLowerCase();
  const locationNoMark = removeVietnameseTones(location || '').toLowerCase();

  // Chỉ query status ở Mongo, còn lại lọc JS
  const mongoQuery = {};
  if (status) mongoQuery.status = status;

  // Lấy tất cả sản phẩm phù hợp (tối đa 2000 sp, nếu nhiều hơn cần phân trang lại)
  const allItems = await Product.find(mongoQuery).sort({ createdAt: -1 });

  // Lọc search/filter không dấu ở backend
  let filtered = allItems;
  if (search.trim()) {
    filtered = filtered.filter(p => {
      // Lấy các trường cần search
      const titleRaw = (p.title || '').toLowerCase();
      const titleNoMark = removeVietnameseTones(p.title || '').toLowerCase();
      const descRaw = (p.description || '').toLowerCase();
      const descNoMark = removeVietnameseTones(p.description || '').toLowerCase();
      const cityRaw = (p.location?.address?.city || '').toLowerCase();
      const cityNoMark = removeVietnameseTones(p.location?.address?.city || '').toLowerCase();
      let categoryRaw = '';
      let categoryNoMark = '';
      if (p.category) {
        if (typeof p.category === 'object' && p.category.name) {
          categoryRaw = p.category.name.toLowerCase();
          categoryNoMark = removeVietnameseTones(p.category.name).toLowerCase();
        } else {
          categoryRaw = p.category.toString().toLowerCase();
          categoryNoMark = removeVietnameseTones(p.category.toString()).toLowerCase();
        }
      }
      // So sánh search với cả có dấu và không dấu
      return (
        titleRaw.includes(search.toLowerCase()) ||
        titleNoMark.includes(searchNoMark) ||
        descRaw.includes(search.toLowerCase()) ||
        descNoMark.includes(searchNoMark) ||
        cityRaw.includes(search.toLowerCase()) ||
        cityNoMark.includes(searchNoMark) ||
        categoryRaw.includes(search.toLowerCase()) ||
        categoryNoMark.includes(searchNoMark)
      );
    });
  }
  if (name.trim()) {
    filtered = filtered.filter(p => removeVietnameseTones(p.title || '').toLowerCase().includes(nameNoMark));
  }
  if (location.trim()) {
    filtered = filtered.filter(p => removeVietnameseTones(p.location?.address?.city || '').toLowerCase().includes(locationNoMark));
  }
  if (category.trim()) {
    filtered = filtered.filter(p => {
      // category có thể là id hoặc tên
      if (!p.category) return false;
      if (typeof p.category === 'object' && p.category.name) {
        return p.category.name === category;
      }
      return p.category.toString() === category;
    });
  }
  if (district.trim()) {
    filtered = filtered.filter(p => p.location?.address?.district === district);
  }
  if (condition.trim()) {
    filtered = filtered.filter(p => p.condition === condition);
  }
  if (minPrice) {
    filtered = filtered.filter(p => p.pricing?.dailyRate >= Number(minPrice));
  }
  if (maxPrice) {
    filtered = filtered.filter(p => p.pricing?.dailyRate <= Number(maxPrice));
  }
  if (inStock === 'true') {
    filtered = filtered.filter(p => p.status === 'ACTIVE'); // hoặc kiểm tra số lượng nếu có
  }

  const total = filtered.length;
  const items = filtered.slice(skip, skip + limitNum);

  res.json({
    data: items,
    pagination: { page: pageNum, limit: limitNum, total }
  });
});

registerRoute('/products', router);

module.exports = router;