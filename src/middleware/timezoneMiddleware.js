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
      // Use WeakSet to track visited objects and prevent infinite loops
      const visited = new WeakSet();

      // Recursively add timezone info to objects
      const addTimezoneInfo = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;

        // Prevent infinite loops from circular references
        if (visited.has(obj)) {
          return obj;
        }
        visited.add(obj);

        // Handle arrays
        if (Array.isArray(obj)) {
          return obj.map((item) => addTimezoneInfo(item));
        }

        // Convert Mongoose documents to plain objects
        let plainObj = obj;
        if (obj.toObject && typeof obj.toObject === 'function') {
          plainObj = obj.toObject();
        } else if (obj.toJSON && typeof obj.toJSON === 'function') {
          plainObj = obj.toJSON();
        }

        // Create a shallow copy
        const result = { ...plainObj };

        // Check for common timestamp fields and add Vietnam time
        const timestampFields = [
          'createdAt',
          'updatedAt',
          'deletedAt',
          'confirmedAt',
          'deliveredAt',
          'returnedAt',
          'autoConfirmedAt',
          'deliveryDate',
          'returnDate',
          'startDate',
          'endDate'
        ];

        timestampFields.forEach((field) => {
          if (result[field]) {
            if (result[field] instanceof Date) {
              result[`${field}Vietnam`] = formatVietnamTime(result[field]);
            } else if (
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
          }
        });

        // Recursively process nested objects (but skip already processed ones)
        Object.keys(result).forEach((key) => {
          const value = result[key];
          if (
            value &&
            typeof value === 'object' &&
            !(value instanceof Date) &&
            !visited.has(value)
          ) {
            result[key] = addTimezoneInfo(value);
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
