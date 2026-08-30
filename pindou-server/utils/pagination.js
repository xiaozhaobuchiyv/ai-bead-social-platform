/**
 * 分页工具
 *  - page/pageSize 页码分页（个人列表等场景）
 *  - cursor 游标分页（首页 feed，基于 create_time+id 稳定排序）
 */
const parsePage = (query, { defaultSize = 10, maxSize = 50 } = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/**
 * 解析游标：兼容两种输入
 *   - cursor=1720000000000_20（时间戳_笔记ID）
 *   - cursor=20（仅笔记ID）
 */
const parseCursor = (query, { defaultSize = 10, maxSize = 50 } = {}) => {
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(query.pageSize, 10) || defaultSize))
  let cursorTime = null
  let cursorId = null
  if (query.cursor) {
    const parts = String(query.cursor).split('_')
    cursorId = parseInt(parts[parts.length - 1], 10) || null
    cursorTime = parts.length > 1 ? String(parts[0]) : null
  }
  return { pageSize, cursorTime, cursorId }
}

/** 生成下一页游标 */
const buildCursor = (row) => {
  if (!row) return null
  const time = row.create_time ? new Date(row.create_time).getTime() : Date.now()
  return `${time}_${row.id}`
}

module.exports = { parsePage, parseCursor, buildCursor }
