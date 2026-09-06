/**
 * 用户业务服务层
 */
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('../config/db')
const config = require('../config')
const { HttpError } = require('../utils/errors')
const { cache } = require('../utils/cache')

const PUBLIC_FIELDS = 'id, username, nickname, avatar, signature, mobile, region, create_time'

// 账号仅允许大陆手机号：1 开头，第二位 3-9，共 11 位（前后端保持一致）
const PHONE_REG = /^1[3-9]\d{9}$/

/** 登录（不存在自动注册） */
async function login(username, password, region = null) {
  const name = String(username ?? '').trim()
  if (!name) throw new HttpError(400, '请输入手机号')
  if (!PHONE_REG.test(name)) throw new HttpError(400, '账号需为 11 位手机号（1 开头，第二位 3-9）')
  if (!password) throw new HttpError(400, '密码不能为空')

  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [name])

  if (!rows.length) {
    const hash = bcrypt.hashSync(password, 10)
    let insertId
    try {
      const [result] = await pool.query(
        'INSERT INTO users(username, password, region) VALUES(?, ?, ?)',
        [name, hash, region]
      )
      insertId = result.insertId
    } catch (error) {
      // 数据库唯一索引兜底：并发下重复注册同一手机号
      if (error?.code === 'ER_DUP_ENTRY') throw new HttpError(400, '该手机号已注册，请直接登录')
      throw error
    }
    const [newUser] = await pool.query(
      `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`,
      [insertId]
    )
    const user = newUser[0]
    const token = signToken(user.id, user.username)
    return { token, user, isNew: true }
  }

  const user = rows[0]
  if (!bcrypt.compareSync(password, user.password)) {
    throw new HttpError(400, '密码错误')
  }
  const token = signToken(user.id, user.username)
  const safeUser = stripPassword(user)
  return { token, user: safeUser, isNew: false }
}

function signToken(userId, username) {
  const payload = { id: userId }
  if (username) payload.username = username // 供拼小豆白名单(AI_ALLOWED_USERS)按用户名匹配
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn })
}

function stripPassword(user) {
  const { password, ...rest } = user
  return rest
}

/** 获取当前用户信息（带 30s 缓存，资料修改后主动失效） */
async function getProfile(userId) {
  const cacheKey = `user:profile:${userId}`
  const cached = await cache.get(cacheKey)
  if (cached) return cached

  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`,
    [userId]
  )
  if (!rows.length) throw new HttpError(404, '用户不存在')
  await cache.set(cacheKey, rows[0], 30 * 1000)
  return rows[0]
}

async function invalidateProfile(userId) {
  await cache.del(`user:profile:${userId}`)
}

/** 获取他人资料（含关注状态与统计） */
async function getOtherProfile(targetUserId, currentUserId = null) {
  const [userRows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`,
    [targetUserId]
  )
  if (!userRows.length) throw new HttpError(404, '用户不存在')
  const user = userRows[0]

  let isFollowing = false
  if (currentUserId && String(currentUserId) !== String(targetUserId)) {
    const [follow] = await pool.query(
      'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ?',
      [currentUserId, targetUserId]
    )
    isFollowing = follow.length > 0
  }

  const [[worksRows]] = await pool.query('SELECT COUNT(*) AS count FROM notes WHERE user_id = ?', [targetUserId])
  const [[likesRows]] = await pool.query('SELECT COALESCE(SUM(likes), 0) AS count FROM notes WHERE user_id = ?', [targetUserId])
  const [[followersRows]] = await pool.query('SELECT COUNT(*) AS count FROM follows WHERE followee_id = ?', [targetUserId])
  const [[followingRows]] = await pool.query('SELECT COUNT(*) AS count FROM follows WHERE follower_id = ?', [targetUserId])

  return {
    user,
    isFollowing,
    works: worksRows.count,
    likes: Number(likesRows.count) || 0,
    followers: followersRows.count,
    following: followingRows.count,
  }
}

/** 修改资料 */
async function updateProfile(userId, fields) {
  const allowed = ['nickname', 'avatar', 'mobile', 'signature']
  const updates = []
  const params = []
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`)
      params.push(fields[key])
    }
  }
  if (!updates.length) throw new HttpError(400, '没有需要修改的字段')
  params.push(userId)
  await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
  await invalidateProfile(userId)

  const [rows] = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`, [userId])
  return rows[0]
}

/** 修改密码 */
async function changePassword(userId, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) throw new HttpError(400, '请输入原密码和新密码')
  if (newPassword.length < 6) throw new HttpError(400, '新密码至少 6 位')

  const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [userId])
  if (!rows.length) throw new HttpError(404, '用户不存在')
  if (!bcrypt.compareSync(oldPassword, rows[0].password)) throw new HttpError(400, '原密码错误')

  const hash = bcrypt.hashSync(newPassword, 10)
  await pool.query('UPDATE users SET password = ? WHERE id = ?', [hash, userId])
}

/** 更新头像（返回头像 URL） */
async function updateAvatar(userId, filename) {
  const avatarUrl = `/uploads/avatars/${filename}`
  await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatarUrl, userId])
  await invalidateProfile(userId)
  return avatarUrl
}

const assertPhone = (phone) => {
  const p = String(phone ?? '').trim()
  if (!PHONE_REG.test(p)) throw new HttpError(400, '账号需为 11 位手机号（1 开头，第二位 3-9）')
  return p
}

/** 发送找回密码验证码：仅对已注册手机号；非生产环境直接把验证码返回（便于演示/自测） */
async function sendResetCode(phone) {
  const p = assertPhone(phone)
  const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [p])
  if (!rows.length) throw new HttpError(400, '该手机号尚未注册，请先登录注册')

  const code = String(Math.floor(100000 + Math.random() * 900000))
  await pool.query('DELETE FROM password_reset_codes WHERE phone = ?', [p])
  // 过期时间用数据库本地时间的 NOW()+5min 计算，避免 JS(UTC) 与 MySQL 时区不一致
  await pool.query(
    'INSERT INTO password_reset_codes(phone, code, expires_at) VALUES(?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))',
    [p, code]
  )

  // 生产环境：接入短信服务（腾讯云 SMS）在此处调用，并把验证码通过短信下发。
  // 开发环境直接返回验证码，方便本地演示与联调。
  if (config.env !== 'production') return { devCode: code }
  return { devCode: null }
}

/** 校验验证码并重置密码 */
async function resetPassword(phone, code, newPassword) {
  const p = assertPhone(phone)
  const nc = String(code ?? '').trim()
  if (!nc) throw new HttpError(400, '请输入验证码')
  const np = String(newPassword ?? '')
  if (np.length < 6) throw new HttpError(400, '新密码至少 6 位')

  const [rows] = await pool.query(
    `SELECT id, code FROM password_reset_codes
     WHERE phone = ? AND used = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [p]
  )
  if (!rows.length) throw new HttpError(400, '验证码无效或已过期，请重新获取')
  if (rows[0].code !== nc) throw new HttpError(400, '验证码错误')

  const hash = bcrypt.hashSync(np, 10)
  await pool.query('UPDATE users SET password = ? WHERE username = ?', [hash, p])
  await pool.query('UPDATE password_reset_codes SET used = 1 WHERE id = ?', [rows[0].id])
  await pool.query('DELETE FROM password_reset_codes WHERE phone = ?', [p])
}

module.exports = {
  login,
  getProfile,
  getOtherProfile,
  updateProfile,
  changePassword,
  updateAvatar,
  invalidateProfile,
  sendResetCode,
  resetPassword,
}
