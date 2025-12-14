const ShipmentService = require('../services/shipment.service');
const RentalOrderService = require('../services/rentalOrder.service');
const User = require('../models/User');
const SubOrder = require('../models/SubOrder');
const Shipment = require('../models/Shipment');

class ShipmentController {
  async createShipment(req, res) {
    try {
      const payload = req.body || {};
      const ownerId = req.user?._id;

      // Validate subOrder belongs to owner
      if (!payload.subOrder) return res.status(400).json({ status: 'error', message: 'subOrder is required' });
      const subOrder = await SubOrder.findById(payload.subOrder);
      if (!subOrder) return res.status(404).json({ status: 'error', message: 'SubOrder not found' });
      if (String(subOrder.owner) !== String(ownerId)) return res.status(403).json({ status: 'error', message: 'You are not owner of this suborder' });

      // If a shipperId is provided, ensure it exists
      if (payload.shipper) {
        const shipper = await User.findById(payload.shipper);
        if (!shipper || shipper.role !== 'SHIPPER') {
          return res.status(400).json({ status: 'error', message: 'Invalid shipper selected' });
        }
      }

      payload.createdBy = ownerId;
      payload.status = 'PENDING'; // owner sent request to shipper

      const shipment = await ShipmentService.createShipment(payload);
      return res.json({ status: 'success', message: 'Shipment request created', data: shipment });
    } catch (err) {
      console.error('createShipment error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async getShipment(req, res) {
    try {
      const shipment = await ShipmentService.getShipment(req.params.id);
      if (!shipment) return res.status(404).json({ status: 'error', message: 'Not found' });
      return res.json({ status: 'success', data: shipment });
    } catch (err) {
      console.error('getShipment error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async shipperAccept(req, res) {
    try {
      // only shipper can accept
      if (req.user.role !== 'SHIPPER') return res.status(403).json({ status: 'error', message: 'Only shippers can accept shipments' });

      const shipment = await ShipmentService.shipperAccept(req.params.id, req.user._id);
      return res.json({ status: 'success', data: shipment });
    } catch (err) {
      console.error('shipperAccept error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async listMyShipments(req, res) {
    try {
      if (req.user.role !== 'SHIPPER') return res.status(403).json({ status: 'error', message: 'Only shippers can view their shipments' });
      const shipments = await ShipmentService.listByShipper(req.user._id);
      return res.json({ status: 'success', data: shipments });
    } catch (err) {
      console.error('listMyShipments error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  /**
   * List available PENDING shipments grouped by type (DELIVERY vs RETURN)
   * Shipper can see which ones need to be picked up
   */
  async listAvailableShipments(req, res) {
    try {
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can view available shipments' 
        });
      }
      const grouped = await ShipmentService.listAvailableShipments(req.user._id);
      return res.json({ 
        status: 'success',
        data: grouped,
        message: `Available: ${grouped.DELIVERY.length} deliveries, ${grouped.RETURN.length} returns`
      });
    } catch (err) {
      console.error('listAvailableShipments error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  // List shippers by ward or district
  async listShippers(req, res) {
    try {
      const { ward, district, city } = req.query;
      const filter = { role: 'SHIPPER' };

      // Use ward if provided (some users may store ward in address.ward)
      if (ward) {
        filter['address.ward'] = ward;
      } else if (district) {
        filter['address.district'] = district;
      } else if (city) {
        filter['address.city'] = city;
      }

      const shippers = await User.find(filter)
        .select('_id email phone profile address')
        .sort({ createdAt: -1 });
      
      // Transform data for frontend
      const transformedShippers = shippers.map(shipper => ({
        _id: shipper._id,
        email: shipper.email,
        phone: shipper.phone,
        name: `${shipper.profile?.firstName || ''} ${shipper.profile?.lastName || ''}`.trim() || shipper.email,
        profile: shipper.profile,
        address: shipper.address
      }));
      
      console.log(`✅ Found ${transformedShippers.length} shippers with filter:`, filter);
      
      return res.json({ status: 'success', data: transformedShippers });
    } catch (err) {
      console.error('listShippers error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async pickup(req, res) {
    try {
      const shipperId = req.user._id;
      const shipmentId = req.params.id;
      const userRole = req.user.role;

      console.log('📥 POST /shipments/:id/pickup');
      console.log('👤 User ID:', shipperId);
      console.log('👤 User Role:', userRole);
      console.log('📦 Shipment ID:', shipmentId);

      // Only SHIPPER role can pickup shipments
      if (userRole !== 'SHIPPER') {
        console.error('❌ User is not a shipper - access denied');
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can pick up shipments. This action has been logged.' 
        });
      }

      const shipment = await ShipmentService.updatePickup(shipmentId, req.body);
      console.log('✅ Shipment pickup marked successfully');
      return res.json({ status: 'success', data: shipment });
    } catch (err) {
      console.error('pickup error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async deliver(req, res) {
    try {
      const shipperId = req.user._id;
      const shipmentId = req.params.id;
      const userRole = req.user.role;

      console.log('📥 POST /shipments/:id/deliver');
      console.log('👤 User ID:', shipperId);
      console.log('👤 User Role:', userRole);
      console.log('📦 Shipment ID:', shipmentId);

      // Double-check: Only SHIPPER role can deliver shipments
      if (userRole !== 'SHIPPER') {
        console.error('❌ User is not a shipper - access denied');
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can mark shipments as delivered. This action has been logged.' 
        });
      }

      const shipment = await ShipmentService.markDelivered(shipmentId, req.body);
      return res.json({ status: 'success', data: shipment });
    } catch (err) {
      console.error('deliver error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async renterConfirm(req, res) {
    try {
      const result = await ShipmentService.renterConfirmDelivered(req.params.id, req.user._id);
      // result may be { shipment, transferResult } or a shipment (backwards compatibility)
      if (result && result.shipment) {
        return res.json({
          status: 'success',
          data: result.shipment,
          transfer: {
            result: result.transferResult || null,
            error: result.transferError || null
          }
        });
      }

      // fallback - return whatever service returned
      return res.json({ status: 'success', data: result });
    } catch (err) {
      console.error('renterConfirm error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async createDeliveryAndReturnShipments(req, res) {
    try {
      const { masterOrderId } = req.params;
      const { shipperId } = req.body;
      
      if (!masterOrderId) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'masterOrderId is required' 
        });
      }

      // Verify master order exists
      const MasterOrder = require('../models/MasterOrder');
      const SubOrder = require('../models/SubOrder');
      
      const masterOrder = await MasterOrder.findById(masterOrderId);
      if (!masterOrder) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Master order not found' 
        });
      }

      // Check if user is admin or owner
      if (req.user?.role === 'ADMIN') {
        // Admin can always create shipments
      } else {
        // For non-admin users, check if they are one of the owners in the suborders
        const subOrders = await SubOrder.find({ masterOrder: masterOrderId });
        const isOwner = subOrders.some(so => String(so.owner) === String(req.user?._id));
        
        if (!isOwner) {
          return res.status(403).json({ 
            status: 'error', 
            message: 'Only the owner or admin can request shipment creation' 
          });
        }
      }

      // Create shipments and assign to shipper
      const result = await ShipmentService.createDeliveryAndReturnShipments(masterOrderId, shipperId);

      return res.json({ 
        status: 'success', 
        message: `Created ${result.count} shipments (${result.pairs} pairs) and assigned to shipper`,
        data: result 
      });
    } catch (err) {
      console.error('❌ createDeliveryAndReturnShipments error:');
      console.error('   Message:', err.message);
      console.error('   Type:', err.constructor.name);
      console.error('   Full error:', err);
      if (err.stack) {
        console.error('   Stack:', err.stack);
      }
      return res.status(400).json({ 
        status: 'error', 
        message: err.message,
        error: process.env.NODE_ENV === 'development' ? err.toString() : undefined
      });
    }
  }

  // Get shipments for a master order
  async getShipmentsByMasterOrder(req, res) {
    try {
      const { masterOrderId } = req.params;

      if (!masterOrderId) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'masterOrderId is required' 
        });
      }

      // Verify master order exists and user has access
      const MasterOrder = require('../models/MasterOrder');
      const Shipment = require('../models/Shipment');

      const masterOrder = await MasterOrder.findById(masterOrderId);
      if (!masterOrder) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Master order not found' 
        });
      }

      // Check if user is renter, owner of suborders, or admin
      const isAdmin = req.user?.role === 'ADMIN';
      const isRenter = String(masterOrder.renter) === String(req.user?._id);
      
      // Check if user is owner of the suborders
      const SubOrder = require('../models/SubOrder');
      const subOrders = await SubOrder.find({ masterOrder: masterOrderId }).select('_id owner');
      
      const isOwner = subOrders.some(so => String(so.owner) === String(req.user?._id));

      if (!isAdmin && !isRenter && !isOwner) {
        return res.status(403).json({ 
          status: 'error', 
          message: 'You do not have permission to view these shipments' 
        });
      }

      // Get all shipments for this master order's suborders
      const subOrderIds = subOrders.map(so => so._id);

      const shipments = await Shipment.find({ 
        subOrder: { $in: subOrderIds } 
      })
        .populate('shipper', '_id name email phone profile')
        .sort({ createdAt: -1 });

      return res.json({ 
        status: 'success', 
        data: shipments 
      });
    } catch (err) {
      console.error('getShipmentsByMasterOrder error:', err.message);
      return res.status(400).json({ 
        status: 'error', 
        message: err.message 
      });
    }
  }

  async uploadProof(req, res) {
    try {
      const ShipmentProof = require('../models/Shipment_Proof');
      const Shipment = require('../models/Shipment');
      const CloudinaryService = require('../services/cloudinary/cloudinary.service');
      
      const { shipmentId } = req.params;
      const { notes } = req.body;
      const files = req.files || [];

      // Verify shipment exists and belongs to shipper
      const shipment = await Shipment.findById(shipmentId);
      if (!shipment) return res.status(404).json({ status: 'error', message: 'Shipment not found' });
      
      if (String(shipment.shipper) !== String(req.user._id)) {
        return res.status(403).json({ status: 'error', message: 'Only assigned shipper can upload proof' });
      }

      // Validate: minimum 3 images, maximum 10 images
      if (files.length === 0) {
        return res.status(400).json({ status: 'error', message: 'At least 3 images are required' });
      }
      if (files.length < 3) {
        return res.status(400).json({ 
          status: 'error', 
          message: `Minimum 3 images required. You uploaded ${files.length} image(s)` 
        });
      }
      if (files.length > 10) {
        return res.status(400).json({ 
          status: 'error', 
          message: `Maximum 10 images allowed. You uploaded ${files.length} image(s)` 
        });
      }

      // Upload all files to Cloudinary in parallel
      const imageUrls = [];
      try {
        console.log(`📤 Uploading ${files.length} image(s) to Cloudinary for shipment ${shipmentId}...`);
        const uploadPromises = files.map(file => CloudinaryService.uploadImage(file.buffer));
        const uploadResults = await Promise.all(uploadPromises);
        uploadResults.forEach((uploadResult) => {
          imageUrls.push(uploadResult.secure_url);
          console.log(`✅ Image uploaded: ${uploadResult.secure_url}`);
        });
      } catch (uploadErr) {
        console.error(`❌ Cloudinary upload failed:`, uploadErr.message);
        return res.status(400).json({ status: 'error', message: 'Image upload to Cloudinary failed: ' + uploadErr.message });
      }

      // Find or create ShipmentProof
      let proof = await ShipmentProof.findOne({ shipment: shipmentId });
      
      if (!proof) {
        // Create new proof
        proof = new ShipmentProof({
          shipment: shipmentId,
          notes: notes || ''
        });
      }

      // Update based on shipment status
      if (shipment.status === 'SHIPPER_CONFIRMED') {
        // Pickup phase - save as before delivery images
        proof.imagesBeforeDelivery = imageUrls;
        // Also keep first image in imageBeforeDelivery for backward compatibility
        proof.imageBeforeDelivery = imageUrls[0];
      } else if (shipment.status === 'IN_TRANSIT') {
        // Deliver phase - save as after delivery images
        proof.imagesAfterDelivery = imageUrls;
        // Also keep first image in imageAfterDelivery for backward compatibility
        proof.imageAfterDelivery = imageUrls[0];
      } else {
        return res.status(400).json({ status: 'error', message: 'Shipment must be in SHIPPER_CONFIRMED or IN_TRANSIT status' });
      }

      // Add geolocation if provided
      if (req.body.geolocation) {
        try {
          proof.geolocation = JSON.parse(req.body.geolocation);
        } catch (e) {
        }
      }

      await proof.save();

      return res.json({ status: 'success', message: 'Proof uploaded successfully', data: proof });
    } catch (err) {
      console.error('uploadProof error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async getProof(req, res) {
    try {
      const ShipmentProof = require('../models/Shipment_Proof');
      const { shipmentId } = req.params;

      const proof = await ShipmentProof.findOne({ shipment: shipmentId }).populate('shipment');
      if (!proof) return res.status(404).json({ status: 'error', message: 'Proof not found' });

      return res.json({ status: 'success', data: proof });
    } catch (err) {
      console.error('getProof error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async cancelShipmentPickup(req, res) {
    try {
      // Only SHIPPER can cancel
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can cancel shipment pickup' 
        });
      }

      const shipmentId = req.params.id;
      console.log(`\n📥 POST /shipments/${shipmentId}/cancel-pickup`);
      console.log(`👤 User ID: ${req.user._id}`);
      console.log(`👤 User Role: ${req.user.role}`);

      const shipment = await ShipmentService.cancelShipmentPickup(shipmentId);
      
      return res.json({ 
        status: 'success', 
        message: 'Shipment cancellation processed',
        data: shipment 
      });
    } catch (err) {
      console.error('cancelShipmentPickup error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async rejectDelivery(req, res) {
    try {
      // Only SHIPPER can reject
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can reject delivery' 
        });
      }

      const shipmentId = req.params.id;
      const { reason, notes } = req.body;

      console.log(`\n📥 POST /shipments/${shipmentId}/reject-delivery`);
      console.log(`👤 User ID: ${req.user._id}`);
      console.log(`👤 User Role: ${req.user.role}`);
      console.log(`📝 Reason: ${reason}`);

      const shipment = await ShipmentService.rejectDelivery(shipmentId, { reason, notes });
      
      return res.json({ 
        status: 'success', 
        message: 'Delivery rejection processed',
        data: shipment 
      });
    } catch (err) {
      console.error('rejectDelivery error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async ownerNoShow(req, res) {
    try {
      // Only SHIPPER can report owner no-show
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can report owner no-show' 
        });
      }

      const shipmentId = req.params.id;
      const { notes } = req.body;

      console.log(`\n📥 POST /shipments/${shipmentId}/owner-no-show`);
      console.log(`👤 User ID: ${req.user._id}`);
      console.log(`👤 User Role: ${req.user.role}`);
      console.log(`📝 Notes: ${notes}`);

      const shipment = await ShipmentService.ownerNoShow(shipmentId, { notes });
      
      return res.json({ 
        status: 'success', 
        message: 'Owner no-show processed',
        data: shipment 
      });
    } catch (err) {
      console.error('ownerNoShow error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async renterNoShow(req, res) {
    try {
      // Only SHIPPER can report renter no-show
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can report renter no-show' 
        });
      }

      const shipmentId = req.params.id;
      const { notes } = req.body;

      console.log(`\n📥 POST /shipments/${shipmentId}/renter-no-show`);
      console.log(`👤 User ID: ${req.user._id}`);
      console.log(`👤 User Role: ${req.user.role}`);
      console.log(`📝 Notes: ${notes}`);

      const shipment = await ShipmentService.renterNoShow(shipmentId, { notes });
      
      return res.json({ 
        status: 'success', 
        message: 'Renter no-show processed',
        data: shipment 
      });
    } catch (err) {
      console.error('renterNoShow error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async returnFailed(req, res) {
    try {
      // Only SHIPPER can report return failed
      if (req.user.role !== 'SHIPPER') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only shippers can report return failed' 
        });
      }

