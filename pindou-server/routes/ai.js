/**
 * 拼小豆 AI 路由（薄层控制器）
 * 模型调用与持久化逻辑在 services/aiService.js
 * 服务端图纸转换在 services/pindouService.js
 */
const express = require('express')
const path = require('path')
const fs = require('fs/promises')
const axios = require('axios')

const config = require('../config')
const pool = require('../config/db')
const aiService = require('../services/aiService')
const pindouService = require('../services/pindouService')
const { optionalAuth } = require('../middleware/auth')
const { aiLimiter, uploadLimiter } = require('../middleware/rateLimiter')
const validate = require('../middleware/validate')
const logger = require('../utils/logger')
const { imageUpload, patternUrl, PATTERNS_DIR } = require('../utils/upload')

const poolQuery = (sql, params) => pool.query(sql, params)

const router = express.Router()
router.use(aiLimiter) // AI 路由整体限流

const getPublicBaseUrl = (req) => {
  const envBaseUrl = process.env.PUBLIC_BASE_URL || process.env.SERVICE_BASE_URL
  if (envBaseUrl) return envBaseUrl.replace(/\/$/, '')
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.get('host')
  return `${protocol}://${host}`.replace(/\/$/, '')
}

const assertAiConfigured = (req, res, next) => {
  if (!config.ai.apiKey || !config.ai.chatModel) {
    return res.status(500).json({ code: 500, msg: '请先在后端配置火山方舟 API 信息' })
  }
  next()
}

// ---- 拼小豆访问白名单（AI_ALLOWED_USERS：逗号分隔的用户名或用户ID） ----
// 白名单为空：不限（配 key 即开放）；非空：仅白名单账号可用（游客/他人返回 403）
const isAiAllowedUser = (user) => {
  const list = config.ai.allowedUsers
  if (!list.length) return true // 未配置白名单 = 不限
  if (!user) return false
  const name = String(user.username || '')
  const id = user.id != null ? String(user.id) : ''
  return list.some((token) => token === name || token === id)
}

const aiAccessGated = () => config.ai.allowedUsers.length > 0

// 需登录的模型调用路由守卫：白名单开启且当前用户不在名单内时拒绝（避免绕过前端直接调用产生费用）
const assertAiAllowed = (req, res, next) => {
  if (isAiAllowedUser(req.user)) return next()
  return res.status(403).json({
    code: 403,
    msg: aiAccessGated() && !req.user ? '拼小豆为内部功能，请先登录后使用' : '该账号暂未开通拼小豆使用权限',
  })
}

const normalizeClientMessage = (item) => ({
  role: item?.role || 'assistant',
  content: item?.content || '',
  imageUrl: item?.imageUrl || item?.image_url || null,
  imageUrls: Array.isArray(item?.imageUrls)
    ? item.imageUrls
    : Array.isArray(item?.image_urls)
      ? item.image_urls
      : typeof item?.image_urls === 'string'
        ? aiService.toSafeArray(item.image_urls)
        : [],
})

/**
 * 把一条前端消息转成模型可读的 content：
 *  - 纯文本 → 字符串
 *  - 带图 → 数组 [{type:'text'}, {type:'image_url', image_url:{url:'data:...'}}]
 * 图片统一转成 data URL（否则外部模型无法访问 localhost 图片），转换失败则跳过该图。
 */
const toVisionContent = async (msg) => {
  const imgs = [...(msg.imageUrls || []), msg.imageUrl].filter(Boolean)
  if (!imgs.length) return msg.content
  const parts = []
  if (msg.content) parts.push({ type: 'text', text: msg.content })
  for (const url of imgs) {
    try {
      const dataUrl = await aiService.fileUrlToDataUrl(url)
      parts.push({ type: 'image_url', image_url: { url: dataUrl } })
    } catch (e) {
      logger.warn({ err: e, url }, '历史图片转 data URL 失败，已跳过')
    }
  }
  return parts
}

// ==================== AI 可用性状态（拼小豆是否可用，零成本探测） ====================
// 返回对“当前请求用户”是否可用：key 未配置 → 建设中；配置了但开启白名单且用户不在名单 → 内部功能/建设中
router.get('/status', optionalAuth, (req, res) => {
  const { apiKey, chatModel, visionModel, imageModel } = config.ai
  const hasKey = !!apiKey
  const chat = hasKey && !!chatModel
  const vision = hasKey && !!visionModel
  const image = hasKey && !!imageModel
  const keyConfigured = chat || vision || image
  const user = req.user || null
  const gated = aiAccessGated()
  const allowed = keyConfigured && isAiAllowedUser(user)
  res.json({
    code: 200,
    data: {
      configured: allowed, // 对当前用户是否可用（前端据此显示聊天或“建设中”占位）
      chat,
      vision,
      image,
      gated, // 是否开启了白名单
      user: user ? String(user.username || user.id || '') : null,
    },
  })
})

