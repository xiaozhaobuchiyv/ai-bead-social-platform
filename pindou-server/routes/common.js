/**
 * 通用公共接口（与业务无关的零散能力）
 * 目前仅提供「通用图片上传」：供图纸转换页等把本地图片上传到服务器，
 * 拿到 /uploads/images/xxx.png 真实地址后展示/转换，而不是在页面里内嵌 base64。
 */
const express = require('express')
const { imageUpload, imgUrl } = require('../utils/upload')
const { uploadLimiter } = require('../middleware/rateLimiter')

const router = express.Router()

// 上传图片（数组，最多 5 张，返回相对 URL 列表）
router.post('/upload-image', uploadLimiter, imageUpload.array('images', 5), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ code: 400, msg: '请选择要上传的图片' })
  }
  const images = req.files.map((file) => imgUrl(file.filename))
  res.json({ code: 200, msg: '上传成功', data: { images } })
})

module.exports = router
