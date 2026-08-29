/**
 * 统一上传中间件（multer）
 * -------------------------------------------------
 * 企业级做法：按资源类型分目录存储，避免所有文件堆在 uploads 根目录：
 *   uploads/avatars/   —— 用户头像
 *   uploads/images/    —— 笔记 / 草稿 / AI 上传图片
 *   uploads/patterns/  —— 拼豆图纸预览图
 *   uploads/videos/    —— 笔记视频
 *
 * 统一生成「相对 URL」（/uploads/...），由静态资源层（express.static /
 * Nginx）对外提供；若后期接入 CDN 或独立域名，只需在网关层替换前缀。
 *
 * 防护：扩展名 + MIME 双重白名单、单文件大小上限、随机文件名防猜测。
 */
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const config = require('../config')

// 目录常量（仅本模块内使用，避免魔法字符串散落各处）
const UPLOAD_ROOT = path.join(__dirname, '../public/uploads')
const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars')
const IMAGES_DIR = path.join(UPLOAD_ROOT, 'images')
const PATTERNS_DIR = path.join(UPLOAD_ROOT, 'patterns')
const VIDEOS_DIR = path.join(UPLOAD_ROOT, 'videos')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
;[AVATAR_DIR, IMAGES_DIR, PATTERNS_DIR, VIDEOS_DIR].forEach(ensureDir)

/** 时间戳 + 随机数 + 原扩展名（小写），避免文件名可被枚举 */
const randomName = (file) =>
  `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname || '').toLowerCase()}`

const makeStorage = (dir) =>
  multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: randomName,
  })

/** 图片通用白名单：扩展名或 MIME 命中其一即可 */
const imageFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase()
  const okExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
  const okMime = config.upload.allowedImageMimes.includes(file.mimetype)
  if (okExt || okMime) return cb(null, true)
  cb(new Error('只允许上传图片文件'))
}

// 笔记/草稿/AI 图片（数组，最多 9 张，单文件上限读配置）
const imageUpload = multer({
  storage: makeStorage(IMAGES_DIR),
  limits: { fileSize: config.upload.maxFileSize * 1024 * 1024 },
  fileFilter: imageFileFilter,
})

// 头像（单文件，上限 5MB）
const avatarUpload = multer({
  storage: makeStorage(AVATAR_DIR),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
})

// 视频（单文件，上限 200MB）
const VIDEO_MIME = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/ogg': '.ogv',
  'video/quicktime': '.mov',
}
const videoUpload = multer({
  storage: makeStorage(VIDEOS_DIR),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    VIDEO_MIME[file.mimetype] ? cb(null, true) : cb(new Error('只支持 mp4/webm/ogg/mov 视频格式')),
})

// 生成稳定、可读的相对 URL
const imgUrl = (filename) => `/uploads/images/${filename}`
const avatarUrl = (filename) => `/uploads/avatars/${filename}`
const patternUrl = (filename) => `/uploads/patterns/${filename}`
const videoUrl = (filename) => `/uploads/videos/${filename}`

module.exports = {
  UPLOAD_ROOT,
  AVATAR_DIR,
  IMAGES_DIR,
  PATTERNS_DIR,
  VIDEOS_DIR,
  ensureDir,
  imageUpload,
  avatarUpload,
  videoUpload,
  imgUrl,
  avatarUrl,
  patternUrl,
  videoUrl,
}