// ==================== 历史记录 ====================

router.get('/history', optionalAuth, async (req, res) => {
  if (!req.user) return res.json({ code: 401, msg: '请登录' })
  try {
    const data = await aiService.getHistory(req.user.id)
    res.json({ code: 200, data })
  } catch (error) {
    logger.error({ err: error }, '获取拼小豆历史失败')
    res.status(500).json({ code: 500, msg: '获取历史失败' })
  }
})

router.post('/history/sync', optionalAuth, async (req, res) => {
  if (!req.user) return res.json({ code: 401, msg: '请登录' })
  try {
    const { messages = [] } = req.body || {}
    const normalized = messages.map(normalizeClientMessage).filter((m) => m.role === 'user' || m.role === 'assistant')
    if (!normalized.length) return res.json({ code: 200, msg: '同步成功', data: { synced: 0 } })

    const [oldSessions] = await poolQuery('SELECT id FROM ai_chat_sessions WHERE user_id = ?', [req.user.id])
    const oldSessionIds = oldSessions.map((item) => item.id)
    if (oldSessionIds.length) {
      const placeholders = oldSessionIds.map(() => '?').join(',')
      await poolQuery(`DELETE FROM ai_chat_messages WHERE session_id IN (${placeholders})`, oldSessionIds)
      await poolQuery('DELETE FROM ai_chat_sessions WHERE user_id = ?', [req.user.id])
    }

    const titleSource = normalized.find((m) => m.role === 'user')?.content || normalized[0]?.content || '拼小豆聊天'
    const sessionId = await aiService.persistMessagesFromClient(req.user.id, titleSource, normalized)
    res.json({ code: 200, msg: '同步成功', data: { synced: normalized.length, sessionId } })
  } catch (error) {
    logger.error({ err: error }, '同步拼小豆历史失败')
    res.status(500).json({ code: 500, msg: '同步失败', detail: error.message })
  }
})

router.post('/history/clear', optionalAuth, async (req, res) => {
  if (!req.user) return res.json({ code: 401, msg: '请登录' })
  try {
    const [sessions] = await poolQuery('SELECT id FROM ai_chat_sessions WHERE user_id = ?', [req.user.id])
    const sessionIds = sessions.map((item) => item.id)
    if (sessionIds.length) {
      const placeholders = sessionIds.map(() => '?').join(',')
      await poolQuery(`DELETE FROM ai_chat_messages WHERE session_id IN (${placeholders})`, sessionIds)
      await poolQuery('DELETE FROM ai_chat_sessions WHERE user_id = ?', [req.user.id])
    }
    res.json({ code: 200, msg: '清理成功' })
  } catch (error) {
    logger.error({ err: error }, '清理拼小豆历史失败')
    res.status(500).json({ code: 500, msg: '清理失败', detail: error.message })
  }
})

// ==================== 对话（文生文） ====================

