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

/** 登录（不存在自动注册） */
async function login(username, password, region = null) {
  if (!username?.trim()) throw new HttpError(400, '用户名不能为空')
  if (!password) throw new HttpError(400, '密码不能为空')

  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username.trim()])

  if (!rows.length) {
    const hash = bcrypt.hashSync(password, 10)
    const [result] = await pool.query(
      'INSERT INTO users(username, password, region) VALUES(?, ?, ?)',
      [username.trim(), hash, region]
    )
    const [newUser] = await pool.query(
      `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`,
      [result.insertId]
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

module.exports = {
  login,
  getProfile,
  getOtherProfile,
  updateProfile,
  changePassword,
  updateAvatar,
  invalidateProfile,
}
