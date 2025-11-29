const mongoose = require('mongoose');
const Dispute = require('../models/Dispute');
const User = require('../models/User');

class ThirdPartyService {
  /**
   * Helper: Tạo query tìm dispute theo _id hoặc disputeId
   */
  _buildDisputeQuery(disputeId) {
    return mongoose.Types.ObjectId.isValid(disputeId) && disputeId.length === 24
      ? { _id: disputeId }
      : { disputeId };
  }
  /**
   * Chuyển dispute sang bên thứ 3
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} thirdPartyInfo - Thông tin bên thứ 3
   * @returns {Promise<Dispute>}
   */
  async escalateToThirdParty(disputeId, adminId, thirdPartyInfo) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'NEGOTIATION_FAILED') {
      throw new Error('Chỉ có thể chuyển bên thứ 3 khi đàm phán thất bại');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền chuyển sang bên thứ 3');
    }

    // Cập nhật status
    dispute.status = 'THIRD_PARTY_ESCALATED';
    
    // Tính deadline (7 ngày)
    const evidenceDeadline = new Date();
    evidenceDeadline.setDate(evidenceDeadline.getDate() + 7);
    
    dispute.thirdPartyResolution = {
      escalatedAt: new Date(),
      escalatedBy: adminId,
      evidenceDeadline,
      thirdPartyInfo: {
        name: thirdPartyInfo.name || '',
        contactInfo: thirdPartyInfo.contactInfo || '',
        caseNumber: thirdPartyInfo.caseNumber || ''
      },
      evidence: {
        documents: [],
        photos: [],
        officialDecision: '',
        uploadedBy: null,
        uploadedAt: null
      }
    };

    dispute.timeline.push({
      action: 'ESCALATED_TO_THIRD_PARTY',
      performedBy: adminId,
      details: `Chuyển sang bên thứ 3: ${thirdPartyInfo.name}`,
      timestamp: new Date()
    });

    await dispute.save();
    return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
  }

  /**
   * Admin chia sẻ thông tin shipper và thông tin cá nhân 2 bên
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @returns {Promise<Dispute>}
   */
  async shareShipperInfo(disputeId, adminId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('shipment complainant respondent assignedAdmin subOrder');

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'THIRD_PARTY_ESCALATED') {
      throw new Error('Dispute không ở trạng thái chuyển bên thứ 3');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền chia sẻ thông tin');
    }

    if (!dispute.shipment) {
      throw new Error('Không tìm thấy thông tin shipment');
    }

    // Lấy ảnh shipper từ adminDecision
    const shipperEvidence = dispute.adminDecision?.shipperEvidence || {};

    // Lấy thông tin cá nhân 2 bên
    const complainantInfo = {
      name: dispute.complainant.profile?.fullName || 'N/A',
      phone: dispute.complainant.phone || 'N/A',
      email: dispute.complainant.email || 'N/A',
      address: dispute.complainant.profile?.address || 'N/A'
    };

    const respondentInfo = {
      name: dispute.respondent.profile?.fullName || 'N/A',
      phone: dispute.respondent.phone || 'N/A',
      email: dispute.respondent.email || 'N/A',
      address: dispute.respondent.profile?.address || 'N/A'
    };

    // Cập nhật thông tin chia sẻ
    dispute.thirdPartyResolution.sharedData = {
      sharedAt: new Date(),
      sharedBy: adminId,
      shipperEvidence: {
        photos: shipperEvidence.photos || [],
        videos: shipperEvidence.videos || [],
        notes: shipperEvidence.notes || '',
        timestamp: shipperEvidence.timestamp || dispute.createdAt
      },
      partyInfo: {
        complainant: complainantInfo,
        respondent: respondentInfo
      }
    };

    dispute.timeline.push({
      action: 'ADMIN_SHARED_SHIPPER_INFO',
      performedBy: adminId,
      details: 'Admin đã chia sẻ thông tin shipper và thông tin cá nhân 2 bên để chuẩn bị cho bên thứ 3',
      timestamp: new Date()
    });

    await dispute.save();
    return dispute;
  }

  /**
   * Upload kết quả từ bên thứ 3
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user upload (owner hoặc renter)
   * @param {Object} evidence - Bằng chứng kết quả
   * @returns {Promise<Dispute>}
   */
  async uploadThirdPartyEvidence(disputeId, userId, evidence) {
    const { documents, photos, officialDecision } = evidence;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'THIRD_PARTY_ESCALATED') {
      throw new Error('Dispute chưa được chuyển sang bên thứ 3');
    }

    // Kiểm tra quyền upload (chỉ complainant hoặc respondent)
    const isComplainant = dispute.complainant.toString() === userId.toString();
    const isRespondent = dispute.respondent.toString() === userId.toString();

    if (!isComplainant && !isRespondent) {
      throw new Error('Chỉ complainant hoặc respondent mới có quyền upload bằng chứng');
    }

    // Cập nhật evidence
    dispute.thirdPartyResolution.evidence = {
      documents: documents || [],
      photos: photos || [],
      officialDecision,
      uploadedBy: userId,
      uploadedAt: new Date()
    };
    dispute.status = 'THIRD_PARTY_EVIDENCE_UPLOADED';

    dispute.timeline.push({
      action: 'THIRD_PARTY_EVIDENCE_UPLOADED',
      performedBy: userId,
      details: 'Upload kết quả từ bên thứ 3',
      timestamp: new Date()
    });

    await dispute.save();
    await dispute.populate([
      { path: 'complainant', select: 'profile email' },
      { path: 'respondent', select: 'profile email' },
      { path: 'thirdPartyResolution.evidence.uploadedBy', select: 'profile email' }
    ]);
    return dispute;
  }

  /**
   * Admin đưa ra quyết định cuối cùng dựa trên kết quả bên thứ 3
   * @param {String} disputeId - ID của dispute
   * @param {String} adminId - ID của admin
   * @param {Object} finalDecision - Quyết định cuối cùng
   * @returns {Promise<Dispute>}
   */
  async adminFinalDecision(disputeId, adminId, finalDecision) {
    const { resolutionText, financialImpact } = finalDecision;

    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId));
    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (dispute.status !== 'THIRD_PARTY_EVIDENCE_UPLOADED') {
      throw new Error('Chưa có bằng chứng từ bên thứ 3');
    }

    // Kiểm tra admin role
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'ADMIN') {
      throw new Error('Chỉ admin mới có quyền đưa ra quyết định cuối');
    }

    // Cập nhật resolution
    dispute.status = 'RESOLVED';
    dispute.resolution = {
      resolvedBy: adminId,
      resolvedAt: new Date(),
      resolutionText,
      resolutionSource: 'THIRD_PARTY',
      financialImpact: {
        refundAmount: financialImpact.refundAmount || 0,
        penaltyAmount: financialImpact.penaltyAmount || 0,
        compensationAmount: financialImpact.compensationAmount || 0,
        paidBy: financialImpact.paidBy,
        paidTo: financialImpact.paidTo,
        status: 'PENDING'
      }
    };

    dispute.timeline.push({
      action: 'FINAL_DECISION_MADE',
      performedBy: adminId,
      details: 'Admin đưa ra quyết định cuối cùng dựa trên bên thứ 3',
      timestamp: new Date()
    });

    await dispute.save();
    return dispute.populate(['complainant', 'respondent', 'assignedAdmin']);
  }

  /**
   * Lấy thông tin third party resolution
   * @param {String} disputeId - ID của dispute
   * @param {String} userId - ID của user (để check quyền)
   * @returns {Promise<Object>}
   */
  async getThirdPartyInfo(disputeId, userId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant', 'profile email phone')
      .populate('respondent', 'profile email phone')
      .populate('assignedAdmin', 'profile email')
      .populate('thirdPartyResolution.escalatedBy', 'profile email')
      .populate('thirdPartyResolution.evidence.uploadedBy', 'profile email')
      .populate('thirdPartyResolution.sharedData.sharedBy', 'profile email')
      .populate({
        path: 'subOrder',
        populate: [
          { path: 'owner', select: 'profile email phone' },
          { path: 'masterOrder', populate: { path: 'renter', select: 'profile email phone' } },
          { path: 'products.product' }
        ]
      });

    if (!dispute) {
      throw new Error('Dispute không tồn tại');
    }

    if (!['THIRD_PARTY_ESCALATED', 'THIRD_PARTY_EVIDENCE_UPLOADED', 'RESOLVED'].includes(dispute.status)) {
      throw new Error('Dispute chưa được chuyển sang bên thứ 3');
    }

    // Kiểm tra quyền: chỉ complainant, respondent hoặc admin mới xem được
    const user = await User.findById(userId);
    const isComplainant = dispute.complainant._id.toString() === userId.toString();
    const isRespondent = dispute.respondent._id.toString() === userId.toString();
    const isAdmin = user && user.role === 'ADMIN';

    if (!isComplainant && !isRespondent && !isAdmin) {
      throw new Error('Không có quyền xem thông tin này');
    }

    return {
      dispute,
      thirdPartyInfo: dispute.thirdPartyResolution.thirdPartyInfo,
      evidence: dispute.thirdPartyResolution.evidence,
      escalatedAt: dispute.thirdPartyResolution.escalatedAt,
      evidenceDeadline: dispute.thirdPartyResolution.evidenceDeadline,
      // Thông tin đã chia sẻ (chỉ hiển thị khi admin đã share)
      sharedData: dispute.thirdPartyResolution.sharedData || null,
      // Thông tin cần thiết để bên thứ 3 xem xét
      caseInfo: {
        product: dispute.subOrder.products[dispute.productIndex],
        complainant: {
          name: dispute.complainant.profile?.fullName || 'N/A',
          phone: dispute.complainant.phone,
          email: dispute.complainant.email
        },
        respondent: {
          name: dispute.respondent.profile?.fullName || 'N/A',
          phone: dispute.respondent.phone,
          email: dispute.respondent.email
        },
        shipperEvidence: dispute.adminDecision?.shipperEvidence,
        negotiationHistory: dispute.negotiationRoom?.finalAgreement
      }
    };
  }
}

module.exports = new ThirdPartyService();