router.post('/chat', assertAiConfigured, optionalAuth, assertAiAllowed, validate({ prompt: 'maxLen:1000' }), async (req, res) => {
  const { messages, prompt, mode } = req.body || {}

  let userInput = prompt
  if (messages && messages.length > 0) {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMessage) userInput = lastUserMessage.content
  }
  if (!userInput && mode !== 'generate' && mode !== 'edit') {
    return res.status(400).json({ code: 400, msg: '请输入聊天内容' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const chatMessages = [{
    role: 'system',
    content: '你是拼小豆，一个热情、专业、有亲和力的拼豆创作助手。你用「~」结尾让你的语气更有活力。你能回答拼豆图纸设计、配色方案、工具选购、创意灵感等问题。请用中文回复，保持友好热情的语气。',
  }]

  if (messages && messages.length > 0) {
    const publicBaseUrl = getPublicBaseUrl(req)
    for (const msg of messages.slice(-config.ai.contextMessages)) {
      if (msg.role !== 'user' && msg.role !== 'assistant') continue
      if (!msg.content && !msg.imageUrls && !msg.imageUrl) continue
      let content = msg.content || ''
      if (msg.imageUrls?.length) {
        const urls = msg.imageUrls.map((img) => (img.startsWith('http') ? img : `${publicBaseUrl}${img}`))
        content = `${content}\n\n图片链接：\n${urls.join('\n')}`.trim()
      } else if (msg.imageUrl) {
        const url = msg.imageUrl.startsWith('http') ? msg.imageUrl : `${publicBaseUrl}${msg.imageUrl}`
        content = `${content}\n\n图片链接：\n${url}`.trim()
      }
      chatMessages.push({ role: msg.role, content })
    }
  } else {
    chatMessages.push({ role: 'user', content: userInput })
  }

  const userId = req.user?.id || null
  if (mode === 'generate') {
    if (!config.ai.imageModel) {
      return res.status(500).json({ code: 500, msg: '请先配置图片生成模型（VOLCANO_IMAGE_MODEL）' })
    }
    const imageResult = await aiService.generateImage(userInput, [])
    if (imageResult.url) {
      const publicBaseUrl = getPublicBaseUrl(req)
      const finalImageUrl = imageResult.url.startsWith('http') ? imageResult.url : `${publicBaseUrl}${imageResult.url}`
      await aiService.persistAiConversation({
        userId,
        prompt: userInput,
        responseText: '图片已生成',
        images: [],
        assistantImageUrl: finalImageUrl,
      })
      res.write(`data: ${JSON.stringify({ type: 'image', imageUrl: finalImageUrl, content: '✨ 根据你的描述，我为你生成了以下图片：' })}\n\n`)
      res.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`)
      res.end()
      return
    }
  }

  try {
    await aiService.chatStream(chatMessages, config.ai.chatModel, res, {
      onFinish: async (responseText) => {
        await aiService.persistAiConversation({ userId, prompt: userInput, responseText, images: [] })
      },
    })
  } catch (error) {
    logger.error({ err: error }, '聊天失败')
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI 回复失败' })}\n\n`)
      res.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`)
      res.end()
    }
  }
})

// ==================== 带图对话（分析 / 图生图） ====================

router.post('/chat-with-image', assertAiConfigured, optionalAuth, assertAiAllowed, async (req, res) => {
  const { images, prompt, mode, messages } = req.body || {}
  if (!prompt && (!images || images.length === 0)) {
    return res.status(400).json({ code: 400, msg: '请输入聊天内容或上传图片' })
  }

  const userId = req.user?.id || null
  const userContent = prompt || '请帮我分析这张图片~'
  const publicBaseUrl = getPublicBaseUrl(req)
  const imageUrls = (images || []).map((img) => (img.startsWith('http') ? img : `${publicBaseUrl}${img}`))

  if (mode === 'generate' || mode === 'edit') {
    if (!config.ai.imageModel) {
      return res.status(500).json({ code: 500, msg: '请先配置图片生成模型（VOLCANO_IMAGE_MODEL）' })
    }

    const editImageInputs = mode === 'edit'
      ? await Promise.all((images || []).map(async (img) => {
          if (!img) return ''
          if (img.startsWith('data:')) return img
          const relativePath = img.startsWith('/uploads/') ? path.join(__dirname, '../public', img) : null
          if (relativePath) return aiService.filePathToDataUrl(relativePath)
          const absoluteUrl = img.startsWith('http') ? img : `${publicBaseUrl}${img}`
          return aiService.fileUrlToDataUrl(absoluteUrl)
        }))
      : []

    const imageResult = await aiService.generateImage(userContent, mode === 'edit' ? editImageInputs : [])
    if (!imageResult.url) {
      return res.status(500).json(imageResult.error || { code: 500, msg: '图片生成失败，请检查图片模型、提示词或上传图片' })
    }

    const finalImageUrl = imageResult.url.startsWith('http') ? imageResult.url : `${publicBaseUrl}${imageResult.url}`
    await aiService.persistAiConversation({
      userId,
      prompt: userContent,
      responseText: mode === 'edit' ? '已根据图片要求修改完成' : '已根据描述生成图片',
      images: imageUrls,
      assistantImageUrl: finalImageUrl,
    })
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(`data: ${JSON.stringify({ type: 'image', imageUrl: finalImageUrl, content: mode === 'edit' ? '我已经根据你的图片要求修改好了~' : '我已经根据你的描述生成好了~' })}\n\n`)
    res.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`)
    res.end()
    return
  }

  if (!config.ai.visionModel) {
    return res.status(500).json({ code: 500, msg: '请先配置支持视觉输入的模型（VOLCANO_VISION_MODEL 或 VOLCANO_IMAGE_CHAT_MODEL）' })
  }

  let visionImageUrls = imageUrls
  try {
    visionImageUrls = await Promise.all(imageUrls.map(aiService.fileUrlToDataUrl))
  } catch (error) {
    logger.error({ err: error }, '图片转 data URL 失败')
    return res.status(500).json({ code: 500, msg: '图片读取失败，无法进行分析' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  try {
    const chatMessages = [{
      role: 'system',
      content: '你是拼小豆，一个热情、专业、有亲和力的拼豆创作助手。你用「~」结尾让你的语气更有活力。你能回答拼豆图纸设计、配色方案、工具选购、创意灵感等问题。如果用户上传了图片，请先仔细分析图片内容，再给出专业、具体、可执行的拼豆相关建议。请用中文回复，保持友好热情的语气。',
    }]

    if (messages && messages.length > 0) {
      // 多轮：把对话历史（含当前这一轮的图和文字）一起作为上下文，模型即可记住前文
      const contextMessages = messages.slice(-config.ai.contextMessages)
      for (const msg of contextMessages) {
        if (msg.role !== 'user' && msg.role !== 'assistant') continue
        if (!msg.content && !msg.imageUrls?.length && !msg.imageUrl) continue
        const content = await toVisionContent(msg)
        if (content === '' || (Array.isArray(content) && content.length === 0)) continue
        chatMessages.push({ role: msg.role, content })
      }
    } else if (visionImageUrls.length) {
      // 兼容旧调用：仅当前一轮
      chatMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: userContent },
          ...visionImageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      })
    } else {
      chatMessages.push({ role: 'user', content: userContent })
    }

    await aiService.chatStream(chatMessages, config.ai.visionModel, res, {
      onFinish: async (responseText) => {
        await aiService.persistAiConversation({ userId, prompt: userContent, responseText, images: images || [] })
      },
    })
  } catch (error) {
    logger.error({ err: error }, '带图片聊天错误')
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error?.response?.data?.error?.message || error?.message || 'AI 回复失败' })}\n\n`)
      res.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`)
      res.end()
    }
  }
})

