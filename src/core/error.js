class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
    this.validationErrors = [];
  }

  addError(field, message) {
    this.validationErrors.push({ field, message });
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Not authorized') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    // If message already contains "not found", use it as is
    // Otherwise, append "not found" for backward compatibility
    const finalMessage =
      message.toLowerCase().includes('not found') ||
      message.toLowerCase().includes('không tìm thấy') ||
      message.toLowerCase().includes('tìm thấy')
        ? message
        : `${message} not found`;
    super(finalMessage, 404);
    this.name = 'NotFoundError';
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500);
    this.name = 'DatabaseError';
  }
}
class BadRequest extends AppError {
  constructor(message = 'Bad Request') {
    super(message, 400);
    this.name = 'BadRequest';
  }
}

const handleError = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  }
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ForbiddenError: AuthorizationError, // Alias for backward compatibility
  NotFoundError,
  DatabaseError,
  BadRequest,
  handleError
};
