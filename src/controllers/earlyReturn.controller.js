const earlyReturnService = require('../services/earlyReturn.service');
const { SUCCESS, CREATED } = require('../core/success');
const { BadRequestError, NotFoundError, UnauthorizedError } = require('../core/error');

/**
 * Early Return Request Controller
 */
class EarlyReturnController {
  /**
   * Create early return request
   * POST /early-returns
   */
  async createRequest(req, res, next) {
    try {
      const renterId = req.user._id;
      const { subOrderId, requestedReturnDate, returnAddress, useOriginalAddress, notes } =
        req.body;

      if (!subOrderId || !requestedReturnDate) {
        throw new BadRequestError('SubOrder ID and requested return date are required');
      }

      const result = await earlyReturnService.createEarlyReturnRequest(renterId, subOrderId, {
        requestedReturnDate,
        returnAddress,
        useOriginalAddress,
        notes
      });

      new CREATED({
        message: 'Early return request created successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get renter's early return requests
   * GET /early-returns/renter
   */
  async getRenterRequests(req, res, next) {
    try {
      const renterId = req.user._id;
      const { page, limit, status } = req.query;

      const result = await earlyReturnService.getRenterRequests(renterId, {
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 20, 100),
        status
      });

      new SUCCESS({
        message: 'Renter requests retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get owner's early return requests
   * GET /early-returns/owner
   */
  async getOwnerRequests(req, res, next) {
    try {
      const ownerId = req.user._id;
      const { page, limit, status } = req.query;

      const result = await earlyReturnService.getOwnerRequests(ownerId, {
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 20, 100),
        status
      });

      new SUCCESS({
        message: 'Owner requests retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get early return request details
   * GET /early-returns/:id
   */
  async getRequestDetails(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const result = await earlyReturnService.getRequestDetails(id, userId);

      new SUCCESS({
        message: 'Request details retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Confirm return received (Owner only)
   * POST /early-returns/:id/confirm-return
   */
  async confirmReturnReceived(req, res, next) {
    try {
      const { id } = req.params;
      const ownerId = req.user._id;
      const { notes, qualityCheck } = req.body;

      const result = await earlyReturnService.confirmReturnReceived(id, ownerId, {
        notes,
        qualityCheck
      });

      new SUCCESS({
        message: 'Return confirmed and deposit refunded successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel early return request (Renter only)
   * POST /early-returns/:id/cancel
   */
  async cancelRequest(req, res, next) {
    try {
      const { id } = req.params;
      const renterId = req.user._id;
      const { reason } = req.body;

      const result = await earlyReturnService.cancelRequest(id, renterId, reason);

      new SUCCESS({
        message: 'Early return request cancelled successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create owner review for renter (Owner only)
   * POST /early-returns/:id/review
   */
  async createOwnerReview(req, res, next) {
    try {
      const { id } = req.params;
      const ownerId = req.user._id;
      const { rating, detailedRating, title, comment, photos } = req.body;

      if (!rating || !comment) {
        throw new BadRequestError('Rating and comment are required');
      }

      const result = await earlyReturnService.createOwnerReview(id, ownerId, {
        rating,
        detailedRating,
        title,
        comment,
        photos
      });

      new CREATED({
        message: 'Review created successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Auto-complete expired returns (Admin/System only)
   * POST /early-returns/auto-complete
   */
  async autoCompleteExpired(req, res, next) {
    try {
      // Check if user is admin
      if (req.user.role !== 'ADMIN') {
        throw new UnauthorizedError('Only admins can trigger auto-completion');
      }

      const result = await earlyReturnService.autoCompleteExpiredReturns();

      new SUCCESS({
        message: 'Auto-completion completed',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EarlyReturnController();
