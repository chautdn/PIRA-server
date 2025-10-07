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
      const { page = 1, limit = 10, status, category, featured } = options;
      const skip = (page - 1) * limit;

      let query = { owner: ownerId, deletedAt: { $exists: false } };

      if (status) query.status = status;
      if (category) query.category = category;
      if (featured === 'true') query.featuredTier = { $ne: null };
      if (featured === 'false') query.featuredTier = null;

      const products = await Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('owner', 'profile.firstName profile.lastName email')
        .sort({ featuredTier: 1, updatedAt: -1 })
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

      const newProduct = new Product({
        ...productData,
        owner: ownerId,
        category: category._id,
        slug,
        status: 'ACTIVE'
      });

      const savedProduct = await newProduct.save();

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
   * Update featured status
   */
  updateFeaturedStatus: async (ownerId, productId, featuredTier, duration) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false }
      });

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      const now = new Date();
      const tierPricing = {
        1: 100000,
        2: 75000,
        3: 50000,
        4: 25000,
        5: 10000
      };

      product.featuredTier = featuredTier;
      product.featuredExpiresAt = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);
      product.featuredPaymentAmount = tierPricing[featuredTier] * duration;
      product.featuredPaymentStatus = 'PENDING';
      product.featuredUpgradedAt = now;

      await product.save();
      return product;
    } catch (error) {
      throw new Error('Error updating featured status: ' + error.message);
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
   * Legacy method - kept for backwards compatibility
   */
  extractPublicIdFromUrl: CloudinaryService.extractPublicIdFromUrl
};

module.exports = ownerProductService;
