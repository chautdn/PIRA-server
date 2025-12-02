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
      const {
        page = 1,
        limit = 10,
        status,
        category,
        promoted,
        search,
        sort = 'updatedAt',
        order = 'desc'
      } = options;
      const skip = (page - 1) * limit;

      let query = {
        owner: ownerId,
        deletedAt: { $exists: false },
        status: { $ne: 'OWNER_DELETED' } // Always exclude OWNER_DELETED, but show OWNER_HIDDEN to owner
      };

      // Owner can always see OWNER_HIDDEN products
      // Only filter by specific status if requested
      if (status && status !== 'ALL') {
        query.status = status;
      }
      if (category) query.category = category;
      if (promoted === 'true') query.isPromoted = true;
      if (promoted === 'false') query.isPromoted = { $ne: true };

      // Search functionality - search in title and description
      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { title: searchRegex },
          { description: searchRegex },
          { 'brand.name': searchRegex },
          { 'brand.model': searchRegex }
        ];
      }

      // Build sort options
      const sortOptions = {};
      switch (sort) {
        case 'price':
          sortOptions['pricing.dailyRate'] = order === 'asc' ? 1 : -1;
          break;
        case 'createdAt':
          sortOptions.createdAt = order === 'asc' ? 1 : -1;
          break;
        case 'updatedAt':
        default:
          sortOptions.updatedAt = order === 'asc' ? 1 : -1;
          break;
      }

      const products = await Product.find(query)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('owner', 'profile.firstName profile.lastName email')
        .populate('currentPromotion', 'tier endDate isActive')
        .sort(sortOptions)
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
   * Get single SubOrder detail for owner
   */
  getSubOrderDetail: async (ownerId, subOrderId) => {
    try {
      const SubOrder = require('../models/SubOrder');

      console.log('🔍 [getSubOrderDetail] Fetching subOrder:', subOrderId, 'for owner:', ownerId);

      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId
      })
        .populate('products.product')
        .populate('owner', 'profile email phone')
        .populate({
          path: 'masterOrder',
          populate: { path: 'renter', select: 'profile email phone' }
        })
        .populate('contract');

      if (!subOrder) {
        console.log('❌ [getSubOrderDetail] SubOrder not found');
        throw new Error('Không tìm thấy đơn hàng');
      }

      console.log('✅ [getSubOrderDetail] SubOrder found:', subOrder.subOrderNumber);
      return subOrder;
    } catch (error) {
      throw new Error('Error fetching SubOrder detail: ' + error.message);
    }
  },

  /**
   * Confirm specific product item in SubOrder
   */
  confirmProductItem: async (ownerId, subOrderId, productItemIndex) => {
    try {
      const SubOrder = require('../models/SubOrder');

      console.log('🔍 [confirmProductItem] Confirming product:', productItemIndex, 'in subOrder:', subOrderId);

      const subOrder = await SubOrder.findOne({
        _id: subOrderId,
        owner: ownerId
      }).populate('products.product');

      if (!subOrder) {
        console.log('❌ [confirmProductItem] SubOrder not found');
        throw new Error('Không tìm thấy đơn hàng');
      }

      if (!subOrder.products[productItemIndex]) {
        console.log('❌ [confirmProductItem] Product not found at index:', productItemIndex);
        throw new Error('Không tìm thấy sản phẩm trong đơn hàng');
      }

      const productItem = subOrder.products[productItemIndex];
      if (productItem.productStatus !== 'PENDING') {
        console.log('❌ [confirmProductItem] Product already processed:', productItem.productStatus);
        throw new Error('Sản phẩm này đã được xử lý rồi');
      }

      // Update confirmation status
      productItem.productStatus = 'CONFIRMED';
      productItem.confirmedAt = new Date();

      await subOrder.save();
      console.log('✅ [confirmProductItem] Product confirmed successfully');

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
      if (productItem.productStatus !== 'PENDING') {
        console.log('❌ [rejectProductItem] Product already processed:', productItem.productStatus);
        throw new Error('Sản phẩm này đã được xử lý rồi');
      }

      console.log('📝 [rejectProductItem] Rejection reason:', reason);

      // Update confirmation status
      productItem.productStatus = 'REJECTED';
      productItem.rejectedAt = new Date();
      productItem.rejectionReason = reason;

      await subOrder.save();
      console.log('✅ [rejectProductItem] Product rejected successfully');

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
   * Check if product has active rentals or pending requests
   */
  checkProductRentalStatus: async (productId) => {
    try {
      const SubOrder = require('../models/SubOrder');

      // Check for any active or pending rental requests for this product
      const activeRentals = await SubOrder.find({
        'products.product': productId,
        'products.productStatus': { $in: ['PENDING', 'CONFIRMED'] },
        status: {
          $nin: ['CANCELLED', 'COMPLETED', 'OWNER_REJECTED']
        }
      });

      const hasPendingRequests = activeRentals.some((subOrder) =>
        subOrder.products.some(
          (p) => p.product.toString() === productId.toString() && p.productStatus === 'PENDING'
        )
      );

      const hasActiveRentals = activeRentals.some((subOrder) =>
        subOrder.products.some(
          (p) => p.product.toString() === productId.toString() && p.productStatus === 'CONFIRMED'
        )
      );

      return {
        hasPendingRequests,
        hasActiveRentals,
        canHide: !hasPendingRequests, // Can hide if no pending requests
        canDelete: !hasPendingRequests && !hasActiveRentals, // Can delete only if no activity
        pendingCount: activeRentals.filter((so) =>
          so.products.some(
            (p) => p.product.toString() === productId.toString() && p.productStatus === 'PENDING'
          )
        ).length,
        activeCount: activeRentals.filter((so) =>
          so.products.some(
            (p) => p.product.toString() === productId.toString() && p.productStatus === 'CONFIRMED'
          )
        ).length
      };
    } catch (error) {
      throw new Error('Error checking rental status: ' + error.message);
    }
  },

  /**
   * Hide product (set status to OWNER_HIDDEN)
   * Can only hide if there are no pending rental requests
   * If quantity > 1 and some are rented, reduce available quantity instead
   */
  hideProduct: async (ownerId, productId) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false },
        status: { $nin: ['OWNER_DELETED', 'OWNER_HIDDEN'] }
      });

      if (!product) {
        throw new Error('Product not found or already hidden');
      }

      // Check rental status
      const rentalStatus = await ownerProductService.checkProductRentalStatus(productId);

      if (rentalStatus.hasPendingRequests) {
        throw new Error(
          `Cannot hide product. You have ${rentalStatus.pendingCount} pending rental request(s). ` +
            'Please approve or reject all pending requests before hiding this product.'
        );
      }

      // If product has multiple quantities and some are rented
      if (product.availability.quantity > 1 && rentalStatus.hasActiveRentals) {
        // Don't hide completely, just mark as unavailable for new rentals
        product.availability.isAvailable = false;
        product.status = 'OWNER_HIDDEN';
        await product.save();

        return {
          product,
          message: 'Product hidden but existing rentals are not affected'
        };
      }

      // Hide the product
      product.status = 'OWNER_HIDDEN';
      product.availability.isAvailable = false;
      await product.save();

      return {
        product,
        message: 'Product hidden successfully'
      };
    } catch (error) {
      throw new Error('Error hiding product: ' + error.message);
    }
  },

  /**
   * Unhide product (restore from OWNER_HIDDEN)
   */
  unhideProduct: async (ownerId, productId) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false },
        status: 'OWNER_HIDDEN'
      });

      if (!product) {
        throw new Error('Product not found or not hidden');
      }

      product.status = 'ACTIVE';
      product.availability.isAvailable = true;
      await product.save();

      return await Product.findById(productId)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug');
    } catch (error) {
      throw new Error('Error unhiding product: ' + error.message);
    }
  },

  /**
   * Soft delete product (set status to OWNER_DELETED)
   * Can only delete if there are no pending requests AND no active rentals
   */
  softDeleteProduct: async (ownerId, productId) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false },
        status: { $ne: 'OWNER_DELETED' }
      });

      if (!product) {
        throw new Error('Product not found or already deleted');
      }

      // Check rental status
      const rentalStatus = await ownerProductService.checkProductRentalStatus(productId);

      if (!rentalStatus.canDelete) {
        const reasons = [];
        if (rentalStatus.hasPendingRequests) {
          reasons.push(`${rentalStatus.pendingCount} pending rental request(s)`);
        }
        if (rentalStatus.hasActiveRentals) {
          reasons.push(`${rentalStatus.activeCount} active rental(s)`);
        }

        throw new Error(
          `Cannot delete product. You have ${reasons.join(' and ')}. ` +
            'Please resolve all rental activities before deleting this product.'
        );
      }

      // Soft delete by changing status
      product.status = 'OWNER_DELETED';
      product.availability.isAvailable = false;
      product.deletedAt = new Date();
      await product.save();

      return {
        product,
        message: 'Product deleted successfully. It is now hidden from all users.'
      };
    } catch (error) {
      throw new Error('Error deleting product: ' + error.message);
    }
  },

  /**
   * Update product with limited fields (name, description, images only)
   * Safe update that won't affect pricing, location, or other critical fields
   */
  updateProductSafeFields: async (ownerId, productId, updateData) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false },
        status: { $nin: ['OWNER_DELETED'] }
      }).populate('category');

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      // Only allow safe fields to be updated
      const safeFields = {};

      if (updateData.title) {
        safeFields.title = updateData.title;
        safeFields.slug = await ownerProductService.generateUniqueSlug(updateData.title, productId);
      }

      if (updateData.description) {
        safeFields.description = updateData.description;
      }

      // Handle image updates with AI validation
      if (updateData.newImages && Array.isArray(updateData.newImages)) {
        // newImages are already validated and uploaded by the controller
        // Just extract the image data without validation info
        const imageData = updateData.newImages.map((img) => ({
          url: img.url,
          publicId: img.publicId,
          alt: img.alt,
          isMain: img.isMain || false
        }));
        product.images = [...product.images, ...imageData];
      }

      // Update the safe fields
      Object.assign(product, safeFields);
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
   * Check if product pricing can be edited
   * Returns true if there are no active/pending rental requests or active rentals
   */
  canEditPricing: async (productId) => {
    try {
      const SubOrder = require('../models/SubOrder');
      
      // Check for any sub-orders with this product that are in states where pricing shouldn't change
      const activeOrders = await SubOrder.find({
        'products.product': productId,
        'products.productStatus': {
          $in: [
            'PENDING',           // Pending confirmation
            'CONFIRMED',         // Confirmed by owner
            'SHIPPER_CONFIRMED', // Shipper confirmed
            'IN_TRANSIT',        // In transit
            'DELIVERED',         // Delivered
            'ACTIVE',            // Currently rented
            'DISPUTED',          // Has dispute
            'RETURN_REQUESTED',  // Return requested
            'EARLY_RETURN_REQUESTED',
            'RETURN_SHIPPER_CONFIRMED',
            'RETURNING'          // Returning to owner
          ]
        }
      }).limit(1);

      return activeOrders.length === 0;
    } catch (error) {
      throw new Error('Error checking pricing edit permission: ' + error.message);
    }
  },

  /**
   * Update product pricing (only if allowed)
   */
  updateProductPricing: async (ownerId, productId, pricingData) => {
    try {
      const product = await Product.findOne({
        _id: productId,
        owner: ownerId,
        deletedAt: { $exists: false },
        status: { $nin: ['OWNER_DELETED'] }
      });

      if (!product) {
        throw new Error('Product not found or access denied');
      }

      // Check if pricing can be edited
      const canEdit = await ownerProductService.canEditPricing(productId);
      if (!canEdit) {
        throw new Error('Cannot edit pricing while product has active rental requests or is currently rented');
      }

      // Update pricing fields
      if (pricingData.dailyRate !== undefined) {
        product.pricing.dailyRate = pricingData.dailyRate;
      }
      if (pricingData.weeklyRate !== undefined) {
        product.pricing.weeklyRate = pricingData.weeklyRate;
      }
      if (pricingData.monthlyRate !== undefined) {
        product.pricing.monthlyRate = pricingData.monthlyRate;
      }
      if (pricingData.depositAmount !== undefined) {
        product.pricing.deposit.amount = pricingData.depositAmount;
      }
      if (pricingData.depositDescription !== undefined) {
        product.pricing.deposit.description = pricingData.depositDescription;
      }

      const updatedProduct = await product.save();

      return await Product.findById(updatedProduct._id)
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .populate('owner', 'profile.firstName profile.lastName email');
    } catch (error) {
      throw new Error(error.message);
    }
  },

  /**
   * Legacy method - kept for backwards compatibility
   */
  extractPublicIdFromUrl: CloudinaryService.extractPublicIdFromUrl
};

module.exports = ownerProductService;
