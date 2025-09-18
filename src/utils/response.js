const responseUtils = {
  success: (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  },

  error: (res, message = 'Internal Server Error', statusCode = 500, error = null) => {
    return res.status(statusCode).json({
      success: false,
      message,
      ...(error && { error })
    });
  },

  validationError: (res, errors) => {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
};

module.exports = responseUtils;
