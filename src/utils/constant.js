const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER: 500
};

const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
};

const AUTH = {
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
  JWT_EXPIRES_IN: '24h',
  SALT_ROUNDS: 10,
  TOKEN_TYPE: 'Bearer'
};

const MESSAGES = {
  SUCCESS: 'Success',
  ERROR: 'Error occurred',
  NOT_FOUND: 'Resource not found',
  UNAUTHORIZED: 'Unauthorized access',
  INVALID_CREDENTIALS: 'Invalid credentials',
  VALIDATION_ERROR: 'Validation error'
};

const VALIDATION = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 30,
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 20,
  MAX_FILE_SIZE: 5 * 1024 * 1024 // 5MB
};

const UPLOAD = {
  ALLOWED_FORMATS: ['image/jpeg', 'image/png', 'image/gif'],
  MAX_FILES: 5,
  UPLOAD_DIR: 'uploads/'
};

const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100
};

const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'use'];

module.exports = {
  HTTP_STATUS,
  USER_ROLES,
  AUTH,
  MESSAGES,
  VALIDATION,
  UPLOAD,
  PAGINATION,
  METHODS
};
