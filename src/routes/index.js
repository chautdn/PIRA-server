/**
 * @fileoverview Route Index
 * This file serves as documentation for all API routes
 *
 * Available Routes:
 * - /api/users
 *   - GET / - Get all users
 *   - POST /create - Create new user
 *
 * - /api/cart (requires authentication)
 *   - GET / - Get user cart
 *   - POST / - Add to cart
 *   - PUT / - Update cart
 *   - DELETE / - Remove from cart
 *
 * - /api/rental (requires authentication)
 *   - POST /orders - Create rental order
 *   - GET /orders - Get rental orders list
 *   - GET /orders/:orderId - Get rental order detail
 *   - PATCH /orders/:orderId/confirm - Confirm rental order (owner)
 *   - PATCH /orders/:orderId/cancel - Cancel rental order
 *   - PATCH /orders/:orderId/start - Start rental period
 *   - PATCH /orders/:orderId/return - Return product
 *   - GET /history - Get rental history
 *   - GET /contracts/:contractId - Get contract for signing
 *   - PATCH /contracts/:contractId/sign - Sign contract digitally
 *   - GET /contracts/:contractId/download - Download signed contract PDF
 *   - GET /signatures/me - Get user's saved signature
 *   - POST /orders/:orderId/payment - Process rental payment
 */

module.exports = require('./api');
