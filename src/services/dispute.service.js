const mongoose = require('mongoose');
const Dispute = require('../models/Dispute');
const SubOrder = require('../models/SubOrder');
const User = require('../models/User');
const { generateDisputeId } = require('../utils/idGenerator');
const notificationService = require('./notification.service');
const ChatGateway = require('../socket/chat.gateway');

class DisputeService {
  /**
   * Helper: Tạo query tìm dispute theo _id hoặc disputeId
   */
  _buildDisputeQuery(disputeId) {
    return mongoose.Types.ObjectId.isValid(disputeId) && disputeId.length === 24
      ? { _id: disputeId }
      : { disputeId };
  }

  /**
   * Helper: Lấy label của dispute type
   */
  _getDisputeTypeLabel(type) {
    const labels = {
      'PRODUCT_NOT_AS_DESCRIBED': 'Sản phẩm không đúng mô tả',
      'MISSING_ITEMS': 'Thiếu vật phẩm',
      'DAMAGED_BY_SHIPPER': 'Hư hại do shipper',
      'DELIVERY_FAILED_RENTER': 'Giao hàng thất bại',
      'PRODUCT_DEFECT': 'Sản phẩm lỗi khi sử dụng',
      'DAMAGED_ON_RETURN': 'Hư hại khi trả hàng',
      'LATE_RETURN': 'Trả muộn',
      'RETURN_FAILED_OWNER': 'Trả hàng thất bại'
    };
    return labels[type] || type;
  }

  /**
   * Helper: Tạo và emit notification
   */
  async _createAndEmitNotification(notificationData) {
    try {
      const notification = await notificationService.createNotification(notificationData);
      
      // Emit notification qua socket
      const chatGateway = ChatGateway.getInstance();
      if (chatGateway) {
        chatGateway.emitNotification(notificationData.recipient.toString(), notification);
      }
      
      return notification;
    } catch (error) {
      console.error('Error creating/emitting notification:', error);
      throw error;
    }
  }

