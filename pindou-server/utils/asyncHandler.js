/**
 * 异步路由包装器：让 async 路由的错误自动进入全局错误中间件
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

module.exports = asyncHandler
