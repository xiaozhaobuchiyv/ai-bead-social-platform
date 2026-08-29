/**
 * 笔记业务服务层
 * - 首页 Feed：游标分页（create_time, id 稳定排序）+ 匿名首页缓存
 * - 评论数：LEFT JOIN 聚合一次取回，替代每行子查询（消除 N+1）
 * - 写操作主动失效 feed 缓存
 */
const pool = require('../config/db')
const { cache } = require('../utils/cache')
const { HttpError } = require('../utils/errors')
const { parseCursor, buildCursor } = require('../utils/pagination')

const NOTE_SELECT = `
  SELECT n.id, n.title, n.content, n.images, n.video, n.user_id, n.category,
         n.likes, n.collects, n.region, n.create_time,
         COUNT(c.id) AS comment_count,
         u.nickname, u.avatar
  FROM notes n
  LEFT JOIN users u ON n.user_id = u.id
  LEFT JOIN comments c ON c.note_id = n.id
`

const GROUP_BY = 'GROUP BY n.id, n.title, n.content, n.images, n.video, n.user_id, n.category, n.likes, n.collects, n.region, n.create_time, u.nickname, u.avatar'

const normalizeNote = (note) => ({
  ...note,
  collections: Number(note.collects || 0),
  comment_count: Number(note.comment_count || 0),
})

const applyActionFlags = (notes, liked = new Set(), collected = new Set()) =>
  notes.map((note) => ({ ...note, liked: liked.has(note.id), collected: collected.has(note.id) }))

/** 查询用户对一批笔记的动作状态 */
async function getUserActionSets(userId, noteIds) {
  if (!userId || !noteIds.length) return { liked: new Set(), collected: new Set() }
  const placeholders = noteIds.map(() => '?').join(',')
  const [rows] = await pool.query(
    `SELECT note_id, type FROM actions WHERE user_id = ? AND note_id IN (${placeholders})`,
    [userId, ...noteIds]
  )
  const liked = new Set()
  const collected = new Set()
  rows.forEach((row) => (row.type === 'like' ? liked.add(row.note_id) : collected.add(row.note_id)))
  return { liked, collected }
}

/** 游标时间戳(ms) → MySQL DATETIME 字符串 */
const toDateTime = (ms) => {
  const d = new Date(Number(ms))
  if (Number.isNaN(d.getTime())) return null
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 首页 Feed（游标分页）
 * @param {object} opts { cursor, pageSize, userId }
 */
async function listFeed({ cursor, pageSize = 10, userId = null } = {}) {
  const { cursorTime, cursorId } = parseCursor({ cursor, pageSize })
  const cursorDateTime = cursorTime ? toDateTime(cursorTime) : null

  // 匿名首页第一页命中缓存（高 QPS 场景降低 DB 压力）
  const cacheKey = `feed:v1:${pageSize}`
  if (!userId && !cursorDateTime) {
    const cached = await cache.get(cacheKey)
    if (cached) return cached
  }

  const params = []
  let where = ''
  if (cursorDateTime && cursorId) {
    where = 'WHERE (n.create_time < ? OR (n.create_time = ? AND n.id < ?))'
    params.push(cursorDateTime, cursorDateTime, cursorId)
  } else if (cursorId) {
    where = 'WHERE n.id < ?'
    params.push(cursorId)
  }

  const [rows] = await pool.query(
    `${NOTE_SELECT} ${where} ${GROUP_BY} ORDER BY n.create_time DESC, n.id DESC LIMIT ?`,
    [...params, pageSize + 1] // 多取一条判断是否还有下一页
  )

  const hasMore = rows.length > pageSize
  const pageRows = rows.slice(0, pageSize)
  const nextCursor = hasMore ? buildCursor(pageRows[pageRows.length - 1]) : null

  const { liked, collected } = await getUserActionSets(userId, pageRows.map((r) => r.id))
  const list = applyActionFlags(pageRows.map(normalizeNote), liked, collected)

  const result = { list, nextCursor, hasMore }
  if (!userId && !cursorDateTime) {
    await cache.set(cacheKey, result, 30 * 1000) // 匿名首页 30s TTL
  }
  return result
}

/** 笔记详情 */
async function getDetail(noteId, userId = null) {
  const [rows] = await pool.query(
    `${NOTE_SELECT} WHERE n.id = ? ${GROUP_BY}`,
    [noteId]
  )
  if (!rows.length) throw new HttpError(404, '笔记不存在')
  const detail = normalizeNote(rows[0])
  const { liked, collected } = await getUserActionSets(userId, [detail.id])
  return { ...detail, liked: liked.has(detail.id), collected: collected.has(detail.id) }
}

/** 分类浏览（分页） */
async function listByCategory(category, { page = 1, pageSize = 10, userId = null } = {}) {
  const offset = (page - 1) * pageSize
  const [rows] = await pool.query(
    `${NOTE_SELECT} WHERE n.category = ? ${GROUP_BY} ORDER BY n.create_time DESC, n.id DESC LIMIT ? OFFSET ?`,
    [category, pageSize, offset]
  )
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM notes WHERE category = ?', [category])
  const { liked, collected } = await getUserActionSets(userId, rows.map((r) => r.id))
  return {
    list: applyActionFlags(rows.map(normalizeNote), liked, collected),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

/** 我的笔记 / 作者笔记（分页） */
async function listByUser(ownerId, { page = 1, pageSize = 10, userId = null } = {}) {
  const offset = (page - 1) * pageSize
  const [rows] = await pool.query(
    `${NOTE_SELECT} WHERE n.user_id = ? ${GROUP_BY} ORDER BY n.create_time DESC, n.id DESC LIMIT ? OFFSET ?`,
    [ownerId, pageSize, offset]
  )
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM notes WHERE user_id = ?', [ownerId])
  const { liked, collected } = await getUserActionSets(userId, rows.map((r) => r.id))
  return {
    list: applyActionFlags(rows.map(normalizeNote), liked, collected),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

/** 发布笔记 */
async function publish({ userId, title, content, category, imagesJson, video, region }) {
  const [result] = await pool.query(
    'INSERT INTO notes(title, content, images, video, user_id, category, region) VALUES(?, ?, ?, ?, ?, ?, ?)',
    [title, content, imagesJson, video || null, userId, category || '其他', region || null]
  )
  await cache.delByPrefix('feed:v1:')
  return result.insertId
}

/** 删除笔记（仅作者本人） */
async function remove(noteId, userId) {
  const [result] = await pool.query('DELETE FROM notes WHERE id = ? AND user_id = ?', [noteId, userId])
  if (result.affectedRows === 0) throw new HttpError(404, '笔记不存在或无权限删除')
  await cache.delByPrefix('feed:v1:')
}

/** 更新笔记（仅作者本人） */
async function update(noteId, userId, { title, content, category, imagesJson, video }) {
  const [result] = await pool.query(
    'UPDATE notes SET title = ?, content = ?, category = ?, images = ?, video = ? WHERE id = ? AND user_id = ?',
    [title, content, category || '其他', imagesJson, video || null, noteId, userId]
  )
  if (result.affectedRows === 0) throw new HttpError(404, '笔记不存在或无权限修改')
  await cache.delByPrefix('feed:v1:')
}

module.exports = {
  listFeed,
  getDetail,
  listByCategory,
  listByUser,
  publish,
  remove,
  update,
}
