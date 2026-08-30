/**
 * 拼豆图纸库接口（保存 / 列表 / 详情 / 删除）
 * 图纸来源：拼小豆 AI 聊天一键转换、图纸转换页生成
 */
const express = require('express')
const jwt = require('jsonwebtoken')
const pool = require('../config/db')
const { JWT_SECRET } = require('../config/jwt')

const router = express.Router()

const getUserId = (req) => {
  const token = req.headers.token || req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET).id
  } catch {
    return null
  }
}

const normalizeDesign = (row) => ({
  id: row.id,
  sourceImage: row.source_image,
  gridWidth: row.grid_width,
  gridHeight: row.grid_height,
  gridSize: row.grid_size,
  maxColors: row.max_colors,
  pixels: row.pixels,
  palette: row.palette ? JSON.parse(row.palette) : [],
  totalPixels: row.total_pixels,
  colorCount: row.color_count,
  similarity: Number(row.similarity),
  estimatedTime: row.estimated_time,
  previewImage: row.preview_image,
  createdAt: row.created_at,
})

// 保存图纸
router.post('/save', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.json({ code: 401, msg: '请先登录' })

    const {
      sourceImage = null,
      gridWidth = 0,
      gridHeight = 0,
      gridSize = 24,
      maxColors = 0,
      pixels = '',
      palette = [],
      totalPixels = 0,
      colorCount = 0,
      similarity = 0,
      estimatedTime = '',
      previewImage = null,
    } = req.body || {}

    if (!pixels || typeof pixels !== 'string') {
      return res.json({ code: 400, msg: '图纸数据无效' })
    }
    // 防御：超大 payload 拒绝（128x128 ≈ 16k 码位，预留余量）
    if (pixels.length > 200000) {
      return res.json({ code: 400, msg: '图纸数据过大' })
    }

    const [result] = await pool.query(
      `INSERT INTO pindou_designs
        (user_id, source_image, grid_width, grid_height, grid_size, max_colors, pixels, palette,
         total_pixels, color_count, similarity, estimated_time, preview_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, sourceImage, gridWidth, gridHeight, gridSize, maxColors, pixels,
        JSON.stringify(Array.isArray(palette) ? palette : []),
        totalPixels, colorCount, similarity, estimatedTime, previewImage,
      ]
    )

    res.json({ code: 200, msg: '保存成功', data: { id: result.insertId } })
  } catch (error) {
    console.error('保存图纸失败:', error)
    res.status(500).json({ code: 500, msg: '保存失败' })
  }
})

// 我的图纸列表（分页）
router.get('/list', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.json({ code: 401, msg: '请先登录' })

    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 12))
    const offset = (page - 1) * pageSize

    const [rows] = await pool.query(
      `SELECT * FROM pindou_designs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    )
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM pindou_designs WHERE user_id = ?`,
      [userId]
    )

    res.json({
      code: 200,
      data: {
        list: rows.map(normalizeDesign),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      },
    })
  } catch (error) {
    console.error('获取图纸列表失败:', error)
    res.status(500).json({ code: 500, msg: '获取失败' })
  }
})

// 图纸详情
router.get('/detail/:id', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.json({ code: 401, msg: '请先登录' })

    const [rows] = await pool.query(
      'SELECT * FROM pindou_designs WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    )
    if (!rows.length) return res.json({ code: 404, msg: '图纸不存在' })

    res.json({ code: 200, data: normalizeDesign(rows[0]) })
  } catch (error) {
    console.error('获取图纸详情失败:', error)
    res.status(500).json({ code: 500, msg: '获取失败' })
  }
})

// 删除图纸
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req)
    if (!userId) return res.json({ code: 401, msg: '请先登录' })

    const [result] = await pool.query(
      'DELETE FROM pindou_designs WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    )
    if (result.affectedRows === 0) return res.json({ code: 404, msg: '图纸不存在或无权限删除' })
    res.json({ code: 200, msg: '删除成功' })
  } catch (error) {
    console.error('删除图纸失败:', error)
    res.status(500).json({ code: 500, msg: '删除失败' })
  }
})

module.exports = router
