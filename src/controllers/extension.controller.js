const mongoose = require('mongoose');
const MasterOrder = require('../models/MasterOrder');
const SubOrder = require('../models/SubOrder');
const Extension = require('../models/Extension');
const User = require('../models/User');
const Product = require('../models/Product');
const Shipment = require('../models/Shipment');
const { NotFoundError, BadRequest, ForbiddenError } = require('../core/error');
const SystemWalletService = require('../services/systemWallet.service');
const { sendNotification } = require('../services/notification.service');

class ExtensionController {
  /**
   * Renter requests extension
   */
  static async requestExtension(req, res) {
    try {
      const { subOrderId, selectedProducts, notes } = req.body;
      const renterId = req.user.id;

      // Validate input
      if (!subOrderId || !selectedProducts || selectedProducts.length === 0) {
        throw new BadRequest('Missing required fields: subOrderId, selectedProducts');
      }

      // Get suborder with master order info and products
      const subOrder = await SubOrder.findById(subOrderId)
        .populate('masterOrder owner')
        .populate('products.product');
      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      // Verify the renter owns this masterOrder
      const masterOrder = await MasterOrder.findById(subOrder.masterOrder._id);
      if (!masterOrder || masterOrder.renter.toString() !== renterId) {
        throw new ForbiddenError('You do not have permission to extend this order');
      }

      // Build products list with per-product details
      const productsList = [];
      let totalExtensionFee = 0;

      for (const selectedProduct of selectedProducts) {
        const product = subOrder.products.find(p => p._id.toString() === selectedProduct.productId);
        
        if (!product) {
          console.warn(`⚠️ Product ${selectedProduct.productId} not found in suborder`);
          continue;
        }

        // Use data from frontend (frontend already calculated everything)
        const currentEndDate = new Date(product.rentalPeriod.endDate);
        const newEndDate = new Date(selectedProduct.newEndDate);
        const extensionDays = selectedProduct.extensionDays;
        const dailyRentalPrice = selectedProduct.dailyRentalPrice || product.rentalRate || 0;
        // Use extensionFee sent from frontend (already correctly calculated there)
        // But also validate by recalculating as backup if frontend data seems wrong
        let extensionFee = selectedProduct.extensionFee || 0;
        
        // If extensionFee is 0 or not provided, recalculate it
        if (!extensionFee || extensionFee <= 0) {
          extensionFee = Math.ceil(dailyRentalPrice * extensionDays);
          console.warn(`⚠️ extensionFee was 0 or missing, recalculated: ${extensionFee}`);
        }

        const productData = {
          productId: product._id,
          owner: subOrder.owner._id,
          productName: product.product?.title || product.name || 'Sản phẩm',
          currentEndDate,
          newEndDate,
          extensionDays,
          dailyRentalPrice,
          extensionFee,
          status: 'PENDING'
        };

        productsList.push(productData);
        totalExtensionFee += extensionFee;
      }

      if (productsList.length === 0) {
        throw new BadRequest('No valid products found for extension');
      }

      // Find max extension days for overall status
      const maxExtensionDays = Math.max(...productsList.map(p => p.extensionDays));

      // Get renter's wallet and check balance
      const renter = await User.findById(renterId).populate('wallet');
      if (!renter || !renter.wallet) {
        throw new BadRequest('Không tìm thấy ví của người dùng');
      }

      const wallet = renter.wallet;
      if (wallet.balance.available < totalExtensionFee) {
        throw new BadRequest(
          `Ví không đủ số dư. Hiện có: ${wallet.balance.available.toLocaleString('vi-VN')}đ, cần: ${totalExtensionFee.toLocaleString('vi-VN')}đ`
        );
      }

      // Deduct from wallet immediately
      const transactionId = `EXT_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      wallet.balance.available = Math.round(wallet.balance.available - totalExtensionFee);

      // Add transaction log
      if (!wallet.transactions) {
        wallet.transactions = [];
      }
      wallet.transactions.push({
        type: 'PAYMENT',
        amount: Math.round(totalExtensionFee),
        description: `Thanh toán gia hạn thuê - ${productsList.length} sản phẩm`,
        timestamp: new Date(),
        status: 'COMPLETED',
        metadata: {
          subOrderId: subOrderId.toString(),
          masterOrderId: subOrder.masterOrder._id.toString()
        }
      });

      await wallet.save();

      // Create extension request with payment info
      const extension = new Extension({
        masterOrder: subOrder.masterOrder._id,
        subOrder: subOrderId,
        renter: renterId,
        products: productsList,
        extensionDays: maxExtensionDays,
        totalExtensionFee,
        notes,
        status: 'PENDING',
        paymentMethod: 'WALLET',
        paymentStatus: 'PAID',
        paymentInfo: {
          transactionId,
          paymentDate: new Date(),
          amount: totalExtensionFee,
          method: 'WALLET'
        }
      });

      await extension.save();
      await extension.populate('masterOrder renter products.owner');

      // Send notifications to owners
      try {
        const owner = subOrder.owner;
        const ownerProducts = extension.products;
        const productNames = ownerProducts.map(p => p.productName).join(', ');

        await sendNotification(
          owner._id.toString(),
          'Yêu cầu gia hạn thuê mới',
          `${masterOrder.renter.profile?.firstName || 'Người thuê'} yêu cầu gia hạn cho: ${productNames}`,
          {
            type: 'EXTENSION_REQUEST',
            category: 'INFO',
            relatedExtension: extension._id,
            data: {
              extensionId: extension._id.toString(),
              subOrderId,
              totalExtensionFee,
              productNames,
              productCount: ownerProducts.length
            }
          }
        );
        
      } catch (notifErr) {
        console.error('❌ Failed to send extension notification:', notifErr.message);
      }

      res.json({
        success: true,
        data: extension,
        message: 'Extension request created successfully'
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get extension requests for renter
   */
  static async getRenterExtensionRequests(req, res) {
    try {
      const renterId = req.user.id;
      const { status = 'PENDING', page = 1, limit = 10 } = req.query;

      const skip = (page - 1) * limit;

      const query = { renter: renterId };
      if (status) {
        query.status = status;
      }

      const extensions = await Extension.find(query)
        .populate('masterOrder', 'masterOrderNumber renter')
        .populate('owner', 'firstName lastName email phone')
        .populate('subOrder')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Extension.countDocuments(query);

      res.json({
        success: true,
        data: extensions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get extension requests for owner
   */
  static async getOwnerExtensionRequests(req, res) {
    try {
      const ownerId = req.user.id;
      const { status = 'PENDING', page = 1, limit = 10 } = req.query;

      const skip = (page - 1) * limit;
      const ownerObjectId = new mongoose.Types.ObjectId(ownerId);

      // Use aggregation pipeline to fetch data
      const extensionsWithProducts = await Extension.aggregate([
        // Match extensions that have products owned by this owner
        { $match: { 'products.owner': ownerObjectId } },
        // Unroll products array
        { $unwind: '$products' },
        // Filter for this owner's products with the specified status
        { $match: { 'products.owner': ownerObjectId, 'products.status': status } },
        // Sort by creation date
        { $sort: { createdAt: -1 } },
        // Pagination
        { $skip: skip },
        { $limit: parseInt(limit) },
        // Lookup to populate masterOrder
        {
          $lookup: {
            from: 'masterorders',
            localField: 'masterOrder',
            foreignField: '_id',
            as: 'masterOrder'
          }
        },
        { $unwind: '$masterOrder' },
        // Lookup to populate renter
        {
          $lookup: {
            from: 'users',
            localField: 'renter',
            foreignField: '_id',
            as: 'renter'
          }
        },
        { $unwind: '$renter' },
        // Lookup to populate subOrder
        {
          $lookup: {
            from: 'suborders',
            localField: 'subOrder',
            foreignField: '_id',
            as: 'subOrder'
          }
        },
        { $unwind: '$subOrder' },
        // Unwind subOrder products
        { $unwind: '$subOrder.products' },
        // Match the correct product in subOrder
        {
          $match: {
            $expr: { $eq: ['$subOrder.products._id', '$products.productId'] }
          }
        },
        // Lookup to populate the product in subOrder
        {
          $lookup: {
            from: 'products',
            localField: 'subOrder.products.product',
            foreignField: '_id',
            as: 'productDetail'
          }
        },
        { $unwind: { path: '$productDetail', preserveNullAndEmptyArrays: true } }
        // No $group! Keep flat structure - 1 document per product
      ]);

      // Transform data to match expected format
      // After removing $group, each document represents one product in one extension
      const flattenedRequests = extensionsWithProducts.map(ext => ({
        extensionId: ext._id,
        masterOrder: ext.masterOrder,
        renter: ext.renter,
        product: {
          ...ext.products,
          _id: ext.products.productId, // Use productId as the ID that frontend will use
          productId: ext.products.productId // Also include productId for clarity
        },
        productDetail: ext.productDetail,
        extensionDays: ext.products?.extensionDays,
        extensionFee: ext.products?.extensionFee,
        totalExtensionFee: ext.totalExtensionFee,
        paymentStatus: ext.paymentStatus,
        requestedAt: ext.requestedAt,
        createdAt: ext.createdAt,
        subOrder: ext.subOrder,
        notes: ext.notes
      }));

      // Count total products (not extensions) with this owner
      const totalResult = await Extension.aggregate([
        { $match: { 'products.owner': ownerObjectId } },
        { $unwind: '$products' },
        { $match: { 'products.owner': ownerObjectId, 'products.status': status } },
        { $count: 'total' }
      ]);
      const total = totalResult[0]?.total || 0;

      res.json({
        success: true,
        data: flattenedRequests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('❌ Error in getOwnerExtensionRequests:', error);
      throw error;
    }
  }

  /**
   * Get extension request detail
   */
  static async getExtensionRequestDetail(req, res) {
    try {
      const { requestId } = req.params;

      const extension = await Extension.findById(requestId)
        .populate('masterOrder', 'masterOrderNumber status totalAmount totalDepositAmount')
        .populate('subOrder')
        .populate('renter', 'email phone profile')
        .populate('owner', 'firstName lastName email phone profile');

      if (!extension) {
        throw new NotFoundError('Extension request not found');
      }

      // Check authorization
      const userId = req.user.id;
      if (
        extension.renter._id.toString() !== userId &&
        extension.owner._id.toString() !== userId
      ) {
        throw new ForbiddenError('You do not have permission to view this request');
      }

      res.json({
        success: true,
        data: extension
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Approve extension request
   */
  static async approveExtension(req, res) {
    try {
      const { requestId } = req.params;
      const { productId } = req.body; // Optional: Approve specific product only
      const ownerId = req.user.id;

      // Fetch extension with subOrder and nested products populated
      const extension = await Extension.findById(requestId)
        .populate('masterOrder renter')
        .populate({
          path: 'subOrder',
          populate: {
            path: 'products.product',
            select: 'title'
          }
        });
        
      if (!extension) {
        throw new NotFoundError('Extension request not found');
      }

      // Fetch product names from populated SubOrder
      
      if (extension.products && extension.products.length > 0 && extension.subOrder && extension.subOrder.products) {
        for (let product of extension.products) {
          if (product.productId && !product.productName) {
            // Find matching product in subOrder
            const subOrderProduct = extension.subOrder.products.find(
              p => p.product && p.product._id && p.product._id.toString() === product.productId.toString()
            );
            
            if (subOrderProduct && subOrderProduct.product && subOrderProduct.product.title) {
              product.productName = subOrderProduct.product.title;
            } else {
              // Fallback: try direct fetch
              try {
                const Product = require('../models/Product');
                const productDoc = await Product.findById(product.productId).select('title');
                if (productDoc && productDoc.title) {
                  product.productName = productDoc.title;
                } else {
                  product.productName = 'Sản phẩm';
                }
              } catch (err) {
                console.error('❌ [APPROVE] Error:', err.message);
                product.productName = 'Sản phẩm';
              }
            }
          }
        }
      }

      // Check if this is old format (with products array) or new format (single extension)
      const hasProducts = extension.products && extension.products.length > 0;

      // If old format (products array), productId is required
      if (hasProducts && !productId) {
        throw new BadRequest('Product ID is required to approve extension');
      }

      // If new format (no products array), use service method
      if (!hasProducts) {
        const ExtensionService = require('../services/extension.service');
        const result = await ExtensionService.approveExtension(requestId, ownerId);
        return res.json({
          success: true,
          data: result,
          message: 'Extension approved successfully'
        });
      }

      // Old format handling below (with products array)

      // Find the specific product to approve by its productId (not MongoDB ObjectId of embedded doc)
      const productIndex = extension.products.findIndex(
        p => p.productId.toString() === productId && p.owner.toString() === ownerId
      );

      if (productIndex === -1) {
        throw new BadRequest('Product not found or you are not the owner');
      }

      const productToApprove = extension.products[productIndex];

      // Check if already processed
      if (productToApprove.status !== 'PENDING') {
        throw new BadRequest(`Product is already ${productToApprove.status}`);
      }

      // Get suborder
      const subOrder = await SubOrder.findById(extension.subOrder).populate('products');
      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }
      // Tiền đã được trừ từ renter khi gửi yêu cầu gia hạn
      // Bây giờ chỉ cần chuyển 90% vào frozen wallet của owner

      // Get product name if not available in extension
      let productName = productToApprove.productName;
      if (!productName) {
        const subOrderProduct = subOrder.products.find(
          p => p.product._id.toString() === productToApprove.productId.toString()
        );
        productName = subOrderProduct?.product?.name || 'Unknown Product';
      }

      // Transfer 90% extension fee to owner (frozen until order completed)
      const Transaction = require('../models/Transaction');
      const ownerCompensation = Math.floor(productToApprove.extensionFee * 0.9); // 90% of extension fee
      const subOrderId = extension.subOrder;

      if (ownerCompensation > 0) {


        try {
          const adminId = process.env.SYSTEM_ADMIN_ID || 'SYSTEM_AUTO_TRANSFER';

          const transferResult = await SystemWalletService.transferToUserFrozen(
            adminId,
            ownerId,
            ownerCompensation,
            `Extension fee (90%) for product: ${productName} - ${productToApprove.extensionDays} days`,
            24 * 60 * 60 * 1000 // 24 hours
          );

          // Update transaction metadata
          if (transferResult?.transactions?.user?._id) {
            await Transaction.findByIdAndUpdate(
              transferResult.transactions.user._id,
              {
                $set: {
                  'metadata.subOrderId': subOrderId,
                  'metadata.action': 'RECEIVED_EXTENSION_FEE',
                  'metadata.extensionId': extension._id,
                  'metadata.extensionDays': productToApprove.extensionDays
                }
              }
            );
          }

        } catch (err) {
          console.error(`   ❌ Extension payment failed:`, err.message);
          console.error('   Error details:', err);
          // Don't throw error, extension still approved but log the issue
        }
      }

      // Update product rental period in subOrder
      const subOrderProduct = subOrder.products.find(p => p._id.toString() === productToApprove.productId.toString());
      if (subOrderProduct && subOrderProduct.rentalPeriod) {
        subOrderProduct.rentalPeriod.endDate = new Date(productToApprove.newEndDate);
      }

      // Update return shipment endDate if exists
      let returnShipment;
      try {
        returnShipment = await Shipment.findOne({
          subOrder: extension.subOrder,
          type: 'RETURN',
          productIndex: subOrder.products.findIndex(p => p._id.toString() === productToApprove.productId.toString())
        }).populate('shipper');

        if (returnShipment) {
          returnShipment.scheduledAt = new Date(productToApprove.newEndDate);
          await returnShipment.save();

          // Send notification to shipper about updated schedule
          if (returnShipment.shipper) {
            try {
              await sendNotification(
                returnShipment.shipper._id,
                '📅 Lịch trình giao hàng đã thay đổi',
                `Ngày trả hàng cho sản phẩm "${productName}" đã được gia hạn đến ${new Date(productToApprove.newEndDate).toLocaleDateString('vi-VN')}`,
                {
                  type: 'SHIPMENT_SCHEDULE_UPDATED',
                  category: 'INFO',
                  relatedShipment: returnShipment._id,
                  data: {
                    shipmentId: returnShipment._id.toString(),
                    productName,
                    oldDate: new Date(productToApprove.currentEndDate).toLocaleDateString('vi-VN'),
                    newDate: new Date(productToApprove.newEndDate).toLocaleDateString('vi-VN'),
                    extensionDays: productToApprove.extensionDays
                  }
                }
              );

              // Emit socket event to shipper for real-time update
              const io = req.app.get('io');
              if (io) {
                io.to(`user:${returnShipment.shipper._id}`).emit('shipment:scheduleUpdated', {
                  shipmentId: returnShipment._id.toString(),
                  productName,
                  newScheduledAt: productToApprove.newEndDate,
                  extensionDays: productToApprove.extensionDays
                });
              }
            } catch (notifErr) {
              console.error('Failed to notify shipper about schedule update:', notifErr.message);
            }
          }
        }
      } catch (shipmentErr) {
        console.error('Failed to update shipment:', shipmentErr.message);
      }

      // Save updated subOrder
      await subOrder.save();

      // Mark this product as approved - MUST update the product object in extension.products array
      productToApprove.status = 'APPROVED';
      productToApprove.approvedAt = new Date();


      // Update extension overall status based on all products
      const pendingCount = extension.products.filter(p => p.status === 'PENDING').length;
      const approvedCount = extension.products.filter(p => p.status === 'APPROVED').length;
      const rejectedCount = extension.products.filter(p => p.status === 'REJECTED').length;

      if (pendingCount === 0 && rejectedCount === 0) {
        extension.status = 'APPROVED';
      } else if (approvedCount > 0 || rejectedCount > 0) {
        extension.status = 'PARTIALLY_APPROVED';
      }

      // Save the extension with updated products and status
      await extension.save();


      // Send notification to renter
      try {
        await sendNotification(
          extension.renter._id,
          '✅ Yêu cầu gia hạn được chấp nhận',
          `Chủ sản phẩm "${productToApprove.productName}" đã chấp nhận yêu cầu gia hạn ${productToApprove.extensionDays} ngày. Phí ${productToApprove.extensionFee.toLocaleString('vi-VN')}đ đã được trừ từ ví của bạn.`,
          {
            type: 'EXTENSION_APPROVED',
            category: 'SUCCESS',
            relatedExtension: extension._id,
            data: {
              productName: productToApprove.productName,
              extensionDays: productToApprove.extensionDays,
              extensionFee: productToApprove.extensionFee
            }
          }
        );
      } catch (notifErr) {
        console.error('Failed to send approval notification:', notifErr.message);
      }

      res.json({
        success: true,
        data: extension,
        message: `Extension approved for product: ${productToApprove.productName}`
      });
    } catch (error) {
      console.error('❌ Error in approveExtension:', error);
      throw error;
    }
  }



  /**
   * Reject extension request
   */
  static async rejectExtension(req, res) {
    try {
      const { requestId } = req.params;
      const { productId, rejectionReason } = req.body;
      const ownerId = req.user.id;

      if (!productId) {
        throw new BadRequest('Product ID is required to reject extension');
      }

      if (!rejectionReason || !rejectionReason.trim()) {
        throw new BadRequest('Rejection reason is required');
      }

      const extension = await Extension.findById(requestId)
        .populate('subOrder')
        .populate({
          path: 'subOrder',
          populate: {
            path: 'products.product',
            select: 'title'
          }
        });
        
      if (!extension) {
        throw new NotFoundError('Extension request not found');
      }

      // Fetch product names from populated SubOrder
      
      if (extension.subOrder && extension.subOrder.products) {
        for (let product of extension.products) {
          if (product.productId && !product.productName) {
            // Find matching product in subOrder
            const subOrderProduct = extension.subOrder.products.find(
              p => p.product && p.product._id && p.product._id.toString() === product.productId.toString()
            );
            
            if (subOrderProduct && subOrderProduct.product && subOrderProduct.product.title) {
              product.productName = subOrderProduct.product.title;
            } else {
              // Fallback: try direct fetch
              try {
                const Product = require('../models/Product');
                const productDoc = await Product.findById(product.productId).select('title');
                if (productDoc && productDoc.title) {
                  product.productName = productDoc.title;
                } else {
                  product.productName = 'Sản phẩm';
                }
              } catch (err) {
                console.error('❌ [REJECT] Error:', err.message);
                product.productName = 'Sản phẩm';
              }
            }
          }
        }
      }
      

      // Find the specific product to reject
      const productIndex = extension.products.findIndex(
        p => p.productId.toString() === productId && p.owner.toString() === ownerId
      );

      if (productIndex === -1) {
        console.log('❌ Product not found. Details:', {
          searchProductId: productId,
          ownerId: ownerId,
          availableProducts: extension.products.map(p => ({
            productId: p.productId.toString(),
            owner: p.owner.toString(),
            match: p.productId.toString() === productId && p.owner.toString() === ownerId
          }))
        });
        throw new BadRequest('Product not found or you are not the owner');
      }

      const productToReject = extension.products[productIndex];

      // Check if already processed
      if (productToReject.status !== 'PENDING') {
        throw new BadRequest(`Product is already ${productToReject.status}`);
      }

      // Mark product as rejected
      productToReject.status = 'REJECTED';
      productToReject.rejectedAt = new Date();
      productToReject.rejectionReason = rejectionReason;

      // Update extension overall status based on all products
      const pendingCount = extension.products.filter(p => p.status === 'PENDING').length;
      const approvedCount = extension.products.filter(p => p.status === 'APPROVED').length;
      const rejectedCount = extension.products.filter(p => p.status === 'REJECTED').length;


      // Update status logic:
      // - If all products are rejected → REJECTED
      // - If there are ANY pending/approved/rejected mix → PARTIALLY_APPROVED
      // - Otherwise keep current status
      if (rejectedCount === extension.products.length) {
        extension.status = 'REJECTED';
        
        // Refund full amount if ALL products are rejected
        if (extension.paymentStatus === 'PAID') {
          try {
            const renter = await User.findById(extension.renter).populate('wallet');
            if (renter && renter.wallet) {
              const refundAmount = extension.totalExtensionFee;
              renter.wallet.balance.available = Math.round(renter.wallet.balance.available + refundAmount);
              
              // Add refund transaction
              if (!renter.wallet.transactions) {
                renter.wallet.transactions = [];
              }
              renter.wallet.transactions.push({
                type: 'REFUND',
                amount: Math.round(refundAmount),
                description: `Hoàn tiền gia hạn - Tất cả sản phẩm bị từ chối`,
                timestamp: new Date(),
                status: 'COMPLETED',
                metadata: {
                  extensionId: extension._id.toString(),
                  reason: rejectionReason
                }
              });
              
              await renter.wallet.save();
            }
          } catch (refundError) {
            console.error('❌ Error refunding payment:', refundError.message);
            // Continue even if refund fails
          }
        }
      } else if (pendingCount > 0 || approvedCount > 0 || rejectedCount > 0) {
        extension.status = 'PARTIALLY_APPROVED';
        
        // Partial refund for rejected product
        if (extension.paymentStatus === 'PAID') {
          try {
            const renter = await User.findById(extension.renter).populate('wallet');
            if (renter && renter.wallet) {
              const refundAmount = productToReject.extensionFee;
              renter.wallet.balance.available = Math.round(renter.wallet.balance.available + refundAmount);
              
              // Add partial refund transaction
              if (!renter.wallet.transactions) {
                renter.wallet.transactions = [];
              }
              renter.wallet.transactions.push({
                type: 'REFUND',
                amount: Math.round(refundAmount),
                description: `Hoàn tiền gia hạn - Sản phẩm "${productToReject.productName}" bị từ chối`,
                timestamp: new Date(),
                status: 'COMPLETED',
                metadata: {
                  extensionId: extension._id.toString(),
                  productId: productToReject.productId.toString(),
                  reason: rejectionReason
                }
              });
              
              await renter.wallet.save();
            }
          } catch (refundError) {
            console.error('❌ Error processing partial refund:', refundError.message);
            // Continue even if refund fails
          }
        }
      }

      extension.rejectionReason = rejectionReason;
      extension.rejectedAt = new Date();


      // Save the extension with updated products and status
      await extension.save();

      // Send notification to renter
      try {
        const ownerObj = await User.findById(ownerId);
        const ownerName = (ownerObj?.profile?.firstName || ownerObj?.firstName || 'Chủ hàng');
        

        await sendNotification(
          extension.renter._id,
          '❌ Yêu cầu gia hạn bị từ chối',
          `${ownerName} từ chối gia hạn cho sản phẩm "${productToReject.productName}".\n\nLý do: ${rejectionReason}`,
          { 
            type: 'EXTENSION_REJECTED', 
            category: 'ERROR',
            relatedExtension: extension._id,
            data: {
              productName: productToReject.productName,
              rejectionReason: rejectionReason
            }
          }
        );
      } catch (notifErr) {
        console.error('Failed to send rejection notification:', notifErr.message);
      }

      res.json({
        success: true,
        data: extension,
        message: `Extension rejected for product: ${productToReject.productName}`
      });
    } catch (error) {
      console.error('❌ Error in rejectExtension:', error);
      throw error;
    }
  }

  /**
   * Cancel extension request (by renter)
   */
  static async cancelExtension(req, res) {
    try {
      const { requestId } = req.params;
      const renterId = req.user.id;

      const extension = await Extension.findById(requestId).populate('masterOrder renter owner');
      if (!extension) {
        throw new NotFoundError('Extension request not found');
      }

      // Verify renter
      if (extension.renter._id.toString() !== renterId) {
        throw new ForbiddenError('Only the renter can cancel this extension');
      }

      // Check if can be cancelled (only PENDING requests)
      if (extension.status !== 'PENDING') {
        throw new BadRequest(`Cannot cancel ${extension.status} extension request`);
      }

      // Update extension request status
      extension.status = 'CANCELLED';
      extension.cancelledAt = new Date();
      extension.cancelledBy = renterId;
      await extension.save();

      res.json({
        success: true,
        data: extension,
        message: 'Extension request cancelled successfully'
      });
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ExtensionController;
