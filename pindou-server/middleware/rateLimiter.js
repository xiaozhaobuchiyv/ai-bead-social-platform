/**
 * 接口限流中间件（express-rate-limit）
 * - 全局默认：每 IP 每 15 分钟 1000 次，防止滥用
 * - 严格策略：AI 相关接口（调用外部大模型，成本高）每 IP 每 1 分钟 20 次
 */
const rateLimit = require('express-rate-limit')

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { code: 429, msg: '请求过于频繁，请稍后再试' },
})

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { code: 429, msg: 'AI 请求过于频繁，请稍后再试' },
})

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { code: 429, msg: '上传过于频繁，请稍后再试' },
})

module.exports = { globalLimiter, aiLimiter, uploadLimiter }
