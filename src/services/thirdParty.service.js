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
    dispute.thirdPartyResolution = {
      escalatedAt: new Date(),
      escalatedBy: adminId,
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
    return dispute.populate(['complainant', 'respondent', 'thirdPartyResolution.evidence.uploadedBy']);
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
   * @returns {Promise<Object>}
   */
  async getThirdPartyInfo(disputeId) {
    const dispute = await Dispute.findOne(this._buildDisputeQuery(disputeId))
      .populate('complainant', 'profile email phone')
      .populate('respondent', 'profile email phone')
      .populate('assignedAdmin', 'profile email')
      .populate('thirdPartyResolution.escalatedBy', 'profile email')
      .populate('thirdPartyResolution.evidence.uploadedBy', 'profile email')
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

    return {
      dispute,
      thirdPartyInfo: dispute.thirdPartyResolution.thirdPartyInfo,
      evidence: dispute.thirdPartyResolution.evidence,
      escalatedAt: dispute.thirdPartyResolution.escalatedAt,
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