// ==================== 图纸转换（拼小豆 × 图纸算法融合） ====================

router.post('/convert', optionalAuth, async (req, res) => {
  try {
    // 统一 MARD 全色（291 色）：maxColors 默认 0 = 不限色数；
    // 开源算法不含增强类预处理，因此 edgeEnhance/denoise/brightnessBoost/dithering 默认关闭，仅显式开启才生效。
    const { imageUrl, dataUrl, gridSize = 52, maxColors = 0, options = {} } = req.body || {}
    if (!imageUrl && !dataUrl) {
      return res.status(400).json({ code: 400, msg: '请提供 imageUrl 或 dataUrl' })
    }

    const size = Math.max(8, Math.min(128, parseInt(gridSize, 10) || 24))
    const colors = Math.max(0, Math.min(292, parseInt(maxColors, 10) || 0))

    let buffer
    if (dataUrl) {
      buffer = pindouService.dataUrlToBuffer(dataUrl)
    } else {
      pindouService.assertSafeRemoteUrl(imageUrl)
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 })
      buffer = Buffer.from(response.data)
    }

    const pattern = await pindouService.convertFromBuffer(buffer, {
      gridSize: size,
      maxColors: colors,
      options: {
        edgeEnhance: options.edgeEnhance === true,
        denoise: options.denoise === true,
        brightnessBoost: options.brightnessBoost === true,
        dithering: options.dithering === true,
      },
    })

    const previewPng = await pindouService.renderPreviewPng(pattern, 18)
    const previewFilename = `pattern-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`
    await fs.mkdir(PATTERNS_DIR, { recursive: true })
    await fs.writeFile(path.join(PATTERNS_DIR, previewFilename), previewPng)
    const previewUrl = patternUrl(previewFilename)

    res.json({ code: 200, msg: '转换成功', data: { pattern, previewImage: previewUrl } })
  } catch (error) {
    logger.error({ err: error }, '图纸转换失败')
    res.status(500).json({ code: 500, msg: error.message || '图纸转换失败' })
  }
})

// ==================== 代理下载远程图片（绕过浏览器 CORS） ====================
// AI 生成的图片托管在火山方舟 TOS（如 *volces.com），没有给前端返回 CORS 头，
// 浏览器直接 fetch 会被拦。改由后端拉取后转发（服务端无 CORS 限制，且后端已全局配 CORS）。
router.get('/proxy-image', async (req, res) => {
  const url = req.query.url
  if (!url) return res.status(400).json({ code: 400, msg: '缺少 url 参数' })
  try {
    pindouService.assertSafeRemoteUrl(url)
  } catch (e) {
    return res.status(400).json({ code: 400, msg: e.message })
  }
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
    const contentType = response.headers['content-type'] || 'image/png'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(Buffer.from(response.data))
  } catch (error) {
    logger.error({ err: error, url }, '代理下载远程图片失败')
    res.status(502).json({ code: 502, msg: '下载远程图片失败' })
  }
})

// ==================== 图片上传 ====================

router.post('/upload-image', uploadLimiter, imageUpload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ code: 400, msg: '请选择要上传的图片' })
    }
    const images = req.files.map((file) => `/uploads/images/${file.filename}`)
    res.json({ code: 200, msg: '上传成功', data: { images } })
  } catch (error) {
    logger.error({ err: error }, '图片上传错误')
    res.status(500).json({ code: 500, msg: '图片上传失败' })
  }
})

module.exports = router
