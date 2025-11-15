const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');
const Category = require('../models/Category');
const slugify = require('slugify');
const ImageValidationService = require('./ai/imageValidation.service');
const CloudinaryService = require('./cloudinary/cloudinary.service');

const ownerProductService = {
  /**
   * Upload and validate images
   */
  uploadAndValidateImages:
    ImageValidationService.uploadAndValidateImages.bind(ImageValidationService),

  /**
   * Get owner products with pagination
   */
  getOwnerProducts: async (ownerId, options = {}) => {
    try {
      const { page = 1, limit = 10, status, category, promoted } = options;
      const skip = (page - 1) * limit;

      let query = { owner: ownerId, deletedAt: { $exists: false } };

      if (status) query.status = status;
      if (category) query.category = category;
      if (promoted === 'true') query.isPromoted = true;
      if (promoted === 'false') query.isPromoted = { $ne: true };

      const products = await Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('owner', 'profile.firstName profile.lastName email')
        .populate('currentPromotion', 'tier endDate isActive')
        .sort({ isPromoted: -1, promotionTier: 1, updatedAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Product.countDocuments(query);

      return {
        products,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      throw new Error('Error fetching products: ' + error.message);
    }
  },

  /**
   * Get owner product by ID
   */
  getOwnerProductById: async (ownerId, productId) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false }
      })
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('owner', 'profile.firstName profile.lastName email');

      if (!product) {
        throw new Error('Product not found or access denied');
      }
      return product;
    } catch (error) {
      throw new Error('Error fetching product: ' + error.message);
    }
  },

  /**
   * Generate unique slug
   */
  generateUniqueSlug: async (title, excludeId = null) => {
    let baseSlug = slugify(title, { lower: true, remove: /[*+~.()'"!:@]/g });
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const query = { slug, deletedAt: { $exists: false } };
      if (excludeId) query._id = { $ne: excludeId };

      const existingProduct = await Product.findOne(query);
      if (!existingProduct) break;

      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  },

  /**
   * Create owner product
   */
  createOwnerProduct: async (ownerId, productData) => {
    try {
      const owner = await User.findById(ownerId);
      if (!owner) {
        throw new Error('Owner not found');
      }

      // Validate CCCD verification
      if (!owner.cccd || !owner.cccd.isVerified) {
        throw new Error(
          'CCCD verification required. Please verify your identity before creating a product.'
        );
      }

      // Validate bank account - must exist AND be verified
      if (!owner.bankAccount || !owner.bankAccount.accountNumber || !owner.bankAccount.bankCode) {
        throw new Error(
          'Bank account required. Please add your bank account information before creating a product.'
        );
      }
      if (!owner.bankAccount.isVerified) {
        throw new Error(
          'Bank account not verified. Please verify your bank account before creating a product.'
        );
      }

      // Validate address
      if (
        !owner.address ||
        !owner.address.streetAddress ||
        !owner.address.city ||
        !owner.address.province
      ) {
        throw new Error(
          'Complete address required. Please update your address before creating a product.'
        );
      }

      const category = await Category.findById(productData.category);
      if (!category) {
        throw new Error('Category not found');
      }

      if (productData.subCategory) {
        const subCategory = await Category.findById(productData.subCategory);
        if (!subCategory || subCategory.parentCategory.toString() !== category._id.toString()) {
          throw new Error('Invalid subcategory for the selected category');
        }
      }

      const slug = await ownerProductService.generateUniqueSlug(productData.title);

      // Set initial status based on whether promotion is intended
      // If promotion with PayOS is intended but not yet paid, set to PENDING
      // Otherwise, set to ACTIVE (normal products or wallet-paid promotions)
      const initialStatus = productData.promotionIntended ? 'PENDING' : 'ACTIVE';

      // Prepare availability object
      const availability = {
        isAvailable: true,
        quantity: productData.quantity || 1
      };

      const newProduct = new Product({
        ...productData,
        owner: ownerId,
        category: category._id,
        slug,
        status: initialStatus,
        availability
      });

      const savedProduct = await newProduct.save();

      // Add OWNER role to user if they don't have it yet
      if (owner.role === 'RENTER') {
        owner.role = 'OWNER';
        await owner.save();
        console.log(`✅ User ${owner.email} upgraded to OWNER role`);
      }

      return await Product.findById(savedProduct._id)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('owner', 'profile.firstName profile.lastName email');
    } catch (error) {
      throw new Error('Error creating product: ' + error.message);
    }
  },

  /**
   * Update owner product
   */
  updateOwnerProduct: async (ownerId, productId, updateData) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false }
      });

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      if (updateData.category && updateData.category !== product.category.toString()) {
        const category = await Category.findById(updateData.category);
        if (!category) {
          throw new Error('Category not found');
        }
      }

      if (updateData.newImages) {
        product.images = [...product.images, ...updateData.newImages];
        delete updateData.newImages;
      }

      if (updateData.title && updateData.title !== product.title) {
        updateData.slug = await ownerProductService.generateUniqueSlug(updateData.title, productId);
      }

      Object.assign(product, updateData);
      const updatedProduct = await product.save();

      return await Product.findById(updatedProduct._id)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('owner', 'profile.firstName profile.lastName email');
    } catch (error) {
      throw new Error('Error updating product: ' + error.message);
    }
  },

  /**
   * Delete owner product
   */
  deleteOwnerProduct: async (ownerId, productId) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false }
      });

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      product.deletedAt = new Date();
      product.status = 'INACTIVE';
      await product.save();

      if (product.images && product.images.length > 0) {
        for (const image of product.images) {
          try {
            const publicId = CloudinaryService.extractPublicIdFromUrl(image.url);
            await CloudinaryService.deleteImage(publicId);
          } catch (imageError) {
            console.warn('Failed to delete image:', imageError.message);
          }
        }
      }

      return product;
    } catch (error) {
      throw new Error('Error deleting product: ' + error.message);
    }
  },

  /**
   * Add images to product
   */
  addImagesToProduct: async (ownerId, productId, images) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false }
      });

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      product.images = [...product.images, ...images];
      await product.save();

      return product;
    } catch (error) {
      throw new Error('Error adding images: ' + error.message);
    }
  },

  /**
   * Remove image from product
   */
  removeImageFromProduct: async (ownerId, productId, imageId) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false }
      });

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      const imageIndex = product.images.findIndex((img) => img._id.toString() === imageId);
      if (imageIndex === -1) {
        throw new Error('Image not found');
      }

      const imageToDelete = product.images[imageIndex];

      try {
        const publicId = CloudinaryService.extractPublicIdFromUrl(imageToDelete.url);
        await CloudinaryService.deleteImage(publicId);
      } catch (cloudinaryError) {
        console.warn('Failed to delete from cloudinary:', cloudinaryError.message);
      }

      product.images.splice(imageIndex, 1);

      if (imageToDelete.isMain && product.images.length > 0) {
        product.images[0].isMain = true;
      }

      await product.save();
      return product;
    } catch (error) {
      throw new Error('Error removing image: ' + error.message);
    }
  },

  /**
   * Confirm specific product item in SubOrder
   */
  confirmProductItem: async (ownerId, subOrderId, productItemIndex) => {
    try {
      const SubOrder = require('../models/SubOrder');

      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId
      }).populate('products.product');

      if (!subOrder) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      if (!subOrder.products[productItemIndex]) {
        throw new Error('Không tìm thấy sản phẩm trong đơn hàng');
      }

      const productItem = subOrder.products[productItemIndex];
      if (productItem.confirmationStatus !== 'PENDING') {
        throw new Error('Sản phẩm này đã được xử lý rồi');
      }

      // Update confirmation status
      productItem.confirmationStatus = 'CONFIRMED';
      productItem.confirmedAt = new Date();

      await subOrder.save();

      // TODO: Trigger payment processing for confirmed items
      // await processPaymentForConfirmedItems(subOrder);

      return subOrder;
    } catch (error) {
      throw new Error('Lỗi xác nhận sản phẩm: ' + error.message);
    }
  },

  /**
   * Reject specific product item in SubOrder
   */
  rejectProductItem: async (ownerId, subOrderId, productItemIndex, reason) => {
    try {
      const SubOrder = require('../models/SubOrder');

      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId
      }).populate('products.product');

      if (!subOrder) {
        throw new Error('Không tìm thấy đơn hàng');
      }

      if (!subOrder.products[productItemIndex]) {
        throw new Error('Không tìm thấy sản phẩm trong đơn hàng');
      }

      const productItem = subOrder.products[productItemIndex];
      if (productItem.confirmationStatus !== 'PENDING') {
        throw new Error('Sản phẩm này đã được xử lý rồi');
      }

      // Update confirmation status
      productItem.confirmationStatus = 'REJECTED';
      productItem.rejectedAt = new Date();
      productItem.rejectionReason = reason;

      await subOrder.save();

      // TODO: Trigger refund processing for rejected items
      // await processRefundForRejectedItems(subOrder, productItemIndex);

      return subOrder;
    } catch (error) {
      throw new Error('Lỗi từ chối sản phẩm: ' + error.message);
    }
  },

  /**
   * Get SubOrders for owner (for rental requests management)
   */
  getSubOrders: async (ownerId, options = {}) => {
    try {
      const SubOrder = require('../models/SubOrder');
      const { page = 1, limit = 10, status } = options;
      const skip = (page - 1) * limit;

      let query = { owner: ownerId };
      if (status && status !== 'ALL') {
        query.status = status;
      }

      console.log('[getSubOrders] Starting with ownerId:', ownerId);
      console.log('[getSubOrders] Query:', JSON.stringify(query));

      // Simple query without any population first to test
      const subOrders = await SubOrder.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'masterOrder',
          populate: {
            path: 'renter',
            select: 'profile.firstName profile.lastName email'
          }
        })
        .populate('products.product');

      console.log('[getSubOrders] Raw SubOrders found:', subOrders.length);

      // Return simple data without population for now to avoid ObjectId issues
      const total = await SubOrder.countDocuments(query);

      return {
        data: subOrders,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('[getSubOrders] Error:', error);
      throw new Error('Lỗi lấy danh sách yêu cầu thuê: ' + error.message);
    }
  },

  /**
   * Legacy method - kept for backwards compatibility
   */
  extractPublicIdFromUrl: CloudinaryService.extractPublicIdFromUrl
};

module.exports = ownerProductService;
