const disputeService = require('../services/dispute.service');
const negotiationService = require('../services/negotiation.service');
const thirdPartyService = require('../services/thirdParty.service');
const responseUtils = require('../utils/response');

class DisputeController {
  /**
   * Tạo dispute mới
   * POST /api/disputes
   */
  async createDispute(req, res) {
    try {
      const {
        subOrderId,
        productId,
        productIndex,
        shipmentId,
        shipmentType,
        type,
        title,
        description,
        evidence,
        repairCost
      } = req.body;

      const complainantId = req.user._id;

      const dispute = await disputeService.createDispute({
        subOrderId,
        productId,
        productIndex,
        shipmentId,
        shipmentType,
        complainantId,
        type,
        title,
        description,
        evidence,
        repairCost
      });

      return responseUtils.success(res, {
        dispute,
        message: 'Tạo dispute thành công'
      }, 201);
    } catch (error) {
      console.error('Create dispute error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Respondent phản hồi dispute
   * POST /api/disputes/:disputeId/respond
   */
  async respondToDispute(req, res) {
    try {
      const { disputeId } = req.params;
      const { decision, reason, evidence } = req.body;
      const respondentId = req.user._id;

      const dispute = await disputeService.respondentResponse(disputeId, respondentId, {
        decision,
        reason,
        evidence
      });

      return responseUtils.success(res, {
        dispute,
        message: decision === 'ACCEPTED' 
          ? 'Đã chấp nhận dispute' 
          : 'Đã từ chối dispute, chuyển admin xử lý'
      });
    } catch (error) {
      console.error('Respond to dispute error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Phản hồi quyết định của admin
   * POST /api/disputes/:disputeId/admin-decision/respond
   */
  async respondToAdminDecision(req, res) {
    try {
      const { disputeId } = req.params;
      const { accepted } = req.body;
      const userId = req.user._id;

      const dispute = await disputeService.respondToAdminDecision(disputeId, userId, accepted);

      return responseUtils.success(res, {
        dispute,
        message: accepted 
          ? 'Đã chấp nhận quyết định của admin' 
          : 'Đã từ chối quyết định của admin'
      });
    } catch (error) {
      console.error('Respond to admin decision error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Lấy danh sách disputes của user
   * GET /api/disputes/my-disputes
   */
  async getMyDisputes(req, res) {
    try {
      const userId = req.user._id;
      const { status, shipmentType, subOrderId } = req.query;

      const disputes = await disputeService.getDisputes({
        userId,
        status,
        shipmentType,
        subOrderId
      });

      return responseUtils.success(res, { disputes });
    } catch (error) {
      console.error('Get my disputes error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Lấy chi tiết dispute
   * GET /api/disputes/:disputeId
   */
  async getDisputeDetail(req, res) {
    try {
      const { disputeId } = req.params;
      const dispute = await disputeService.getDisputeDetail(disputeId);

      return responseUtils.success(res, { dispute });
    } catch (error) {
      console.error('Get dispute detail error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Đề xuất thỏa thuận trong negotiation
   * POST /api/disputes/:disputeId/negotiation/propose
   */
  async proposeAgreement(req, res) {
    try {
      const { disputeId } = req.params;
      const { proposalText, proposalAmount } = req.body;
      const userId = req.user._id;

      const dispute = await negotiationService.proposeAgreement(disputeId, userId, {
        proposalText,
        proposalAmount
      });

      return responseUtils.success(res, {
        dispute,
        message: 'Đã đề xuất thỏa thuận'
      });
    } catch (error) {
      console.error('Propose agreement error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Phản hồi thỏa thuận
   * POST /api/disputes/:disputeId/negotiation/respond
   */
  async respondToAgreement(req, res) {
    try {
      const { disputeId } = req.params;
      const { accepted } = req.body;
      const userId = req.user._id;

      const dispute = await negotiationService.respondToAgreement(disputeId, userId, accepted);

      return responseUtils.success(res, {
        dispute,
        message: accepted 
          ? 'Đã chấp nhận thỏa thuận' 
          : 'Đã từ chối thỏa thuận'
      });
    } catch (error) {
      console.error('Respond to agreement error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Owner đưa ra quyết định cuối cùng
   * POST /api/disputes/:disputeId/negotiation/owner-decision
   */
  async submitOwnerFinalDecision(req, res) {
    try {
      const { disputeId } = req.params;
      const { decision } = req.body;
      const ownerId = req.user._id;

      if (!decision || !decision.trim()) {
        return responseUtils.error(res, 'Vui lòng nhập quyết định cuối cùng', 400);
      }

      const dispute = await negotiationService.submitOwnerFinalDecision(disputeId, ownerId, decision.trim());

      return responseUtils.success(res, {
        dispute,
        message: 'Đã đưa ra quyết định cuối cùng, chờ renter phản hồi'
      });
    } catch (error) {
      console.error('Submit owner final decision error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Renter phản hồi quyết định của owner
   * POST /api/disputes/:disputeId/negotiation/respond-owner-decision
   */
  async respondToOwnerDecision(req, res) {
    try {
      const { disputeId } = req.params;
      const { accepted } = req.body;
      const renterId = req.user._id;

      const dispute = await negotiationService.respondToOwnerDecision(disputeId, renterId, accepted);

      return responseUtils.success(res, {
        dispute,
        message: accepted 
          ? 'Đã đồng ý với quyết định của owner, gửi cho admin xử lý'
          : 'Đã từ chối quyết định của owner, chuyển cho bên thứ 3'
      });
    } catch (error) {
      console.error('Respond to owner decision error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Lấy thông tin negotiation room
   * GET /api/disputes/:disputeId/negotiation
   */
  async getNegotiationRoom(req, res) {
    try {
      const { disputeId } = req.params;
      const userId = req.user._id;

      const negotiationInfo = await negotiationService.getNegotiationRoom(disputeId, userId);

      return responseUtils.success(res, negotiationInfo);
    } catch (error) {
      console.error('Get negotiation room error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Upload bằng chứng từ bên thứ 3
   * POST /api/disputes/:disputeId/third-party/evidence
   */
  async uploadThirdPartyEvidence(req, res) {
    try {
      const { disputeId } = req.params;
      const { documents, photos, officialDecision } = req.body;
      const userId = req.user._id;

      const dispute = await thirdPartyService.uploadThirdPartyEvidence(disputeId, userId, {
        documents,
        photos,
        officialDecision
      });

      // Populate additional fields for full response
      await dispute.populate([
        { path: 'subOrder', select: 'products' },
        { path: 'thirdPartyResolution.escalatedBy', select: 'profile email' }
      ]);

      return responseUtils.success(res, {
        dispute,
        message: 'Upload bằng chứng thành công'
      });
    } catch (error) {
      console.error('Upload third party evidence error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Lấy thông tin third party (bao gồm shared data)
   * GET /api/disputes/:disputeId/third-party
   */
  async getThirdPartyInfo(req, res) {
    try {
      const { disputeId } = req.params;
      const userId = req.user._id;

      const thirdPartyInfo = await thirdPartyService.getThirdPartyInfo(disputeId, userId);

      return responseUtils.success(res, thirdPartyInfo);
    } catch (error) {
      console.error('Get third party info error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * User chuyển tranh chấp cho bên thứ 3
   * POST /api/disputes/:disputeId/escalate-third-party
   */
  async userEscalateToThirdParty(req, res) {
    try {
      const { disputeId } = req.params;
      const { reason } = req.body;
      const userId = req.user._id;

      const dispute = await negotiationService.userEscalateToThirdParty(disputeId, userId, reason);

      return responseUtils.success(res, {
        dispute,
        message: 'Đã chuyển tranh chấp cho bên thứ 3'
      });
    } catch (error) {
      console.error('User escalate to third party error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Upload bằng chứng từ bên thứ 3
   * POST /api/disputes/:disputeId/third-party/upload-evidence
   */
  async uploadThirdPartyEvidence(req, res) {
    try {
      const { disputeId } = req.params;
      const { documents, photos, officialDecision } = req.body;
      const userId = req.user._id;

      const dispute = await negotiationService.uploadThirdPartyEvidence(disputeId, userId, {
        documents,
        photos,
        officialDecision
      });

      // Populate additional fields for full response
      await dispute.populate([
        { path: 'subOrder', select: 'products' },
        { path: 'thirdPartyResolution.escalatedBy', select: 'profile email' }
      ]);

      return responseUtils.success(res, {
        dispute,
        message: 'Upload bằng chứng thành công'
      });
    } catch (error) {
      console.error('Upload third party evidence error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }

  /**
   * Admin xử lý thanh toán từ ví + tiền cọc
   * POST /api/disputes/:disputeId/admin-process-payment
   */
  async adminProcessPayment(req, res) {
    try {
      const { disputeId } = req.params;
      const adminId = req.user._id;
      const { repairCost, depositAmount, additionalRequired } = req.body;

      // Validate input
      if (!repairCost || repairCost <= 0) {
        return responseUtils.error(res, 'Chi phí sửa chữa không hợp lệ', 400);
      }

      if (depositAmount < 0) {
        return responseUtils.error(res, 'Tiền cọc không hợp lệ', 400);
      }

      const dispute = await disputeService.adminProcessPayment(disputeId, adminId, {
        repairCost,
        depositAmount,
        additionalRequired
      });

      return responseUtils.success(res, {
        dispute,
        message: 'Xử lý thanh toán thành công'
      });
    } catch (error) {
      console.error('Admin process payment error:', error);
      return responseUtils.error(res, error.message, 400);
    }
  }


}

module.exports = new DisputeController();
