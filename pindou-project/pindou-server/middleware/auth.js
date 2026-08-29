/**
 * 认证中间件
 *   requireAuth   —— 必须登录，未登录返回 401
 *   optionalAuth  —— 可选登录，解析到 req.user 或 null（公开接口展示个性化状态用）
 *
 * 兼容两种 token 传递方式：header.token / header.authorization: Bearer xxx
 */
const jwt = require('jsonwebtoken')
const config = require('../config')

const extractToken = (req) => {
  const header = req.headers.token || req.headers.authorization
  if (!header) return null
  return header.startsWith('Bearer ') ? header.slice(7) : header
}

const resolveUser = (req) => {
  const token = extractToken(req)
  if (!token) return null
  try {
    return jwt.verify(token, config.jwt.secret)
  } catch {
    return null
  }
}

function requireAuth(req, res, next) {
  const user = resolveUser(req)
  if (!user) {
    return res.status(401).json({ code: 401, msg: '请先登录' })
  }
  req.user = { id: user.id }
  next()
}

function optionalAuth(req, res, next) {
  const user = resolveUser(req)
  req.user = user ? { id: user.id } : null
  next()
}

module.exports = { requireAuth, optionalAuth, extractToken, resolveUser }