  /**
   * Tạo dispute mới
   * @param {Object} data - Dữ liệu dispute
   * @returns {Promise<Dispute>}
   */
  async createDispute(data) {
    const {
      subOrderId,
      productId,
      productIndex,
      shipmentId,
      shipmentType,
      complainantId,
      type,
      title,
      description,
      evidence
    } = data;

    // Lấy thông tin SubOrder
    const subOrder = await SubOrder.findById(subOrderId)
      .populate('owner')
      .populate('masterOrder');
    
    if (!subOrder) {
      throw new Error('SubOrder không tồn tại');
    }

    // Kiểm tra product tồn tại
    const product = subOrder.products[productIndex];
    if (!product || product.product.toString() !== productId.toString()) {
      throw new Error('Product không tồn tại trong SubOrder');
    }

    // Xác định respondent dựa trên shipmentType
    let respondentId;
    if (shipmentType === 'DELIVERY') {
      // Renter mở dispute -> Owner là respondent
      respondentId = subOrder.owner._id;
      
      // Kiểm tra complainant phải là renter
      if (complainantId.toString() !== subOrder.masterOrder.renter.toString()) {
        throw new Error('Chỉ renter mới có thể mở dispute trong giai đoạn giao hàng');
      }
    } else if (shipmentType === 'RETURN') {
      // Owner mở dispute -> Renter là respondent
      respondentId = subOrder.masterOrder.renter;
      
      // Kiểm tra complainant phải là owner
      if (complainantId.toString() !== subOrder.owner._id.toString()) {
        throw new Error('Chỉ owner mới có thể mở dispute trong giai đoạn trả hàng');
      }
    }

    // Log để debug
    console.log('🔍 Checking canOpenDispute:', {
      productStatus: product.productStatus,
      shipmentType,
      complainantId: complainantId.toString(),
      ownerId: subOrder.owner._id.toString()
    });

    // Kiểm tra xem có thể mở dispute không
    const canOpen = Dispute.schema.methods.canOpenDispute.call(
      {},
      product.productStatus,
      shipmentType,
      complainantId,
      subOrder.owner._id
    );

    console.log('🔍 canOpenDispute result:', canOpen);

    if (!canOpen.allowed) {
      throw new Error(canOpen.reason);
    }

    // Tạo dispute
    const disputeId = generateDisputeId();
    
    // Kiểm tra nếu là lỗi của shipper → Auto-escalate lên Admin
    const isShipperFault = type === 'DAMAGED_BY_SHIPPER';
    
    const dispute = new Dispute({
      disputeId,
      subOrder: subOrderId,
      productId,
      productIndex,
      shipment: shipmentId,
      shipmentType,
      complainant: complainantId,
      respondent: respondentId,
      type,
      title,
      description,
      evidence: evidence || {},
      status: isShipperFault ? 'ADMIN_REVIEW' : 'OPEN',
      timeline: [{
        action: 'DISPUTE_CREATED',
        performedBy: complainantId,
        details: `Dispute được tạo với lý do: ${type}`,
        timestamp: new Date()
      }]
    });

    // Nếu là lỗi shipper, thêm timeline auto-escalate
    if (isShipperFault) {
      dispute.timeline.push({
        action: 'AUTO_ESCALATED_TO_ADMIN',
        performedBy: complainantId,
        details: 'Tranh chấp về lỗi shipper được tự động chuyển lên Admin để xử lý với đơn vị vận chuyển',
        timestamp: new Date()
      });
      
      // Đặt response deadline cho Admin (7 ngày)
      dispute.responseDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    await dispute.save();

    // Cập nhật product status sang DISPUTED
    product.productStatus = 'DISPUTED';
    
    // Thêm dispute vào product.disputes array
    if (!product.disputes) {
      product.disputes = [];
    }
    product.disputes.push(dispute._id);
    
    await subOrder.save();

    // Gửi notification
    try {
      const complainant = await User.findById(complainantId);
      const disputeTypeLabel = this._getDisputeTypeLabel(type);
      
      if (isShipperFault) {
        // Thông báo cho cả 2 bên: tranh chấp đã được gửi lên Admin
        const notificationData = {
          type: 'DISPUTE',
          category: 'INFO',
          title: 'Tranh chấp đã chuyển lên Admin',
          message: `Tranh chấp "${disputeTypeLabel}" đã được tự động chuyển lên Admin để xử lý với đơn vị vận chuyển. Cả 2 bên vui lòng chờ kết quả xử lý.`,
          relatedDispute: dispute._id,
          relatedOrder: subOrder.masterOrder,
          actions: [{
            label: 'Xem chi tiết',
            url: `/disputes/${dispute._id}`,
            action: 'VIEW_DISPUTE'
          }],
          data: {
            disputeId: dispute.disputeId,
            disputeType: type,
            shipmentType,
            autoEscalated: true
          },
          status: 'SENT'
        };
        
        // Gửi cho respondent (bên còn lại)
        await this._createAndEmitNotification({
          ...notificationData,
          recipient: respondentId
        });
        
        // Gửi lại cho complainant (người tạo)
        await this._createAndEmitNotification({
          ...notificationData,
          recipient: complainantId
        });
        
        // Gửi notification cho Admin team
        const admins = await User.find({ role: 'ADMIN' });
        for (const admin of admins) {
          await this._createAndEmitNotification({
            recipient: admin._id,
            type: 'DISPUTE',
            category: 'URGENT',
            title: 'Tranh chấp lỗi shipper cần xử lý',
            message: `${complainant.profile?.fullName || 'Người dùng'} báo cáo "${disputeTypeLabel}". Cần liên hệ đơn vị vận chuyển để xử lý.`,
            relatedDispute: dispute._id,
            relatedOrder: subOrder.masterOrder,
            actions: [{
              label: 'Xử lý ngay',
              url: `/admin/disputes/${dispute._id}`,
              action: 'REVIEW_DISPUTE'
            }],
            data: {
              disputeId: dispute.disputeId,
              disputeType: type,
              shipmentType,
              urgent: true
            },
            status: 'SENT'
          });
        }
      } else {
        // Flow thông thường: gửi notification cho respondent
        await this._createAndEmitNotification({
          recipient: respondentId,
          type: 'DISPUTE',
          category: 'WARNING',
          title: 'Tranh chấp mới',
          message: `${complainant.profile?.fullName || 'Người dùng'} đã tạo tranh chấp: ${disputeTypeLabel}. Vui lòng phản hồi trong 48h.`,
          relatedDispute: dispute._id,
          relatedOrder: subOrder.masterOrder,
          actions: [{
            label: 'Xem chi tiết',
            url: `/disputes/${dispute._id}`,
            action: 'VIEW_DISPUTE'
          }],
          data: {
            disputeId: dispute.disputeId,
            disputeType: type,
            shipmentType
          },
          status: 'SENT'
        });
      }
    } catch (error) {
      console.error('Failed to create dispute notification:', error);
    }

    return dispute.populate(['complainant', 'respondent', 'subOrder']);
  }

  /**
   * Respondent phản hồi dispute
   * @param {String} disputeId - ID của dispute
   * @param {String} respondentId - ID của respondent
   * @param {Object} response - Phản hồi
   * @returns {Promise<Dispute>}
   */
  async respondentResponse(disputeId, respondentId, response) {
    const { decision, reason, evidence } = response;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    // Kiểm tra quyền
    if (dispute.respondent.toString() !== respondentId.toString()) {
      throw new Error('Không có quyền phản hồi dispute này');
    }

    if (dispute.status !== 'OPEN') {
      throw new Error('Dispute không ở trạng thái chờ phản hồi');
    }

    // Cập nhật response
    dispute.respondentResponse = {
      decision,
      reason,
      respondedAt: new Date(),
      evidence: evidence || {}
    };

    if (decision === 'ACCEPTED') {
      // Respondent đồng ý -> Chuyển sang RESOLVED
      dispute.status = 'RESPONDENT_ACCEPTED';
      dispute.resolution = {
        resolvedBy: respondentId,
        resolvedAt: new Date(),
        resolutionText: reason || 'Respondent đã chấp nhận yêu cầu',
        resolutionSource: 'RESPONDENT_ACCEPTED'
      };
      
      dispute.timeline.push({
        action: 'RESPONDENT_ACCEPTED',
        performedBy: respondentId,
        details: 'Respondent đã chấp nhận dispute',
        timestamp: new Date()
      });
    } else {
      // Respondent từ chối -> Chuyển admin xử lý
      dispute.status = 'RESPONDENT_REJECTED';
      
      dispute.timeline.push({
        action: 'RESPONDENT_REJECTED',
        performedBy: respondentId,
        details: `Respondent từ chối: ${reason}`,
        timestamp: new Date()
      });
    }

    await dispute.save();

    // Gửi notification cho complainant
    try {
      const respondent = await User.findById(respondentId);
      const decisionText = decision === 'ACCEPTED' ? 'chấp nhận' : 'từ chối';
      
      await this._createAndEmitNotification({
        recipient: dispute.complainant,
        type: 'DISPUTE',
        category: decision === 'ACCEPTED' ? 'SUCCESS' : 'INFO',
        title: `Tranh chấp đã có phản hồi`,
        message: `${respondent.profile?.fullName || 'Bên bị khiếu nại'} đã ${decisionText} tranh chấp của bạn.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_DISPUTE'
        }],
        data: {
          disputeId: dispute.disputeId,
          decision
        },
        status: 'SENT'
      });
    } catch (error) {
      console.error('Failed to create respondent response notification:', error);
    }

    return dispute.populate(['complainant', 'respondent']);
  }

  /**
   * Admin xem xét và đưa ra quyết định sơ bộ
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} decision - Quyết định
   * @returns {Promise<Dispute>}
   */
  async adminReview(disputeId, adminId, decision) {
    const { decisionText, reasoning, shipperEvidence } = decision;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'RESPONDENT_REJECTED') {
      throw new Error('Dispute phải ở trạng thái RESPONDENT_REJECTED');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền xem xét dispute');
    }

    // Cập nhật admin decision
    dispute.assignedAdmin = adminId;
    dispute.status = 'ADMIN_DECISION_MADE';
    dispute.adminDecision = {
      decision: decisionText,
      reasoning,
      decidedAt: new Date(),
      decidedBy: adminId,
      shipperEvidence: shipperEvidence || {},
      complainantAccepted: null,
      respondentAccepted: null
    };

    dispute.timeline.push({
      action: 'ADMIN_DECISION_MADE',
      performedBy: adminId,
      details: `Admin đưa ra quyết định: ${decisionText}`,
      timestamp: new Date()
    });

    await dispute.save();

    // Gửi notification cho cả 2 bên
    try {
      const admin = await User.findById(adminId);
      const notificationData = {
        type: 'DISPUTE',
        category: 'INFO',
        title: 'Admin đã xem xét tranh chấp',
        message: `Admin ${admin.profile?.fullName || 'hệ thống'} đã đưa ra quyết định sơ bộ. Vui lòng xem xét và phản hồi.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_DISPUTE'
        }],
        data: {
          disputeId: dispute.disputeId,
          adminDecision: decisionText
        },
        status: 'SENT'
      };

      await Promise.all([
        this._createAndEmitNotification({
          ...notificationData,
          recipient: dispute.complainant
        }),
        this._createAndEmitNotification({
          ...notificationData,
          recipient: dispute.respondent
        })
      ]);
    } catch (error) {
      console.error('Failed to create admin review notification:', error);
    }

    return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
  }

