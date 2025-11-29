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
      const { decisionText, reasoning, shipperEvidence } = req.body;
      const adminId = req.user._id;

      const dispute = await disputeService.adminReview(disputeId, adminId, {
        decisionText,
        reasoning,
        shipperEvidence
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
      const adminId = req.user._id;

      const dispute = await negotiationService.adminFinalizeNegotiation(disputeId, adminId);

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
      const { resolutionText, financialImpact } = req.body;
      const adminId = req.user._id;

      const dispute = await thirdPartyService.adminFinalDecision(disputeId, adminId, {
        resolutionText,
        financialImpact
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
      const { decision, reasoning } = req.body;
      const adminId = req.user._id;

      if (!decision || !reasoning) {
        return responseUtils.error(res, 'Quyết định và lý do là bắt buộc', 400);
      }

      if (!['APPROVE_AGREEMENT', 'REJECT_AGREEMENT'].includes(decision)) {
        return responseUtils.error(res, 'Quyết định không hợp lệ', 400);
      }

      const dispute = await negotiationService.processFinalAgreement(disputeId, adminId, {
        decision,
        reasoning
      });

      const message = decision === 'APPROVE_AGREEMENT' 
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
}

module.exports = new AdminDisputeController();
