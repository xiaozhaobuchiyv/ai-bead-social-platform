/**
 * 意见反馈 / Bug 上报路由
 * 纯提交入口：任何人可提交（匿名也可），仅入库供管理员定期查阅，无公开列表接口。
 * 防滥用：提交频次限制 + 内容长度校验。
 */
const express = require('express')
const rateLimit = require('express-rate-limit')
const pool = require('../config/db')
const { optionalAuth } = require('../middleware/auth')
const { ok } = require('../utils/response')
const logger = require('../utils/logger')

const router = express.Router()

// 每个 IP 每小时最多 10 次提交（demo 量级足够，防脚本刷）
router.use(
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 429, msg: '提交过于频繁，请稍后再试' },
  })
)

const VALID_TYPES = ['bug', 'suggestion', 'other']

router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const type = VALID_TYPES.includes(req.body?.type) ? req.body.type : 'bug'
    const content = String(req.body?.content ?? '').trim()
    const contact = String(req.body?.contact ?? '').trim().slice(0, 100)

    if (content.length < 2 || content.length > 2000) {
      return res.status(400).json({ code: 400, msg: '反馈内容需在 2~2000 字之间' })
    }

    const [result] = await pool.query(
      'INSERT INTO feedbacks(user_id, type, content, contact, ip) VALUES(?, ?, ?, ?, ?)',
      [req.user?.id ?? null, type, content, contact || null, String(req.ip ?? '').slice(0, 45)]
    )
    ok(res, { id: result.insertId }, '反馈已提交，感谢你的支持~')
  } catch (error) {
    logger.error({ err: error }, '保存反馈失败')
    next(error)
  }
})

module.exports = router
