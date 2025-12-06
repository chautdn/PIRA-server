const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/dispute.controller');
const adminDisputeController = require('../controllers/adminDispute.controller');
const { authMiddleware } = require('../middleware/auth');

// Middleware shortcuts
const authenticate = authMiddleware.verifyToken;
const requireAdmin = authMiddleware.checkUserRole(['ADMIN']);

// ========== USER ROUTES ==========

/**
 * @route   POST /api/disputes
 * @desc    Tạo dispute mới
 * @access  Private (Renter hoặc Owner)
 */
router.post('/', authenticate, disputeController.createDispute);

/**
 * @route   GET /api/disputes/my-disputes
 * @desc    Lấy danh sách disputes của user
 * @access  Private
 */
router.get('/my-disputes', authenticate, disputeController.getMyDisputes);

/**
 * @route   GET /api/disputes/:disputeId
 * @desc    Lấy chi tiết dispute
 * @access  Private
 */
router.get('/:disputeId', authenticate, disputeController.getDisputeDetail);

/**
 * @route   POST /api/disputes/:disputeId/respond
 * @desc    Respondent phản hồi dispute
 * @access  Private (Respondent)
 */
router.post('/:disputeId/respond', authenticate, disputeController.respondToDispute);

/**
 * @route   POST /api/disputes/:disputeId/admin-decision/respond
 * @desc    Phản hồi quyết định của admin
 * @access  Private (Complainant hoặc Respondent)
 */
router.post('/:disputeId/admin-decision/respond', authenticate, disputeController.respondToAdminDecision);

// ========== NEGOTIATION ROUTES ==========

/**
 * @route   GET /api/disputes/:disputeId/negotiation
 * @desc    Lấy thông tin negotiation room
 * @access  Private
 */
router.get('/:disputeId/negotiation', authenticate, disputeController.getNegotiationRoom);

/**
 * @route   POST /api/disputes/:disputeId/negotiation/propose
 * @desc    Đề xuất thỏa thuận trong negotiation
 * @access  Private (Complainant hoặc Respondent)
 */
router.post('/:disputeId/negotiation/propose', authenticate, disputeController.proposeAgreement);

/**
 * @route   POST /api/disputes/:disputeId/negotiation/respond
 * @desc    Phản hồi thỏa thuận
 * @access  Private (Complainant hoặc Respondent)
 */
router.post('/:disputeId/negotiation/respond', authenticate, disputeController.respondToAgreement);

/**
 * @route   POST /api/disputes/:disputeId/negotiation/owner-decision
 * @desc    Owner đưa ra quyết định cuối cùng (Renter tạo dispute DELIVERY)
 * @access  Private (Owner/Respondent)
 */
router.post('/:disputeId/negotiation/owner-decision', authenticate, disputeController.submitOwnerFinalDecision);

/**
 * @route   POST /api/disputes/:disputeId/negotiation/owner-dispute-decision
 * @desc    Owner đưa ra quyết định cuối cùng (Owner tạo dispute RETURN)
 * @access  Private (Owner/Complainant)
 */
router.post('/:disputeId/negotiation/owner-dispute-decision', authenticate, disputeController.submitOwnerDisputeFinalDecision);

/**
 * @route   POST /api/disputes/:disputeId/negotiation/respond-owner-decision
 * @desc    Renter phản hồi quyết định của owner
 * @access  Private (Renter)
 */
router.post('/:disputeId/negotiation/respond-owner-decision', authenticate, disputeController.respondToOwnerDecision);

/**
 * @route   POST /api/disputes/:disputeId/escalate-third-party
 * @desc    User chuyển tranh chấp cho bên thứ 3
 * @access  Private
 */
router.post('/:disputeId/escalate-third-party', authenticate, disputeController.userEscalateToThirdParty);

// ========== THIRD PARTY ROUTES ==========

/**
 * @route   GET /api/disputes/:disputeId/third-party
 * @desc    Lấy thông tin third party
 * @access  Private
 */
router.get('/:disputeId/third-party', authenticate, disputeController.getThirdPartyInfo);

/**
 * @route   POST /api/disputes/:disputeId/third-party/evidence
 * @desc    Upload bằng chứng từ bên thứ 3
 * @access  Private (Complainant hoặc Respondent)
 */
router.post('/:disputeId/third-party/evidence', authenticate, disputeController.uploadThirdPartyEvidence);

// ========== ADMIN ROUTES ==========

/**
 * @route   GET /api/disputes/admin/all
 * @desc    Lấy tất cả disputes
 * @access  Private (Admin)
 */
router.get('/admin/all', authenticate, requireAdmin, adminDisputeController.getAllDisputes);

