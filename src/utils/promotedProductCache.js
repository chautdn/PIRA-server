/**
 * Promoted Product Cache Utility
 * Implements fair randomization of promoted products within each tier
 * Cache expires every 2 minutes to rotate display order
 *
 * PRODUCTION DEPLOYMENT NOTE:
 * ===========================
 * This implementation uses in-memory cache which works for single-server deployments.
 *
 * For multi-server/load-balanced production deployments, consider:
 * 1. Redis-based cache (shared across all server instances)
 * 2. Database-based caching with TTL
 * 3. CDN edge caching with ESI (Edge Side Includes)
 *
 * Cache invalidation is automatically handled when:
 * - New promoted products are created
 * - Promoted products are updated or deleted
 * - Promotions are activated, deactivated, or expired
 * - PayOS payment webhooks process successfully
 *
 * Current TTL: 2 minutes (adjust based on business requirements)
 */

class PromotedProductCache {
  constructor() {
    this.cache = null;
    this.cacheTimestamp = null;
    this.CACHE_DURATION = 2 * 60 * 1000; // 2 minutes in milliseconds
  }

  /**
   * Check if cache is still valid
   */
  isValid() {
    if (!this.cache || !this.cacheTimestamp) {
      return false;
    }

    const now = Date.now();
    const age = now - this.cacheTimestamp;
    return age < this.CACHE_DURATION;
  }

  /**
   * Fisher-Yates shuffle algorithm for fair randomization
   * Every product has equal probability of being in any position
   */
  shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Randomize products within each tier
   * Maintains tier priority but randomizes order within each tier
   *
   * @param {Array} products - Array of promoted products
   * @returns {Array} - Products sorted by tier with randomized order within tiers
   */
  randomizeWithinTiers(products) {
    // Separate promoted products by tier
    const tierGroups = {};

    products.forEach((product) => {
      if (product.isPromoted && product.promotionTier) {
        const tier = product.promotionTier;
        if (!tierGroups[tier]) {
          tierGroups[tier] = [];
        }
        tierGroups[tier].push(product);
      }
    });

    // Randomize within each tier and combine
    const randomizedProducts = [];
    const tiers = Object.keys(tierGroups).sort((a, b) => parseInt(a) - parseInt(b)); // Tier 1 first

    tiers.forEach((tier) => {
      const shuffledTierProducts = this.shuffle(tierGroups[tier]);
      randomizedProducts.push(...shuffledTierProducts);
    });

    return randomizedProducts;
  }

  /**
   * Get cached randomized product IDs or generate new randomization
   *
   * @param {Array} promotedProducts - Current promoted products from database
   * @returns {Array} - Array of product IDs in randomized order
   */
  getOrGenerateOrder(promotedProducts) {
    // Check if cache is still valid
    if (this.isValid()) {
      // Using cached order
      return this.cache;
    }

    // Generate new randomized order
    const randomized = this.randomizeWithinTiers(promotedProducts);

    // Store product IDs in order
    this.cache = randomized.map((p) => p._id.toString());
    this.cacheTimestamp = Date.now();

    // Log tier distribution
    const tierCounts = {};
    randomized.forEach((p) => {
      tierCounts[p.promotionTier] = (tierCounts[p.promotionTier] || 0) + 1;
    });
    // Cache will expire in 2 minutes

    return this.cache;
  }

  /**
   * Apply cached order to products array
   * Products not in cache (new or non-promoted) are added at the end
   *
   * @param {Array} products - All products from database
   * @param {Array} cachedOrder - Array of product IDs in desired order
   * @returns {Array} - Products reordered according to cache
   */
  applyOrder(products, cachedOrder) {
    const productMap = {};
    const nonCachedProducts = [];

    // Build product map and identify non-cached products
    products.forEach((product) => {
      const id = product._id.toString();
      productMap[id] = product;

      if (!cachedOrder.includes(id)) {
        nonCachedProducts.push(product);
      }
    });

    // Build ordered array according to cache
    const orderedProducts = [];
    cachedOrder.forEach((id) => {
      if (productMap[id]) {
        orderedProducts.push(productMap[id]);
      }
    });

    // Append non-cached products at the end
    return [...orderedProducts, ...nonCachedProducts];
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clear() {
    this.cache = null;
    this.cacheTimestamp = null;
    // Cache cleared
  }

  /**
   * Get cache status information
   */
  getStatus() {
    if (!this.isValid()) {
      return { valid: false, message: 'Cache expired or empty' };
    }

    const age = Date.now() - this.cacheTimestamp;
    const remaining = this.CACHE_DURATION - age;

    return {
      valid: true,
      cachedCount: this.cache.length,
      ageSeconds: Math.floor(age / 1000),
      remainingSeconds: Math.floor(remaining / 1000)
    };
  }
}

// Singleton instance
const promotedProductCache = new PromotedProductCache();

module.exports = promotedProductCache;
