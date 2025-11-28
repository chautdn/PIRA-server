const mongoose = require('mongoose');
const Dispute = require('../models/Dispute');
const SubOrder = require('../models/SubOrder');
const User = require('../models/User');
const { generateDisputeId } = require('../utils/idGenerator');

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

    // Kiểm tra xem có thể mở dispute không
    const canOpen = Dispute.schema.methods.canOpenDispute.call(
      {},
      product.productStatus,
      shipmentType,
      complainantId,
      subOrder.owner._id
    );

    if (!canOpen.allowed) {
      throw new Error(canOpen.reason);
    }

    // Tạo dispute
    const disputeId = generateDisputeId();
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
      status: 'OPEN',
      timeline: [{
        action: 'DISPUTE_CREATED',
        performedBy: complainantId,
        details: `Dispute được tạo với lý do: ${type}`,
        timestamp: new Date()
      }]
    });

    await dispute.save();

    // Cập nhật product status sang DISPUTED
    product.productStatus = 'DISPUTED';
    await subOrder.save();

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
      .populate('negotiationRoom.chatRoomId');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    return dispute;
  }
}

module.exports = new DisputeService();