  /**
   * Complainant/Respondent phản hồi quyết định của admin
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user
   * @param {Boolean} accepted - Chấp nhận hay không
   * @returns {Promise<Dispute>}
   */
  async respondToAdminDecision(disputeId, userId, accepted) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'ADMIN_DECISION_MADE') {
      throw new Error('Admin chưa đưa ra quyết định');
    }

    const isComplainant = dispute.complainant.toString() === userId.toString();
    const isRespondent = dispute.respondent.toString() === userId.toString();

    if (!isComplainant && !isRespondent) {
      throw new Error('Không có quyền phản hồi quyết định này');
    }

    // Cập nhật acceptance
    if (isComplainant) {
      dispute.adminDecision.complainantAccepted = accepted;
      dispute.timeline.push({
        action: accepted ? 'COMPLAINANT_ACCEPTED_ADMIN_DECISION' : 'COMPLAINANT_REJECTED_ADMIN_DECISION',
        performedBy: userId,
        details: accepted ? 'Complainant chấp nhận quyết định admin' : 'Complainant từ chối quyết định admin',
        timestamp: new Date()
      });
    } else {
      dispute.adminDecision.respondentAccepted = accepted;
      dispute.timeline.push({
        action: accepted ? 'RESPONDENT_ACCEPTED_ADMIN_DECISION' : 'RESPONDENT_REJECTED_ADMIN_DECISION',
        performedBy: userId,
        details: accepted ? 'Respondent chấp nhận quyết định admin' : 'Respondent từ chối quyết định admin',
        timestamp: new Date()
      });
    }

    // Kiểm tra xem cả 2 bên đã phản hồi chưa
    if (dispute.adminDecision.complainantAccepted !== null && 
        dispute.adminDecision.respondentAccepted !== null) {
      
      if (dispute.adminDecision.complainantAccepted && 
          dispute.adminDecision.respondentAccepted) {
        // Cả 2 bên đồng ý -> RESOLVED
        dispute.status = 'BOTH_ACCEPTED';
        dispute.resolution = {
          resolvedBy: dispute.assignedAdmin,
          resolvedAt: new Date(),
          resolutionText: dispute.adminDecision.decision,
          resolutionSource: 'ADMIN_DECISION'
        };
        
        dispute.timeline.push({
          action: 'BOTH_ACCEPTED',
          performedBy: userId,
          details: 'Cả 2 bên đã chấp nhận quyết định admin',
          timestamp: new Date()
        });
      } else {
        // Có ít nhất 1 bên không đồng ý -> Tự động tạo negotiation room
        const Chat = require('../models/Chat');
        
        // Tạo chat room cho 2 bên
        const chatRoom = new Chat({
          participants: [dispute.complainant, dispute.respondent]
        });
        await chatRoom.save();

        // Tạo negotiation room
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 3); // 3 ngày

        dispute.negotiationRoom = {
          startedAt: new Date(),
          deadline,
          chatRoomId: chatRoom._id,
          finalAgreement: {
            complainantAccepted: false,
            respondentAccepted: false
          }
        };
        
        dispute.status = 'IN_NEGOTIATION';
        
        dispute.timeline.push({
          action: 'NEGOTIATION_STARTED',
          performedBy: userId,
          details: `Tự động mở phòng đàm phán, hạn chót: ${deadline.toISOString()}`,
          timestamp: new Date()
        });
      }
    }

    await dispute.save();

    // Gửi notification cho bên kia
    try {
      const user = await User.findById(userId);
      const otherParty = isComplainant ? dispute.respondent : dispute.complainant;
      const roleText = isComplainant ? 'Người khiếu nại' : 'Bên bị khiếu nại';
      const decisionText = accepted ? 'chấp nhận' : 'từ chối';
      
      await this._createAndEmitNotification({
        recipient: otherParty,
        type: 'DISPUTE',
        category: 'INFO',
        title: 'Phản hồi quyết định admin',
        message: `${roleText} ${user.profile?.fullName || ''} đã ${decisionText} quyết định của admin.`,
        relatedDispute: dispute._id,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_DISPUTE'
        }],
        data: {
          disputeId: dispute.disputeId,
          accepted
        },
        status: 'SENT'
      });
    } catch (error) {
      console.error('Failed to create admin decision response notification:', error);
    }

    return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
  }

  /**
   * Lấy danh sách disputes
   * @param {Object} filters - Bộ lọc
   * @returns {Promise<Array>}
   */
  async getDisputes(filters = {}) {
    const query = {};

    if (filters.userId) {
      query.$or = [
        { complainant: filters.userId },
        { respondent: filters.userId }
      ];
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.shipmentType) {
      query.shipmentType = filters.shipmentType;
    }

    if (filters.subOrderId) {
      query.subOrder = filters.subOrderId;
    }

    const disputes = await Dispute.find(query)
      .populate('complainant', 'profile email')
      .populate('respondent', 'profile email')
      .populate('assignedAdmin', 'profile email')
      .populate('subOrder')
      .sort({ createdAt: -1 });

    return disputes;
  }

  /**
   * Lấy chi tiết dispute
   * @param {String} disputeId - ID của dispute
   * @returns {Promise<Dispute>}
   */
  async getDisputeDetail(disputeId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant', 'profile email phone')
      .populate('respondent', 'profile email phone')
      .populate('assignedAdmin', 'profile email')
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner', select: 'profile email phone' },
          { path: 'masterOrder', populate: { path: 'renter', select: 'profile email phone' } },
          { path: 'products.product' }
        ]
      })
      .populate('negotiationRoom.chatRoomId')
      .populate('thirdPartyResolution.evidence.uploadedBy', 'profile email')
      .populate('thirdPartyResolution.escalatedBy', 'profile email');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    return dispute;
  }

  /**
   * Admin xử lý tranh chấp lỗi shipper
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} resolution - Thông tin giải quyết
   * @returns {Promise<Dispute>}
   */
  async resolveShipperDamage(disputeId, adminId, resolution) {
    const { solution, reasoning, shipperEvidence, insuranceClaim, refundAmount, compensationAmount } = resolution;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant')
      .populate('respondent')
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner' },
          { path: 'masterOrder', populate: { path: 'renter' } }
        ]
      });

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    // Kiểm tra status và type
    if (dispute.status !== 'ADMIN_REVIEW') {
      throw new Error('Dispute phải ở trạng thái ADMIN_REVIEW');
    }

    if (dispute.type !== 'DAMAGED_BY_SHIPPER') {
      throw new Error('Chỉ áp dụng cho dispute loại DAMAGED_BY_SHIPPER');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền xử lý');
    }

    // Cập nhật admin decision
    dispute.assignedAdmin = adminId;
    dispute.status = 'RESOLVED';
    dispute.adminDecision = {
      decision: solution === 'REPLACEMENT' 
        ? 'Gửi hàng thay thế - Shipper chịu trách nhiệm'
        : 'Hoàn tiền + Hủy đơn - Shipper chịu trách nhiệm',
      reasoning,
      decidedAt: new Date(),
      decidedBy: adminId,
      shipperEvidence: shipperEvidence || {},
      insuranceClaim: insuranceClaim
    };

    // Add timeline
    dispute.timeline.push({
      action: 'SHIPPER_DAMAGE_RESOLVED',
      performedBy: adminId,
      details: `Admin xác định lỗi shipper. Giải pháp: ${solution === 'REPLACEMENT' ? 'Gửi hàng thay thế' : 'Hoàn tiền + Hủy đơn'}`,
      timestamp: new Date()
    });

    await dispute.save();

    // TODO: Execute financial transactions based on solution
    // - REPLACEMENT: No transactions for owner/renter, charge shipper
    // - REFUND_CANCEL: Refund renter, compensate owner, charge shipper

    // Gửi notification cho cả 2 bên
    try {
      const solutionText = solution === 'REPLACEMENT' 
        ? 'gửi hàng thay thế' 
        : 'hoàn tiền và hủy đơn';

      const notificationData = {
        type: 'DISPUTE',
        category: 'SUCCESS',
        title: 'Tranh chấp đã được giải quyết',
        message: `Admin xác nhận lỗi do shipper. Giải pháp: ${solutionText}. Credit score của bạn không bị ảnh hưởng.`,
        relatedDispute: dispute._id,
        relatedOrder: dispute.subOrder.masterOrder._id,
        actions: [{
          label: 'Xem chi tiết',
          url: `/disputes/${dispute._id}`,
          action: 'VIEW_DISPUTE'
        }],
        data: {
          disputeId: dispute.disputeId,
          solution,
          noImpact: true
        },
        status: 'SENT'
      };

      // Gửi cho complainant
      await this._createAndEmitNotification({
        ...notificationData,
        recipient: dispute.complainant._id
      });

      // Gửi cho respondent
      await this._createAndEmitNotification({
        ...notificationData,
        recipient: dispute.respondent._id
      });
    } catch (error) {
      console.error('Failed to send resolution notifications:', error);
    }

    return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
  }
}

module.exports = new DisputeService();