/**
 * @route   GET /api/disputes/admin/statistics
 * @desc    Lấy thống kê disputes
 * @access  Private (Admin)
 */
router.get('/admin/statistics', authenticate, requireAdmin, adminDisputeController.getStatistics);

/**
 * @route   POST /api/disputes/:disputeId/admin/review
 * @desc    Admin xem xét và đưa ra quyết định
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/review', authenticate, requireAdmin, adminDisputeController.reviewDispute);

/**
 * @route   POST /api/disputes/:disputeId/admin/resolve-shipper-damage
 * @desc    Admin xử lý tranh chấp lỗi shipper
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/resolve-shipper-damage', authenticate, requireAdmin, adminDisputeController.resolveShipperDamage);

/**
 * @route   POST /api/disputes/:disputeId/admin/negotiation/create
 * @desc    Tạo negotiation room
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/negotiation/create', authenticate, requireAdmin, adminDisputeController.createNegotiationRoom);

/**
 * @route   POST /api/disputes/:disputeId/admin/negotiation/finalize
 * @desc    Admin chốt thỏa thuận từ negotiation
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/negotiation/finalize', authenticate, requireAdmin, adminDisputeController.finalizeNegotiation);

/**
 * @route   POST /api/disputes/:disputeId/admin/negotiation/check-timeout
 * @desc    Kiểm tra negotiation timeout
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/negotiation/check-timeout', authenticate, requireAdmin, adminDisputeController.checkNegotiationTimeout);

/**
 * @route   POST /api/disputes/:disputeId/admin/third-party/escalate
 * @desc    Chuyển dispute sang bên thứ 3
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/third-party/escalate', authenticate, requireAdmin, adminDisputeController.escalateToThirdParty);

/**
 * @route   POST /api/disputes/:disputeId/admin/process-final-agreement
 * @desc    Admin xử lý kết quả đàm phán cuối cùng
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/process-final-agreement', authenticate, requireAdmin, adminDisputeController.processFinalAgreement);

/**
 * @route   POST /api/disputes/:disputeId/admin/third-party/final-decision
 * @desc    Admin đưa ra quyết định cuối cùng từ bên thứ 3
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/third-party/final-decision', authenticate, requireAdmin, adminDisputeController.makeFinalDecision);

/**
 * @route   POST /api/disputes/:disputeId/admin/third-party/reject-evidence
 * @desc    Admin từ chối bằng chứng bên thứ 3 (fake/không hợp lệ)
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/third-party/reject-evidence', authenticate, requireAdmin, adminDisputeController.rejectThirdPartyEvidence);

/**
 * @route   POST /api/disputes/:disputeId/admin/process-final-agreement
 * @desc    Admin xử lý kết quả đàm phán cuối cùng
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/process-final-agreement', authenticate, requireAdmin, adminDisputeController.processFinalAgreement);

/**
 * @route   PATCH /api/disputes/:disputeId/admin/priority
 * @desc    Cập nhật priority
 * @access  Private (Admin)
 */
router.patch('/:disputeId/admin/priority', authenticate, requireAdmin, adminDisputeController.updatePriority);

/**
 * @route   PATCH /api/disputes/:disputeId/admin/assign
 * @desc    Assign admin
 * @access  Private (Admin)
 */
router.patch('/:disputeId/admin/assign', authenticate, requireAdmin, adminDisputeController.assignAdmin);

/**
 * @route   POST /api/disputes/:disputeId/admin/share-shipper-info
 * @desc    Admin chia sẻ thông tin shipper cho cả hai bên
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin/share-shipper-info', authenticate, requireAdmin, adminDisputeController.shareShipperInfo);

/**
 * @route   POST /api/disputes/:disputeId/admin-process-payment
 * @desc    Admin xử lý thanh toán từ ví + tiền cọc
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin-process-payment', authenticate, requireAdmin, disputeController.adminProcessPayment);

/**
 * @route   POST /api/disputes/:disputeId/admin-final-decision-owner-dispute
 * @desc    Admin quyết định cuối cùng cho owner dispute dựa trên kết quả bên thứ 3
 * @access  Private (Admin)
 */
router.post('/:disputeId/admin-final-decision-owner-dispute', authenticate, requireAdmin, disputeController.adminFinalDecisionOwnerDispute);

// ========== THIRD PARTY ROUTES ==========

/**
 * @route   POST /api/disputes/:disputeId/third-party/upload-evidence
 * @desc    Upload bằng chứng từ bên thứ 3
 * @access  Private
 */
router.post('/:disputeId/third-party/upload-evidence', authenticate, disputeController.uploadThirdPartyEvidence);

module.exports = router;
