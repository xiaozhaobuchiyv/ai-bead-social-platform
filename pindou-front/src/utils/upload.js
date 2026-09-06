/**
 * 通用图片上传工具
 * -------------------------------------------------
 * 把本地图片 / 浏览器生成的 Blob 上传到后端，拿到真实文件地址（/uploads/images/xxx.png），
 * 页面用该地址显示，从而不再在 `<img>` 里内嵌大段 base64（data:image/...）。
 */
import request from '@/utils/request'

const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

/**
 * 上传单个图片（File 或 Blob），返回相对 URL（如 /uploads/images/xxx.png）。
 * @param {File|Blob} fileOrBlob
 * @param {object} [opts] { filename } 用于给 Blob 取名（决定保存后的扩展名）
 * @returns {Promise<string>} 相对 URL
 */
export async function uploadImageFile(fileOrBlob, { filename = 'image.png' } = {}) {
  const isFile = typeof File !== 'undefined' && fileOrBlob instanceof File
  const file = isFile
    ? fileOrBlob
    : new File([fileOrBlob], filename, { type: fileOrBlob?.type || 'image/png' })

  const formData = new FormData()
  formData.append('images', file)

  // silent：失败时不触发全局 toast，由调用方自行提示，避免重复弹窗
  const res = await request.post('/common/upload-image', formData, { silent: true })
  if (res.code === 200 && res.data?.images?.length) {
    return res.data.images[0]
  }
  throw new Error(res.msg || '图片上传失败')
}

/** 把 canvas 渲染成 PNG Blob */
export function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve) => canvas.toBlob(resolve, type))
}

/** 生成带正确扩展名的文件名（供 Blob 上传时使用） */
export function makeImageFilename(prefix = 'image', type = 'image/png') {
  const ext = MIME_EXT[type] || '.png'
  return `${prefix}-${Date.now()}${ext}`
}
