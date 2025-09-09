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
 */

module.exports = require('./api');
