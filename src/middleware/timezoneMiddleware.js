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

      // Helper to check if object should be skipped
      const shouldSkipObject = (obj) => {
        if (!obj || typeof obj !== 'object') return true;

        // Skip special types
        if (
          obj instanceof Date ||
          obj instanceof RegExp ||
          obj instanceof Error ||
          obj instanceof Buffer ||
          typeof obj.constructor === 'undefined'
        ) {
          return true;
        }

        // Skip Mongoose ObjectIds
        const constructorName = obj.constructor.name;
        if (constructorName === 'ObjectId' || constructorName === 'ObjectID') {
          return true;
        }

        return false;
      };

      // Recursively add timezone info to objects
      const addTimezoneInfo = (obj) => {
        if (shouldSkipObject(obj)) return obj;

        // Prevent infinite loops from circular references
        if (visited.has(obj)) {
          return obj;
        }

        // Handle arrays
        if (Array.isArray(obj)) {
          return obj.map((item) => addTimezoneInfo(item));
        }

        visited.add(obj);

        // Convert Mongoose documents to plain objects
        let plainObj = obj;
        try {
          if (obj.toObject && typeof obj.toObject === 'function') {
            plainObj = obj.toObject();
          } else if (obj.toJSON && typeof obj.toJSON === 'function') {
            plainObj = obj.toJSON();
          }
        } catch (error) {
          // If conversion fails, use original object
          console.error('Error converting object:', error.message);
          return obj;
        }

        // Create a shallow copy - handle potential errors
        let result;
        try {
          result = { ...plainObj };
        } catch (error) {
          console.error('Error creating shallow copy:', error.message);
          return plainObj;
        }

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
          'endDate',
          'requestedAt',
          'approvedAt',
          'rejectedAt',
          'completedAt',
          'cancelledAt'
        ];

        timestampFields.forEach((field) => {
          try {
            if (result[field]) {
              if (result[field] instanceof Date) {
                result[`${field}Vietnam`] = formatVietnamTime(result[field]);
              } else if (
                typeof result[field] === 'string' &&
                result[field].includes('T') &&
                result[field].includes('Z')
              ) {
                // Handle ISO date strings (ensure they have 'Z' for UTC)
                const date = new Date(result[field]);
                if (!isNaN(date.getTime())) {
                  result[`${field}Vietnam`] = formatVietnamTime(date);
                }
              } else if (typeof result[field] === 'object' && result[field].$date) {
                // Handle MongoDB extended JSON format
                const date = new Date(result[field].$date);
                if (!isNaN(date.getTime())) {
                  result[`${field}Vietnam`] = formatVietnamTime(date);
                }
              }
            }
          } catch (error) {
            // Skip this field if there's an error
            console.error(`Error processing ${field}:`, error.message);
          }
        });

        // Recursively process nested objects (but skip already processed ones and special types)
        Object.keys(result).forEach((key) => {
          try {
            const value = result[key];
            if (
              value &&
              typeof value === 'object' &&
              !shouldSkipObject(value) &&
              !visited.has(value)
            ) {
              result[key] = addTimezoneInfo(value);
            }
          } catch (error) {
            // Skip this key if there's an error
            console.error(`Error processing key ${key}:`, error.message);
          }
        });

        return result;
      };

      try {
        data = addTimezoneInfo(data);
      } catch (error) {
        // If processing fails, log and return original data
        console.error('Error in timezone middleware:', error);
        return originalJson.call(this, data);
      }
    }

    // Call original json method with modified data
    return originalJson.call(this, data);
  };

  next();
};

module.exports = timezoneMiddleware;
