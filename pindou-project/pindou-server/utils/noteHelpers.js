const pool = require('../config/db')

const NOTE_SELECT =
  'SELECT n.id, n.title, n.content, n.images, n.user_id, n.category, n.likes, n.collects, n.create_time, u.nickname, u.avatar FROM notes n LEFT JOIN users u ON n.user_id = u.id'

async function attachUserActions(list, userId) {
  if (!userId || !list.length) return list

  const [likeActions] = await pool.query(
    "SELECT note_id FROM actions WHERE user_id=? AND type='like'",
    [userId]
  )
  const [collectActions] = await pool.query(
    "SELECT note_id FROM actions WHERE user_id=? AND type='collection'",
    [userId]
  )
  const likedNotes = new Set(likeActions.map((a) => a.note_id))
  const collectedNotes = new Set(collectActions.map((a) => a.note_id))

  return list.map((note) => ({
    ...note,
    liked: likedNotes.has(note.id),
    collected: collectedNotes.has(note.id),
  }))
}

async function queryNotesPage({ page = 1, pageSize = 15, keyword = '' }) {
  const p = Math.max(1, parseInt(page, 10) || 1)
  const size = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 15))
  const offset = (p - 1) * size
  const q = (keyword || '').trim()

  let where = ''
  const params = []
  if (q) {
    where = ' WHERE n.title LIKE ? OR n.content LIKE ? OR n.category LIKE ? '
    const like = `%${q}%`
    params.push(like, like, like)
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM notes n${where}`,
    params
  )
  const total = countRows[0].total || 0

  const [list] = await pool.query(
    `${NOTE_SELECT}${where} ORDER BY n.create_time DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]
  )

  return {
    list,
    total,
    page: p,
    pageSize: size,
    hasMore: offset + list.length < total,
  }
}

module.exports = { attachUserActions, queryNotesPage, NOTE_SELECT }
