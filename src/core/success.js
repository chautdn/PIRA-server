class SuccessResponse {
  constructor(data = null, message = 'Success', statusCode = 200) {
    this.status = 'success';
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }

  send(res) {
    return res.status(this.statusCode).json({
      status: this.status,
      message: this.message,
      data: this.data
    });
  }

  static ok(res, data, message = 'Success') {
    return new SuccessResponse(data, message, 200).send(res);
  }

  static created(res, data, message = 'Created successfully') {
    return new SuccessResponse(data, message, 201).send(res);
  }

  static withPagination(res, { docs, totalDocs, limit, page, totalPages }) {
    return res.status(200).json({
      status: 'success',
      data: docs,
      pagination: {
        total: totalDocs,
        limit,
        page,
        pages: totalPages
      }
    });
  }

  static noContent(res) {
    return res.status(204).send();
  }
}

const successHandler = (req, res, next) => {
  res.success = (data, message) => SuccessResponse.ok(res, data, message);
  res.created = (data, message) => SuccessResponse.created(res, data, message);
  res.paginate = (paginationData) => SuccessResponse.withPagination(res, paginationData);
  res.noContent = () => SuccessResponse.noContent(res);
  next();
};

module.exports = {
  SuccessResponse,
  successHandler
};
