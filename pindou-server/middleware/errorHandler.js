/**
 * 全局错误处理中间件
 * 统一将异常转换为 { code, msg } 响应，并记录日志。
 */
const logger = require('../utils/logger')
const { HttpError } = require('../utils/errors')
const config = require('../config')

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // multer 文件类型错误
  if (err && err.message && /只允许|只支持|文件上传失败/.test(err.message)) {
    return res.status(400).json({ code: 400, msg: err.message })
  }

  // multer 文件大小超限
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 400, msg: `文件大小超出限制（最大 ${config.upload.maxFileSize}MB）` })
  }

  // JSON 解析失败
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 400, msg: '请求体 JSON 格式错误' })
  }

  if (err instanceof HttpError) {
    return res.status(err.httpStatus).json({ code: err.code, msg: err.message })
  }

  logger.error({ err, url: req.originalUrl, method: req.method }, 'Unhandled error')
  const msg = config.isProd ? '服务器内部错误' : (err.message || '服务器内部错误')
  return res.status(500).json({ code: 500, msg })
}

module.exports = errorHandler