      const shipmentId = req.params.id;
      const { notes } = req.body;

      console.log(`\n📥 POST /shipments/${shipmentId}/return-failed`);
      console.log(`👤 User ID: ${req.user._id}`);
      console.log(`👤 User Role: ${req.user.role}`);
      console.log(`📝 Notes: ${notes}`);

      const shipment = await ShipmentService.returnFailed(shipmentId, { notes });
      
      return res.json({ 
        status: 'success', 
        message: 'Return failed processed',
        data: shipment 
      });
    } catch (err) {
      console.error('returnFailed error', err.message);
      return res.status(400).json({ status: 'error', message: err.message });
    }
  }

  async getShipperShipments(req, res) {
    try {
      const { shipperId } = req.params;

      console.log(`\n📥 GET /shipments/shipper/${shipperId}`);
      console.log(`👤 Admin User ID: ${req.user._id}`);
      console.log(`👤 Admin Role: ${req.user.role}`);

      // Only ADMIN can view shipper's shipments
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Only admins can view shipper shipments' 
        });
      }

      // Get all shipments for this shipper with full details
      const shipments = await Shipment.find({ shipper: shipperId })
        .populate({
          path: 'subOrder',
          populate: [
            {
              path: 'masterOrder',
              select: 'masterOrderNumber rentalPeriod renter',
              populate: {
                path: 'renter',
                select: 'profile email phone'
              }
            },
            {
              path: 'owner',
              select: 'profile email phone'
            },
            {
              path: 'products.product',
              select: 'name images'
            }
          ]
        })
        .populate('shipper', 'profile email phone')
        .sort({ createdAt: -1 });

      // Get shipment proofs for all shipments
      const ShipmentProof = require('../models/Shipment_Proof');
      const shipmentIds = shipments.map(s => s._id);
      const proofs = await ShipmentProof.find({ 
        shipment: { $in: shipmentIds } 
      });

      // Map proofs to shipments
      const proofsMap = {};
      proofs.forEach(proof => {
        proofsMap[proof.shipment.toString()] = proof;
      });

      // Enrich shipments with proof data
      const enrichedShipments = shipments.map(shipment => {
        const shipmentObj = shipment.toObject();
        const proof = proofsMap[shipment._id.toString()];
        
        return {
          ...shipmentObj,
          proof: proof ? {
            imagesBeforeDelivery: proof.imagesBeforeDelivery || [],
            imagesAfterDelivery: proof.imagesAfterDelivery || [],
            imageBeforeDelivery: proof.imageBeforeDelivery,
            imageAfterDelivery: proof.imageAfterDelivery,
            notes: proof.notes,
            geolocation: proof.geolocation
          } : null,
          // Add formatted dates for easier display
          formattedDates: {
            scheduled: shipment.scheduledAt ? new Date(shipment.scheduledAt).toLocaleString('vi-VN') : null,
            pickedUp: shipment.tracking?.pickedUpAt ? new Date(shipment.tracking.pickedUpAt).toLocaleString('vi-VN') : null,
            delivered: shipment.tracking?.deliveredAt ? new Date(shipment.tracking.deliveredAt).toLocaleString('vi-VN') : null,
            cancelled: shipment.tracking?.cancelledAt ? new Date(shipment.tracking.cancelledAt).toLocaleString('vi-VN') : null
          }
        };
      });

      console.log(`✅ Found ${enrichedShipments.length} shipments for shipper ${shipperId}`);
      
      return res.json({ 
        status: 'success', 
        data: {
          shipments: enrichedShipments,
          total: enrichedShipments.length,
          stats: {
            total: enrichedShipments.length,
            pending: enrichedShipments.filter(s => s.status === 'PENDING').length,
            shipperConfirmed: enrichedShipments.filter(s => s.status === 'SHIPPER_CONFIRMED').length,
            inTransit: enrichedShipments.filter(s => s.status === 'IN_TRANSIT').length,
            delivered: enrichedShipments.filter(s => s.status === 'DELIVERED').length,
            cancelled: enrichedShipments.filter(s => s.status === 'CANCELLED').length,
            delivery: enrichedShipments.filter(s => s.type === 'DELIVERY').length,
            return: enrichedShipments.filter(s => s.type === 'RETURN').length
          }
        }
      });
    } catch (err) {
      console.error('❌ getShipperShipments error:', err);
      console.error('Error stack:', err.stack);
      return res.status(500).json({ status: 'error', message: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
    }
  }
}

module.exports = new ShipmentController();
