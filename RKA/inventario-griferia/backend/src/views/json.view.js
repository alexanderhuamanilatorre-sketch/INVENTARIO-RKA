class JsonView {
  static send(res, statusCode, data) {
    return res.status(statusCode).json(data);
  }
}

module.exports = JsonView;
