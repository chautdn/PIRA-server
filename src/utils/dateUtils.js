const moment = require('moment-timezone');

// Vietnam timezone
const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Convert UTC date to Vietnam time
 * @param {Date|String} utcDate - UTC date
 * @returns {Date} Date in Vietnam timezone
 */
const toVietnamTime = (utcDate) => {
  if (!utcDate) return null;
  return moment.utc(utcDate).tz(VIETNAM_TIMEZONE).toDate();
};

/**
 * Convert Vietnam time to UTC
 * @param {Date|String} vietnamDate - Date in Vietnam timezone
 * @returns {Date} Date in UTC
 */
const toUTC = (vietnamDate) => {
  if (!vietnamDate) return null;
  return moment.tz(vietnamDate, VIETNAM_TIMEZONE).utc().toDate();
};

/**
 * Format date to Vietnam timezone string
 * @param {Date|String} date - Date to format
 * @param {String} format - Moment.js format string (default: 'YYYY-MM-DD HH:mm:ss')
 * @returns {String} Formatted date string
 */
const formatVietnamTime = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!date) return null;
  return moment.utc(date).tz(VIETNAM_TIMEZONE).format(format);
};

/**
 * Get current Vietnam time
 * @returns {Date} Current date in Vietnam timezone
 */
const nowInVietnam = () => {
  return moment().tz(VIETNAM_TIMEZONE).toDate();
};

/**
 * Add timezone info to an object's date fields
 * @param {Object} obj - Object containing date fields
 * @param {Array} dateFields - Array of field names that contain dates
 * @returns {Object} Object with timezone-aware date fields
 */
const addTimezoneToObject = (obj, dateFields = ['createdAt', 'updatedAt']) => {
  if (!obj) return obj;

  const result = { ...obj };

  dateFields.forEach((field) => {
    if (result[field]) {
      result[`${field}Vietnam`] = formatVietnamTime(result[field]);
    }
  });

  return result;
};

module.exports = {
  toVietnamTime,
  toUTC,
  formatVietnamTime,
  nowInVietnam,
  addTimezoneToObject,
  VIETNAM_TIMEZONE
};
