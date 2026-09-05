/**
 * 笔记路由（薄层：中间件 + 控制器转发）
 * 支持游标分页：GET /api/notes/list?cursor=时间戳_笔记ID&pageSize=10
 * 兼容旧版：GET /api/notes/list?page=1&pageSize=10 页码分页由 service 内联解析
 */
const express = require('express')
const router = express.Router()
const controller = require('../controllers/noteController')
const { requireAuth, optionalAuth } = require('../middleware/auth')

// 首页 Feed（游标分页，可选登录）
router.get('/list', optionalAuth, controller.getFeed)

// 关键词搜索（标题/内容/分类 模糊匹配，游标分页，可选登录）
router.get('/search', optionalAuth, controller.getSearch)

// 笔记详情（可选登录）
router.get('/detail/:id', optionalAuth, controller.getDetail)

// 分类浏览
router.get('/category/:cate', optionalAuth, controller.getByCategory)

// 我的笔记（需登录）
router.get('/mynote', requireAuth, controller.getMine)

// 作者笔记
router.get('/author/:id', optionalAuth, controller.getByAuthor)

// 发布（需登录）
router.post('/publish', requireAuth, controller.publish)

// 视频上传（需登录，返回视频 URL）
router.post('/video-upload', requireAuth, controller.uploadVideo)

// 删除（需登录）
router.post('/delete/:id', requireAuth, controller.remove)

// 隐藏（需登录，仅作者本人；隐藏后他人不可见）
router.post('/hide/:id', requireAuth, controller.hide)
// 取消隐藏（需登录，仅作者本人）
router.post('/unhide/:id', requireAuth, controller.unhide)

// 更新（需登录）
router.put('/:id', requireAuth, controller.update)

module.exports = router
