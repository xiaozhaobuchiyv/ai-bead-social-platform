/**
 * 统一响应格式
 * 所有接口返回 { code, msg, data? }，前端拦截器按 code 处理。
 */
function ok(res, data = null, msg = 'success') {
  return res.json({ code: 200, msg, data })
}

function fail(res, code = 500, msg = '服务器错误', data = null) {
  const httpStatus = code >= 400 && code < 600 ? code : 500
  return res.status(httpStatus).json({ code, msg, ...(data !== null ? { data } : {}) })
}

module.exports = { ok, fail }
