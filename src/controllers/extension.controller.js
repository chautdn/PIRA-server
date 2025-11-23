const ExtensionService = require('../services/extension.service');
const { SuccessResponse } = require('../core/success');
const { BadRequest, NotFoundError } = require('../core/error');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

class ExtensionController {
  /**
   * Renter tạo yêu cầu gia hạn thuê
   * POST /api/extensions/request
   */
  requestExtension = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { subOrderId, newEndDate, extensionReason, paymentMethod } = req.body;

    console.log('📥 POST /api/extensions/request');
    console.log('👤 User ID:', userId);
    console.log('📋 Request data:', { subOrderId, newEndDate, extensionReason, paymentMethod });

    if (!subOrderId || !newEndDate) {
      throw new BadRequest('SubOrder ID và ngày kết thúc mới là bắt buộc');
    }

    const extensionRequest = await ExtensionService.requestExtension(
      subOrderId,
      userId,
      {
        newEndDate,
        extensionReason,
        paymentMethod: paymentMethod || 'WALLET'
      }
    );

    return new SuccessResponse({
      message: 'Yêu cầu gia hạn thuê đã được gửi',
      metadata: {
        extensionRequest
      }
    }).send(res);
  });

  /**
   * Owner xem danh sách yêu cầu gia hạn
   * GET /api/extensions/owner-requests
   */
  getOwnerExtensionRequests = asyncHandler(async (req, res) => {
    const ownerId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    console.log('📥 GET /api/extensions/owner-requests');
    console.log('👤 Owner ID:', ownerId);

    const result = await ExtensionService.getOwnerExtensionRequests(ownerId, {
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return new SuccessResponse({
      message: 'Lấy danh sách yêu cầu gia hạn thành công',
      metadata: result
    }).send(res);
  });

  /**
   * Owner xem chi tiết yêu cầu gia hạn
   * GET /api/extensions/:requestId
   */
  getExtensionRequestDetail = asyncHandler(async (req, res) => {
    const ownerId = req.user.id;
    const { requestId } = req.params;

    console.log('📥 GET /api/extensions/:requestId');
    console.log('👤 Owner ID:', ownerId);
    console.log('📋 Request ID:', requestId);

    const extensionRequest = await ExtensionService.getExtensionRequestDetail(
      requestId,
      ownerId
    );

    return new SuccessResponse({
      message: 'Lấy chi tiết yêu cầu gia hạn thành công',
      metadata: {
        extensionRequest
      }
    }).send(res);
  });

  /**
   * Owner chấp nhận yêu cầu gia hạn
   * PUT /api/extensions/:requestId/approve
   */
  approveExtension = asyncHandler(async (req, res) => {
    const ownerId = req.user.id;
    const { requestId } = req.params;

    console.log('📥 PUT /api/extensions/:requestId/approve');
    console.log('👤 Owner ID:', ownerId);
    console.log('📋 Request ID:', requestId);

    const extensionRequest = await ExtensionService.approveExtension(
      requestId,
      ownerId
    );

    return new SuccessResponse({
      message: 'Chấp nhận yêu cầu gia hạn thành công',
      metadata: {
        extensionRequest
      }
    }).send(res);
  });

  /**
   * Owner từ chối yêu cầu gia hạn
   * PUT /api/extensions/:requestId/reject
   */
  rejectExtension = asyncHandler(async (req, res) => {
    const ownerId = req.user.id;
    const { requestId } = req.params;
    const { rejectionReason, notes } = req.body;

    console.log('📥 PUT /api/extensions/:requestId/reject');
    console.log('👤 Owner ID:', ownerId);
    console.log('📋 Rejection data:', { rejectionReason, notes });

    if (!rejectionReason) {
      throw new BadRequest('Lý do từ chối là bắt buộc');
    }

    const extensionRequest = await ExtensionService.rejectExtension(
      requestId,
      ownerId,
      { rejectionReason, notes }
    );

    return new SuccessResponse({
      message: 'Từ chối yêu cầu gia hạn thành công',
      metadata: {
        extensionRequest
      }
    }).send(res);
  });

  /**
   * Renter hủy yêu cầu gia hạn
   * PUT /api/extensions/:requestId/cancel
   */
  cancelExtension = asyncHandler(async (req, res) => {
    const renterId = req.user.id;
    const { requestId } = req.params;

    console.log('📥 PUT /api/extensions/:requestId/cancel');
    console.log('👤 Renter ID:', renterId);

    const extensionRequest = await ExtensionService.cancelExtension(
      requestId,
      renterId
    );

    return new SuccessResponse({
      message: 'Hủy yêu cầu gia hạn thành công',
      metadata: {
        extensionRequest
      }
    }).send(res);
  });

  /**
   * Renter xem danh sách yêu cầu gia hạn của mình
   * GET /api/extensions/renter-requests
   */
  getRenterExtensionRequests = asyncHandler(async (req, res) => {
    const renterId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    console.log('📥 GET /api/extensions/renter-requests');
    console.log('👤 Renter ID:', renterId);

    const result = await ExtensionService.getRenterExtensionRequests(renterId, {
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return new SuccessResponse({
      message: 'Lấy danh sách yêu cầu gia hạn thành công',
      metadata: result
    }).send(res);
  });
}

module.exports = new ExtensionController();

module.exports = new ExtensionController();
