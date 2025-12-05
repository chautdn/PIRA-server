const disputeService = require('../services/dispute.service');
const negotiationService = require('../services/negotiation.service');
const thirdPartyService = require('../services/thirdParty.service');
const responseUtils = require('../utils/response');

class AdminDisputeController {
  /**
   * Lấy tất cả disputes (Admin)
   * GET /api/admin/disputes
   */
  async getAllDisputes(req, res) {
    try {
      const { status, shipmentType, priority } = req.query;

      const disputes = await disputeService.getDisputes({
        status,
        shipmentType,
        priority
      });

      return responseUtils.success(res, { disputes });
    } catch (error) {
      console.error('Get all disputes error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Admin xem xét và đưa ra quyết định
   * POST /api/admin/disputes/:disputeId/review
   */
  async reviewDispute(req, res) {
    try {
      const { disputeId } = req.params;
      const { decisionText, reasoning, shipperEvidence, whoIsRight } = req.body;
      const adminId = req.user._id;

      // Nếu frontend gửi decisionText thay vì whoIsRight, convert nó
      const finalWhoIsRight = whoIsRight || decisionText;

      const dispute = await disputeService.adminReview(disputeId, adminId, {
        decisionText,
        reasoning,
        shipperEvidence,
        whoIsRight: finalWhoIsRight // 'COMPLAINANT_RIGHT' hoặc 'RESPONDENT_RIGHT'
      });

      return responseUtils.success(res, {
        dispute,
        message: 'Đã đưa ra quyết định sơ bộ'
      });
    } catch (error) {
      console.error('Admin review dispute error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Tạo negotiation room
   * POST /api/admin/disputes/:disputeId/negotiation/create
   */
  async createNegotiationRoom(req, res) {
    try {
      const { disputeId } = req.params;
      const adminId = req.user._id;

      const dispute = await negotiationService.createNegotiationRoom(disputeId, adminId);

      return responseUtils.success(res, {
        dispute,
        message: 'Đã tạo phòng đàm phán'
      });
    } catch (error) {
      console.error('Create negotiation room error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Admin chốt thỏa thuận từ negotiation
   * POST /api/admin/disputes/:disputeId/negotiation/finalize
   */
  async finalizeNegotiation(req, res) {
    try {
      const { disputeId } = req.params;
      const { decision, reasoning } = req.body;
      const adminId = req.user._id;

      const dispute = await negotiationService.adminFinalizeNegotiation(disputeId, adminId, {
        decision,
        reasoning
      });

      return responseUtils.success(res, {
        dispute,
        message: 'Đã chốt thỏa thuận'
      });
    } catch (error) {
      console.error('Finalize negotiation error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Chuyển dispute sang bên thứ 3
   * POST /api/admin/disputes/:disputeId/third-party/escalate
   */
  async escalateToThirdParty(req, res) {
    try {
      const { disputeId } = req.params;
      const { name, contactInfo, caseNumber } = req.body;
      const adminId = req.user._id;

      const dispute = await thirdPartyService.escalateToThirdParty(disputeId, adminId, {
        name,
        contactInfo,
        caseNumber
      });

      return responseUtils.success(res, {
        dispute,
        message: 'Đã chuyển sang bên thứ 3'
      });
    } catch (error) {
      console.error('Escalate to third party error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Admin đưa ra quyết định cuối cùng dựa trên bên thứ 3
   * POST /api/admin/disputes/:disputeId/third-party/final-decision
   */
  async makeFinalDecision(req, res) {
    try {
      const { disputeId } = req.params;
      const { resolutionText, whoIsRight, decisionText, decision } = req.body;
      const adminId = req.user._id;

      // Nếu frontend gửi decisionText, decision hoặc không gửi whoIsRight, convert nó
      const finalWhoIsRight = whoIsRight || decisionText || decision;

      console.log('🔍 makeFinalDecision controller');
      console.log('   Request body:', req.body);
      console.log('   whoIsRight from body:', whoIsRight);
      console.log('   decisionText from body:', decisionText);
      console.log('   decision from body:', decision);
      console.log('   finalWhoIsRight:', finalWhoIsRight);

      const dispute = await thirdPartyService.adminFinalDecision(disputeId, adminId, {
        resolutionText,
        whoIsRight: finalWhoIsRight // 'COMPLAINANT_RIGHT' hoặc 'RESPONDENT_RIGHT'
      });

      return responseUtils.success(res, {
        dispute,
        message: 'Đã đưa ra quyết định cuối cùng'
      });
    } catch (error) {
      console.error('Make final decision error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Admin từ chối bằng chứng bên thứ 3 (evidence fake/không hợp lệ)
   * POST /api/admin/disputes/:disputeId/third-party/reject-evidence
   */
  async rejectThirdPartyEvidence(req, res) {
    try {
      const { disputeId } = req.params;
      const { reason } = req.body;
      const adminId = req.user._id;

      const dispute = await thirdPartyService.rejectThirdPartyEvidence(disputeId, adminId, reason);

      return responseUtils.success(res, {
        dispute,
        message: 'Đã từ chối bằng chứng bên thứ 3. Dispute quay lại trạng thái THIRD_PARTY_ESCALATED'
      });
    } catch (error) {
      console.error('Reject third party evidence error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Kiểm tra negotiation timeout
   * POST /api/admin/disputes/:disputeId/negotiation/check-timeout
   */
  async checkNegotiationTimeout(req, res) {
    try {
      const { disputeId } = req.params;

      const dispute = await negotiationService.checkNegotiationTimeout(disputeId);

      return responseUtils.success(res, {
        dispute,
        message: dispute.status === 'NEGOTIATION_FAILED' 
          ? 'Đàm phán đã hết hạn' 
          : 'Đàm phán vẫn trong thời hạn'
      });
    } catch (error) {
      console.error('Check negotiation timeout error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Cập nhật priority của dispute
   * PATCH /api/admin/disputes/:disputeId/priority
   */
  async updatePriority(req, res) {
    try {
      const { disputeId } = req.params;
      const { priority } = req.body;

      const Dispute = require('../models/Dispute');
      const dispute = await Dispute.findOne({ disputeId });
      
      if (!dispute) {
        return responseUtils.error(res, 'Dispute không tồn tại', 404);
      }

      dispute.priority = priority;
      await dispute.save();

      return responseUtils.success(res, {
        dispute,
        message: 'Cập nhật priority thành công'
      });
    } catch (error) {
      console.error('Update priority error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Assign admin cho dispute
   * PATCH /api/admin/disputes/:disputeId/assign
   */
  async assignAdmin(req, res) {
    try {
      const { disputeId } = req.params;
      const { adminId } = req.body;

      const Dispute = require('../models/Dispute');
      const dispute = await Dispute.findOne({ disputeId });
      
      if (!dispute) {
        return responseUtils.error(res, 'Dispute không tồn tại', 404);
      }

      dispute.assignedAdmin = adminId;
      await dispute.save();

      return responseUtils.success(res, {
        dispute,
        message: 'Đã assign admin'
      });
    } catch (error) {
      console.error('Assign admin error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Lấy thống kê disputes
   * GET /api/admin/disputes/statistics
   */
  async getStatistics(req, res) {
    try {
      const Dispute = require('../models/Dispute');

      const [
        total,
        open,
        inProgress,
        resolved,
        byType,
        byShipmentType
      ] = await Promise.all([
        Dispute.countDocuments(),
        Dispute.countDocuments({ status: 'OPEN' }),
        Dispute.countDocuments({ 
          status: { 
            $in: ['IN_NEGOTIATION', 'ADMIN_REVIEWING', 'RESPONDENT_REJECTED'] 
          } 
        }),
        Dispute.countDocuments({ status: 'RESOLVED' }),
        Dispute.aggregate([
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ]),
        Dispute.aggregate([
          { $group: { _id: '$shipmentType', count: { $sum: 1 } } }
        ])
      ]);

      return responseUtils.success(res, {
        statistics: {
          total,
          open,
          inProgress,
          resolved,
          byType,
          byShipmentType
        }
      });
    } catch (error) {
      console.error('Get statistics error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Admin xử lý kết quả đàm phán cuối cùng
   * POST /api/admin/disputes/:disputeId/process-final-agreement
   */
  async processFinalAgreement(req, res) {
    try {
      const { disputeId } = req.params;
      const { decision, reasoning, financialImpact } = req.body;
      const adminId = req.user._id;

      console.log('🔍 processFinalAgreement called');
      console.log('   Request body:', req.body);

      if (!decision || !reasoning) {
        return responseUtils.error(res, 'Quyết định và lý do là bắt buộc', 400);
      }

      // Support both old format (APPROVE_AGREEMENT/REJECT_AGREEMENT) 
      // and new format (COMPLAINANT_RIGHT/RESPONDENT_RIGHT)
      const isNewFormat = ['COMPLAINANT_RIGHT', 'RESPONDENT_RIGHT'].includes(decision);
      const isOldFormat = ['APPROVE_AGREEMENT', 'REJECT_AGREEMENT'].includes(decision);

      if (!isNewFormat && !isOldFormat) {
        return responseUtils.error(res, 'Quyết định không hợp lệ', 400);
      }

      let dispute;
      if (isNewFormat) {
        // New format - call adminFinalizeNegotiation with whoIsRight
        dispute = await negotiationService.adminFinalizeNegotiation(disputeId, adminId, {
          decision,
          reasoning
        });
      } else {
        // Old format - call processFinalAgreement
        dispute = await negotiationService.processFinalAgreement(disputeId, adminId, {
          decision,
          reasoning
        });
      }

      const message = isNewFormat
        ? 'Đã xử lý thỏa thuận thành công'
        : decision === 'APPROVE_AGREEMENT' 
          ? 'Đã phê duyệt thỏa thuận - Tranh chấp được giải quyết'
          : 'Đã từ chối thỏa thuận - Yêu cầu đàm phán lại';

      return responseUtils.success(res, { dispute, message });
    } catch (error) {
      console.error('Process final agreement error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Admin chia sẻ thông tin shipper và thông tin cá nhân với cả hai bên
   * POST /api/admin/disputes/:disputeId/share-shipper-info
   */
  async shareShipperInfo(req, res) {
    try {
      const { disputeId } = req.params;
      const adminId = req.user._id;

      const dispute = await thirdPartyService.shareShipperInfo(disputeId, adminId);

      return responseUtils.success(res, { 
        dispute, 
        message: 'Đã chia sẻ thông tin shipper và thông tin cá nhân cho cả hai bên' 
      });
    } catch (error) {
      console.error('Share shipper info error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Admin xử lý tranh chấp lỗi shipper
   * POST /api/admin/disputes/:disputeId/resolve-shipper-damage
   */
  async resolveShipperDamage(req, res) {
    try {
      const { disputeId } = req.params;
      const adminId = req.user._id;
      const { solution, reasoning, shipperEvidence, insuranceClaim, refundAmount, compensationAmount } = req.body;

      const dispute = await disputeService.resolveShipperDamage(disputeId, adminId, {
        solution,
        reasoning,
        shipperEvidence,
        insuranceClaim,
        refundAmount,
        compensationAmount
      });

      return responseUtils.success(res, {
        dispute,
        message: 'Đã xử lý tranh chấp lỗi shipper thành công'
      });
    } catch (error) {
      console.error('Resolve shipper damage error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }
}

module.exports = new AdminDisputeController();
