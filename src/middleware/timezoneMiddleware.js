const { formatVietnamTime } = require('../utils/dateUtils');

/**
 * Middleware to add Vietnam timezone information to API responses
 * This adds formatted Vietnam time fields alongside UTC timestamps
 */
const timezoneMiddleware = (req, res, next) => {
  // Store original json method
  const originalJson = res.json;

  // Override json method
  res.json = function (data) {
    if (data && typeof data === 'object') {
      // Recursively add timezone info to objects
      const addTimezoneInfo = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;

        // Handle arrays
        if (Array.isArray(obj)) {
          return obj.map((item) => addTimezoneInfo(item));
        }

        // Handle objects
        const result = { ...obj };

        // Check for common timestamp fields and add Vietnam time
        const timestampFields = [
          'createdAt',
          'updatedAt',
          'deletedAt',
          'confirmedAt',
          'deliveredAt',
          'returnedAt'
        ];

        timestampFields.forEach((field) => {
          if (result[field] && result[field] instanceof Date) {
            result[`${field}Vietnam`] = formatVietnamTime(result[field]);
          } else if (
            result[field] &&
            typeof result[field] === 'string' &&
            result[field].includes('T')
          ) {
            // Handle ISO date strings
            try {
              const date = new Date(result[field]);
              if (!isNaN(date.getTime())) {
                result[`${field}Vietnam`] = formatVietnamTime(date);
              }
            } catch (e) {
              // Ignore invalid dates
            }
          }
        });

        // Recursively process nested objects
        Object.keys(result).forEach((key) => {
          if (result[key] && typeof result[key] === 'object' && !(result[key] instanceof Date)) {
            result[key] = addTimezoneInfo(result[key]);
          }
        });

        return result;
      };

      data = addTimezoneInfo(data);
    }

    // Call original json method with modified data
    return originalJson.call(this, data);
  };

  next();
};

module.exports = timezoneMiddleware;
