/**
 * 业务异常基类：携带 HTTP 状态码与业务码
 */
class HttpError extends Error {
  constructor(code, message, httpStatus) {
    super(message)
    this.name = 'HttpError'
    this.code = code || 500
    this.httpStatus = httpStatus || (code >= 400 && code < 600 ? code : 500)
  }
}

module.exports = { HttpError }
