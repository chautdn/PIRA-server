const truncateHtml = require('truncate-html');

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const truncateString = (str, length = 100) => {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
};

const truncateContent = (html, length) => {
  return truncateHtml(html, length, { stripTags: false, keepHtml: true });
};

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const capitalizeFirstLetter = (string) => {
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

const removeEmptyProperties = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => {
      return value !== null && value !== undefined && value !== '';
    })
  );
};

const generateRandomString = (length = 10) => {
  return Math.random()
    .toString(36)
    .substring(2, length + 2);
};

module.exports = {
  slugify,
  formatDate,
  truncateString,
  isValidEmail,
  capitalizeFirstLetter,
  removeEmptyProperties,
  generateRandomString,
  truncateContent
};
