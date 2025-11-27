const systemPromotionService = require('../services/systemPromotion.service');
const { SUCCESS, CREATED } = require('../core/success');
const { BadRequestError } = require('../core/error');

const systemPromotionController = {
  /**
   * Create a new system promotion
   * POST /api/system-promotions
   * Admin only
   */
  create: async (req, res, next) => {
    try {
      console.log('📥 [SystemPromotion Controller] Received request to create promotion');
      console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
      console.log('👤 Admin ID:', req.user?._id);

      const adminId = req.user._id;
      const promotionData = req.body;

      const promotion = await systemPromotionService.createSystemPromotion(adminId, promotionData);

      console.log('✅ [SystemPromotion Controller] Promotion created successfully:', promotion._id);

      new CREATED({
        message: 'System promotion created successfully',
        metadata: promotion
      }).send(res);
    } catch (error) {
      console.error('❌ [SystemPromotion Controller] Error creating promotion:', error.message);
      console.error('Stack:', error.stack);
      next(error);
    }
  },

  /**
   * Get all system promotions
   * GET /api/system-promotions
   * Admin only
   */
  getAll: async (req, res, next) => {
    try {
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(parseInt(req.query.limit) || 20, 100),
        status: req.query.status
      };

      const result = await systemPromotionService.getAllSystemPromotions(options);

      new SUCCESS({
        message: 'System promotions retrieved successfully',
        metadata: result
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get active system promotion
   * GET /api/system-promotions/active
   * Public endpoint
   */
  getActive: async (req, res, next) => {
    try {
      const promotion = await systemPromotionService.getActiveSystemPromotion();

      new SUCCESS({
        message: promotion ? 'Active system promotion found' : 'No active promotion',
        metadata: {
          promotions: promotion ? [promotion] : [],
          count: promotion ? 1 : 0
        }
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get system promotion by ID
   * GET /api/system-promotions/:id
   * Admin only
   */
  getById: async (req, res, next) => {
    try {
      const { id } = req.params;
      const promotion = await systemPromotionService.getSystemPromotionById(id);

      new SUCCESS({
        message: 'System promotion retrieved successfully',
        metadata: promotion
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update system promotion
   * PUT /api/system-promotions/:id
   * Admin only
   */
  update: async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminId = req.user._id;
      const updateData = req.body;

      const promotion = await systemPromotionService.updateSystemPromotion(id, adminId, updateData);

      new SUCCESS({
        message: 'System promotion updated successfully',
        metadata: promotion
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Deactivate system promotion
   * DELETE /api/system-promotions/:id
   * Admin only
   */
  deactivate: async (req, res, next) => {
    try {
      const { id } = req.params;
      const adminId = req.user._id;

      const promotion = await systemPromotionService.deactivateSystemPromotion(id, adminId);

      new SUCCESS({
        message: 'System promotion deactivated successfully',
        metadata: promotion
      }).send(res);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Calculate shipping discount for preview
   * POST /api/system-promotions/calculate-discount
   * Authenticated users
   */
  calculateDiscount: async (req, res, next) => {
    try {
      const { shippingFee, orderTotal } = req.body;

      if (!shippingFee || shippingFee < 0) {
        throw new BadRequestError('Valid shipping fee is required');
      }

      // Create a mock subOrder for calculation
      const mockSubOrder = {
        pricing: {
          shippingFee,
          subtotalRental: orderTotal || 0,
          subtotalDeposit: 0
        }
      };

      const discountResult = await systemPromotionService.calculateShippingDiscount(mockSubOrder);

      new SUCCESS({
        message: 'Discount calculated successfully',
        metadata: discountResult
      }).send(res);
    } catch (error) {
      next(error);
    }
  }
};

module.exports = systemPromotionController;
