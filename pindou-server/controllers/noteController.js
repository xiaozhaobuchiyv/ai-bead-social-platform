/**
 * 笔记控制器（HTTP 层）
 */
const noteService = require('../services/noteService')
const asyncHandler = require('../utils/asyncHandler')
const { ok, fail } = require('../utils/response')
const { getIpRegion } = require('../services/ipUtil')
const { imageUpload, videoUpload, imgUrl, videoUrl } = require('../utils/upload')

const parseJsonArray = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    // 尝试解析 JSON 数组；失败则视为单个路径字符串（multer 唯一同名文本字段给的是 string）
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return [trimmed]
    }
  }
  return []
}

const collectImageSources = (bodyImages, files = []) => {
  const existing = parseJsonArray(bodyImages)
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .filter(Boolean)
    .map(String)
  const uploaded = files.map((file) => imgUrl(file.filename))
  const all = [...existing, ...uploaded].filter(Boolean)
  return all.length ? JSON.stringify(all) : null
}

// ---------- 首页 Feed（游标分页） ----------
// 响应保持旧版扁平结构 { code, list, nextCursor, hasMore }，兼容现有前端
const getFeed = asyncHandler(async (req, res) => {
  const result = await noteService.listFeed({
    cursor: req.query.cursor,
    pageSize: parseInt(req.query.pageSize, 10) || 10,
    userId: req.user?.id || null,
  })
  res.json({ code: 200, list: result.list, nextCursor: result.nextCursor, hasMore: result.hasMore })
})

// ---------- 关键词搜索（标题/内容/分类 模糊匹配 + 游标分页） ----------
const getSearch = asyncHandler(async (req, res) => {
  const result = await noteService.searchNotes({
    keyword: req.query.q,
    cursor: req.query.cursor,
    pageSize: parseInt(req.query.pageSize, 10) || 10,
    userId: req.user?.id || null,
  })
  res.json({ code: 200, list: result.list, nextCursor: result.nextCursor, hasMore: result.hasMore })
})

// ---------- 笔记详情 ----------
const getDetail = asyncHandler(async (req, res) => {
  const detail = await noteService.getDetail(req.params.id, req.user?.id || null)
  res.json({ code: 200, detail })
})

// ---------- 分类浏览 ----------
const getByCategory = asyncHandler(async (req, res) => {
  const result = await noteService.listByCategory(req.params.cate, {
    page: parseInt(req.query.page, 10) || 1,
    pageSize: parseInt(req.query.pageSize, 10) || 10,
    userId: req.user?.id || null,
  })
  res.json({ code: 200, list: result.list, pagination: result.pagination })
})

// ---------- 我的笔记 ----------
const getMine = asyncHandler(async (req, res) => {
  const result = await noteService.listByUser(req.user.id, {
    page: parseInt(req.query.page, 10) || 1,
    pageSize: parseInt(req.query.pageSize, 10) || 10,
    userId: req.user.id,
  })
  res.json({ code: 200, list: result.list, pagination: result.pagination })
})

// ---------- 作者笔记 ----------
const getByAuthor = asyncHandler(async (req, res) => {
  const result = await noteService.listByUser(req.params.id, {
    page: parseInt(req.query.page, 10) || 1,
    pageSize: parseInt(req.query.pageSize, 10) || 10,
    userId: req.user?.id || null,
  })
  res.json({ code: 200, list: result.list, pagination: result.pagination })
})

// ---------- 视频上传（独立接口，返回视频 URL） ----------
const uploadVideo = (req, res, next) => {
  videoUpload.single('video')(req, res, async (err) => {
    if (err) return fail(res, 400, err.message)
    try {
      if (!req.file) return fail(res, 400, '请选择视频文件')
      res.json({ code: 200, msg: '上传成功', data: { videoUrl: videoUrl(req.file.filename) } })
    } catch (error) {
      next(error)
    }
  })
}

// ---------- 发布 ----------
const publish = (req, res, next) => {
  imageUpload.array('images', 9)(req, res, async (err) => {
    if (err) return fail(res, 400, `文件上传失败: ${err.message}`)
    try {
      const { title, content, category, video } = req.body
      if (!title?.trim()) return fail(res, 400, '标题不能为空')
      if (!content?.trim()) return fail(res, 400, '内容不能为空')

      const imagesJson = collectImageSources(req.body.images, req.files)
      const region = await getIpRegion(null, req)
      const noteId = await noteService.publish({
        userId: req.user.id,
        title: title.trim(),
        content: content.trim(),
        category,
        imagesJson,
        video,
        region,
      })
      ok(res, { id: noteId }, '发布成功')
    } catch (error) {
      next(error)
    }
  })
}

// ---------- 删除 ----------
const remove = asyncHandler(async (req, res) => {
  await noteService.remove(req.params.id, req.user.id)
  ok(res, null, '删除成功')
})

// ---------- 隐藏 / 取消隐藏（仅作者本人；隐藏后他人不可见，自己仍可见） ----------
const hide = asyncHandler(async (req, res) => {
  await noteService.setHidden(req.params.id, req.user.id, true)
  ok(res, null, '已隐藏，仅自己可见')
})

const unhide = asyncHandler(async (req, res) => {
  await noteService.setHidden(req.params.id, req.user.id, false)
  ok(res, null, '已取消隐藏')
})

// ---------- 更新 ----------
const update = (req, res, next) => {
  imageUpload.array('images', 9)(req, res, async (err) => {
    if (err) return fail(res, 400, `文件上传失败: ${err.message}`)
    try {
      const { title, content, category, images, video } = req.body
      const existingImages = parseJsonArray(images)
      const uploadedImages = req.files?.length ? req.files.map((file) => imgUrl(file.filename)) : []
      const mergedImages = JSON.stringify([...existingImages, ...uploadedImages])

      await noteService.update(req.params.id, req.user.id, {
        title: title?.trim(),
        content: content?.trim(),
        category,
        imagesJson: mergedImages,
        video,
      })
      ok(res, null, '修改成功')
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { getFeed, getSearch, getDetail, getByCategory, getMine, getByAuthor, publish, remove, hide, unhide, update, uploadVideo }
