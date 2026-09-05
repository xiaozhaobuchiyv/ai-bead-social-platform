/**
 * 数据库初始化脚本
 * 用法：npm run db:init
 *
 * schema.sql 采用 MySQL 客户端专属的 `DELIMITER $$` 语法来定义存储过程，
 * 而 mysql2 驱动不识别 DELIMITER。因此这里实现一个轻量 SQL 切分器：
 *   - 解析并剥离 DELIMITER 指令
 *   - 按当前分隔符（`;` 或 `$$`）切分为独立语句逐条执行
 * 这样既能保留 schema 作为唯一事实来源，又能让 init 在 Node 环境真正跑通。
 */
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const config = require('../config')

/** 把（含 DELIMITER 的）/schema.sql 切成可逐个执行的 SQL 数组 */
function splitSql(sql) {
  const statements = []
  let current = ''
  let delimiter = ';'
  const stripComment = (stmt) =>
    stmt
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('--') && l !== '')
      .join('\n')
      .trim()

  const push = () => {
    const cleaned = stripComment(current)
    if (cleaned) statements.push(cleaned)
    current = ''
  }

  for (const rawLine of sql.split('\n')) {
    const line = rawLine.trim()

    // DELIMITER 指令（MySQL 客户端专属，驱动不识别）
    const dm = line.match(/^DELIMITER\s+(\S+)/i)
    if (dm) {
      push()
      delimiter = dm[1]
      continue
    }

    current += rawLine + '\n'

    if (delimiter === ';') {
      // 普通语句：以分号结尾
      const idx = current.lastIndexOf(';')
      if (idx !== -1) {
        const stmt = current.slice(0, idx)
        current = current.slice(idx + 1)
        if (stripComment(stmt)) statements.push(stripComment(stmt))
      }
    } else {
      // 多字符分隔符（如 `$$`）：存储过程体，内部含分号不可拆分
      const idx = current.lastIndexOf(delimiter)
      if (idx !== -1) {
        const stmt = current.slice(0, idx)
        current = current.slice(idx + delimiter.length)
        if (stripComment(stmt)) statements.push(stripComment(stmt))
      }
    }
  }
  push()
  return statements
}

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8')
  const statements = splitSql(sql)

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    charset: 'utf8mb4',
    ssl: config.db.ssl,
  })

  console.log(`[db:init] 连接 ${config.db.host}，执行 ${statements.length} 条语句...`)

  try {
    for (const stmt of statements) {
      // 逐个执行，任一失败立即中止并回滚到外层（首次创建无需事务，直接中断）
      await conn.query(stmt)
    }
    console.log('[db:init] 完成：数据库、表结构与索引已就绪')
  } catch (err) {
    console.error('[db:init] 失败:', err.message)
    process.exitCode = 1
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error('[db:init] 失败:', err.message)
  process.exit(1)
})
