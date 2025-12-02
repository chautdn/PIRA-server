const ownerProductService = require('../services/ownerProduct.service');
const cloudinary = require('../config/cloudinary');
const multer = require('multer');
const { validationResult } = require('express-validator');

// Multer config for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const ownerProductController = {
  // GET /api/owner/products
  getProducts: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const { page = 1, limit = 10, status, category, promoted, search, sort, order } = req.query;

      const products = await ownerProductService.getOwnerProducts(ownerId, {
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        category,
        promoted,
        search,
        sort,
        order
      });

      return res.status(200).json({
        success: true,
        message: 'Products fetched successfully',
        data: products
      });
    } catch (error) {
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: error.message
        });
      }
    }
  },

  // GET /api/owner/products/:id
  getProductById: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const productId = req.params.id;

      const product = await ownerProductService.getOwnerProductById(ownerId, productId);

      return res.status(200).json({
        success: true,
        message: 'Product fetched successfully',
        data: product
      });
    } catch (error) {
      if (!res.headersSent) {
        const statusCode = error.message.includes('not found') ? 404 : 500;
        return res.status(statusCode).json({
          success: false,
          message: error.message
        });
      }
    }
  },

  // POST /api/owner/products
  createProduct: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const ownerId = req.user._id;
      const productData = req.body;

      let imageValidationResults = [];

      // Handle uploaded images if any
      if (req.files && req.files.length > 0) {
        try {
          // This will validate ALL images first, then upload only if ALL pass
          const uploadedImages = await ownerProductService.uploadAndValidateImages(
            req.files,
            productData.category
          );

          // Extract validation results for response
          imageValidationResults = uploadedImages.map((img) => ({
            url: img.url,
            categoryMatch: img.categoryValidation.isRelevant,
            confidence: img.categoryValidation.confidence,
            detectedObjects: img.categoryValidation.detectedObjects,
            detectedLabels: img.categoryValidation.detectedLabels,
            matchScore: img.categoryValidation.matchScore,
            matchPercentage: img.categoryValidation.matchPercentage,
            nsfwSafe: img.nsfwCheck.safe,
            nsfwValue: img.nsfwCheck.nsfwValue
          }));

          // Set images for product creation (without validation data)
          productData.images = uploadedImages.map((img) => ({
            url: img.url,
            publicId: img.publicId,
            alt: img.alt,
            isMain: img.isMain
          }));
        } catch (imageValidationError) {
          // Check if error has validationErrors array (from your original code)
          if (imageValidationError.validationErrors) {
            const validationErrors = imageValidationError.validationErrors;
            const nsfwErrors = validationErrors.filter((e) => e.type === 'NSFW_VIOLATION');
            const categoryErrors = validationErrors.filter((e) => e.type === 'CATEGORY_MISMATCH');
            const processingErrors = validationErrors.filter((e) => e.type === 'PROCESSING_ERROR');

            // Determine primary error type
            let errorType = 'IMAGE_VALIDATION_ERROR';
            let details = {
              reason: 'Image validation failed',
              suggestion: 'Please check your images and try again.'
            };

            if (nsfwErrors.length > 0 && categoryErrors.length > 0) {
              errorType = 'MIXED_VALIDATION_ERROR';
              details = {
                reason: 'Multiple validation issues found',
                suggestion:
                  'Please upload appropriate, family-friendly images that match your selected category.'
              };
            } else if (nsfwErrors.length > 0) {
              errorType = 'NSFW_VIOLATION';
              details = {
                reason: 'Images contain inappropriate content',
                suggestion: 'Please upload appropriate, family-friendly images only.'
              };
            } else if (categoryErrors.length > 0) {
              errorType = 'CATEGORY_MISMATCH';
              details = {
                reason: 'Images do not match the selected category',
                suggestion:
                  'Please upload images that are relevant to your selected category or choose a different category.'
              };
            } else if (processingErrors.length > 0) {
              errorType = 'PROCESSING_ERROR';
              details = {
                reason: 'Error processing images',
                suggestion:
                  'Please try again with different images or contact support if the issue persists.'
              };
            }

            // Create errorBreakdown in the format frontend expects
            const errorBreakdown = {
              total: validationErrors.length,
              nsfw: nsfwErrors.length,
              category: categoryErrors.length,
              other: processingErrors.length,
              details: validationErrors.map((error) => ({
                fileName: error.filename,
                type: error.type,
                message: error.reason,
                nsfwValue: error.error?.includes('NSFW confidence') ? error.error : undefined
              }))
            };

            // Return detailed validation error to client
            return res.status(400).json({
              success: false,
              message: 'Image validation failed',
              error: imageValidationError.message,
              errorType: errorType,
              errorBreakdown: errorBreakdown,
              details: details
            });
          }

          // Fallback for other types of errors
          return res.status(400).json({
            success: false,
            message: 'Image validation failed',
            error: imageValidationError.message,
            errorType: 'IMAGE_VALIDATION_ERROR',
            errorBreakdown: null,
            details: {
              reason: 'Image validation failed',
              suggestion: 'Please check your images and try again.'
            }
          });
        }
      }

      // Create product only if all images passed validation
      const product = await ownerProductService.createOwnerProduct(ownerId, productData);

      // Send response with AI validation results
      return res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product,
        imageValidation:
          imageValidationResults.length > 0
            ? {
                totalImages: imageValidationResults.length,
                results: imageValidationResults,
                summary: {
                  allImagesRelevant: imageValidationResults.every((img) => img.categoryMatch),
                  allImagesSafe: imageValidationResults.every((img) => img.nsfwSafe),
                  highConfidenceImages: imageValidationResults.filter(
                    (img) => img.confidence === 'HIGH'
                  ).length,
                  mediumConfidenceImages: imageValidationResults.filter(
                    (img) => img.confidence === 'MEDIUM'
                  ).length,
                  lowConfidenceImages: imageValidationResults.filter(
                    (img) => img.confidence === 'LOW'
                  ).length,
                  averageMatchScore:
                    imageValidationResults.reduce((sum, img) => sum + (img.matchScore || 0), 0) /
                    imageValidationResults.length,
                  averageNsfwValue:
                    imageValidationResults.reduce((sum, img) => sum + (img.nsfwValue || 0), 0) /
                    imageValidationResults.length
                }
              }
            : null
      });
    } catch (error) {
      return next(error);
    }
  },

  // PUT /api/owner/products/:id
  updateProduct: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const ownerId = req.user._id;
      const productId = req.params.id;
      const updateData = req.body;

      // Handle new images with validation
      if (req.files && req.files.length > 0) {
        try {
          const uploadedImages = await ownerProductService.uploadAndValidateImages(
            req.files,
            updateData.category
          );
          updateData.newImages = uploadedImages;
        } catch (imageValidationError) {
          return res.status(400).json({
            success: false,
            message: 'Image validation failed',
            error: imageValidationError.message,
            errorType: 'IMAGE_VALIDATION_ERROR',
            details: {
              reason: 'New images do not match the selected category',
              suggestion: 'Please upload images that are relevant to your selected category.'
            }
          });
        }
      }

      const product = await ownerProductService.updateOwnerProduct(ownerId, productId, updateData);

      return res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: product
      });
    } catch (error) {
      if (!res.headersSent) {
        const statusCode = error.message.includes('not found') ? 404 : 500;
        return res.status(statusCode).json({
          success: false,
          message: error.message
        });
      }
    }
  },

  // DELETE /api/owner/products/:id
  deleteProduct: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const productId = req.params.id;

      await ownerProductService.deleteOwnerProduct(ownerId, productId);

      return res.status(200).json({
        success: true,
        message: 'Product deleted successfully'
      });
    } catch (error) {
      if (!res.headersSent) {
        const statusCode = error.message.includes('not found') ? 404 : 500;
        return res.status(statusCode).json({
          success: false,
          message: error.message
        });
      }
    }
  },

  // POST /api/owner/products/:id/upload-images
  uploadImages: async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No images provided'
        });
      }

      const ownerId = req.user._id;
      const productId = req.params.id;

      // Get product to get category for validation
      const existingProduct = await ownerProductService.getOwnerProductById(ownerId, productId);

      try {
        const uploadedImages = await ownerProductService.uploadAndValidateImages(
          req.files,
          existingProduct.category._id
        );

        const product = await ownerProductService.addImagesToProduct(
          ownerId,
          productId,
          uploadedImages
        );

        return res.status(200).json({
          success: true,
          message: 'Images uploaded successfully',
          data: product
        });
      } catch (imageValidationError) {
        return res.status(400).json({
          success: false,
          message: 'Image validation failed',
          error: imageValidationError.message,
          errorType: 'IMAGE_VALIDATION_ERROR',
          details: {
            reason: 'Images do not match the product category',
            suggestion: 'Please upload images that are relevant to the product category.'
          }
        });
      }
    } catch (error) {
      if (!res.headersSent) {
        const statusCode = error.message.includes('not found') ? 404 : 500;
        return res.status(statusCode).json({
          success: false,
          message: error.message
        });
      }
    }
  },

  // DELETE /api/owner/products/:id/images/:imageId
  deleteImage: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const productId = req.params.id;
      const imageId = req.params.imageId;

      const product = await ownerProductService.removeImageFromProduct(ownerId, productId, imageId);

      return res.status(200).json({
        success: true,
        message: 'Image deleted successfully',
        data: product
      });
    } catch (error) {
      if (!res.headersSent) {
        const statusCode = error.message.includes('not found') ? 404 : 500;
        return res.status(statusCode).json({
          success: false,
          message: error.message
        });
      }
    }
  },

  // GET /api/owner/rental-requests
  getRentalRequests: async (req, res) => {
    try {
      console.log('[getRentalRequests] Starting request for owner:', req.user._id);
      const ownerId = req.user._id;
      const { page = 1, limit = 10, status } = req.query;

      console.log('[getRentalRequests] Query params:', { page, limit, status });

      const subOrders = await ownerProductService.getSubOrders(ownerId, {
        page: parseInt(page),
        limit: parseInt(limit),
        status
      });

      console.log('[getRentalRequests] Success, found subOrders:', subOrders.data?.length || 0);

      return res.status(200).json({
        success: true,
        message: 'Rental requests fetched successfully',
        data: subOrders
      });
    } catch (error) {
      console.error('[getRentalRequests] Error:', error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // GET /api/owner-products/rental-requests/:subOrderId - Get single rental request detail
  getSubOrderDetail: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const { subOrderId } = req.params;

      const subOrder = await ownerProductService.getSubOrderDetail(ownerId, subOrderId);

      return res.status(200).json({
        success: true,
        message: 'Success',
        data: subOrder
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // POST /api/owner/rental-requests/:subOrderId/items/:itemIndex/confirm
  confirmProductItem: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const { subOrderId, itemIndex } = req.params;

      const subOrder = await ownerProductService.confirmProductItem(
        ownerId,
        subOrderId,
        parseInt(itemIndex)
      );

      return res.status(200).json({
        success: true,
        message: 'Sản phẩm đã được xác nhận',
        data: subOrder
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // POST /api/owner/rental-requests/:subOrderId/items/:itemIndex/reject
  rejectProductItem: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const { subOrderId, itemIndex } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập lý do từ chối'
        });
      }

      const subOrder = await ownerProductService.rejectProductItem(
        ownerId,
        subOrderId,
        parseInt(itemIndex),
        reason
      );

      return res.status(200).json({
        success: true,
        message: 'Sản phẩm đã được từ chối',
        data: subOrder
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // GET /api/owner/products/:id/rental-status
  checkRentalStatus: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const productId = req.params.id;

      // Verify product ownership
      const product = await ownerProductService.getOwnerProductById(ownerId, productId);

      const rentalStatus = await ownerProductService.checkProductRentalStatus(productId);

      return res.status(200).json({
        success: true,
        data: rentalStatus
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // PUT /api/owner/products/:id/hide
  hideProduct: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const productId = req.params.id;

      const result = await ownerProductService.hideProduct(ownerId, productId);

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.product
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // PUT /api/owner/products/:id/unhide
  unhideProduct: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const productId = req.params.id;

      const product = await ownerProductService.unhideProduct(ownerId, productId);

      return res.status(200).json({
        success: true,
        message: 'Product unhidden successfully',
        data: product
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // DELETE /api/owner/products/:id/soft-delete
  softDeleteProduct: async (req, res) => {
    try {
      const ownerId = req.user._id;
      const productId = req.params.id;

      const result = await ownerProductService.softDeleteProduct(ownerId, productId);

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.product
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  },

  // PUT /api/owner/products/:id/safe-update
  updateProductSafeFields: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const ownerId = req.user._id;
      const productId = req.params.id;
      const updateData = req.body;

      let imageValidationResults = [];

      // Handle new images with AI validation if provided
      if (req.files && req.files.length > 0) {
        try {
          // Get product to retrieve category for validation
          const existingProduct = await ownerProductService.getOwnerProductById(ownerId, productId);
          const categoryId = existingProduct.category._id || existingProduct.category;

          // Validate and upload images with AI
          const uploadedImages = await ownerProductService.uploadAndValidateImages(
            req.files,
            categoryId
          );

          // Extract validation results for response
          imageValidationResults = uploadedImages.map((img) => ({
            url: img.url,
            categoryMatch: img.categoryValidation.isRelevant,
            confidence: img.categoryValidation.confidence,
            detectedObjects: img.categoryValidation.detectedObjects,
            detectedLabels: img.categoryValidation.detectedLabels,
            matchScore: img.categoryValidation.matchScore,
            matchPercentage: img.categoryValidation.matchPercentage,
            nsfwSafe: img.nsfwCheck.safe,
            nsfwValue: img.nsfwCheck.nsfwValue
          }));

          // Set validated images for update
          updateData.newImages = uploadedImages;
        } catch (imageValidationError) {
          // Check if error has validationErrors array
          if (imageValidationError.validationErrors) {
            const validationErrors = imageValidationError.validationErrors;
            const nsfwErrors = validationErrors.filter((e) => e.type === 'NSFW_VIOLATION');
            const categoryErrors = validationErrors.filter((e) => e.type === 'CATEGORY_MISMATCH');
            const processingErrors = validationErrors.filter((e) => e.type === 'PROCESSING_ERROR');

            // Determine primary error type
            let errorType = 'IMAGE_VALIDATION_ERROR';
            let details = {
              reason: 'Image validation failed',
              suggestion: 'Please check your images and try again.'
            };

            if (nsfwErrors.length > 0 && categoryErrors.length > 0) {
              errorType = 'MIXED_VALIDATION_ERROR';
              details = {
                reason: 'Multiple validation issues found',
                suggestion:
                  'Please upload appropriate, family-friendly images that match your product category.'
              };
            } else if (nsfwErrors.length > 0) {
              errorType = 'NSFW_VIOLATION';
              details = {
                reason: 'Images contain inappropriate content',
                suggestion: 'Please upload appropriate, family-friendly images only.'
              };
            } else if (categoryErrors.length > 0) {
              errorType = 'CATEGORY_MISMATCH';
              details = {
                reason: 'Images do not match the product category',
                suggestion: 'Please upload images that are relevant to your product category.'
              };
            } else if (processingErrors.length > 0) {
              errorType = 'PROCESSING_ERROR';
              details = {
                reason: 'Error processing images',
                suggestion:
                  'Please try again with different images or contact support if the issue persists.'
              };
            }

            // Create errorBreakdown
            const errorBreakdown = {
              total: validationErrors.length,
              nsfw: nsfwErrors.length,
              category: categoryErrors.length,
              other: processingErrors.length,
              details: validationErrors.map((error) => ({
                fileName: error.filename,
                type: error.type,
                message: error.reason,
                nsfwValue: error.error?.includes('NSFW confidence') ? error.error : undefined
              }))
            };

            return res.status(400).json({
              success: false,
              message: 'Image validation failed',
              error: imageValidationError.message,
              errorType: errorType,
              errorBreakdown: errorBreakdown,
              details: details
            });
          }

          // Fallback for other types of errors
          return res.status(400).json({
            success: false,
            message: 'Image validation failed',
            error: imageValidationError.message,
            errorType: 'IMAGE_VALIDATION_ERROR',
            details: {
              reason: 'Image validation failed',
              suggestion: 'Please check your images and try again.'
            }
          });
        }
      }

      const product = await ownerProductService.updateProductSafeFields(
        ownerId,
        productId,
        updateData
      );

      return res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: product,
        imageValidation:
          imageValidationResults.length > 0
            ? {
                totalImages: imageValidationResults.length,
                results: imageValidationResults,
                summary: {
                  allImagesRelevant: imageValidationResults.every((img) => img.categoryMatch),
                  allImagesSafe: imageValidationResults.every((img) => img.nsfwSafe),
                  averageMatchScore:
                    imageValidationResults.reduce((sum, img) => sum + (img.matchScore || 0), 0) /
                    imageValidationResults.length,
                  averageNsfwValue:
                    imageValidationResults.reduce((sum, img) => sum + (img.nsfwValue || 0), 0) /
                    imageValidationResults.length
                }
              }
            : null
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Export upload middleware along with controller
module.exports = {
  ...ownerProductController,
  uploadMiddleware: upload.array('images', 10)
};
