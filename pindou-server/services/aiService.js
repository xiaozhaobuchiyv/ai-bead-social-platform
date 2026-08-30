/**
 * AI 服务层：火山方舟（Volcano Ark）大模型调用封装
 *  - 文生图 / 图生图（seedream）
 *  - 对话 / 图片理解（doubao），支持 SSE 流式
 *  - 拼小豆会话持久化（MySQL）
 */
const axios = require('axios')
const path = require('path')
const fs = require('fs/promises')
const pool = require('../config/db')
const config = require('../config')
const logger = require('../utils/logger')

// ==================== 工具函数 ====================

const toSafeArray = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const buildAiSessionTitle = (content = '') =>
  (content || '拼小豆聊天').replace(/[\n\r]+/g, ' ').trim().slice(0, 50) || '拼小豆聊天'

const getMsgType = (content, imageUrls = [], imageUrl = null) => {
  const hasText = Boolean(String(content || '').trim())
  const hasImages = (Array.isArray(imageUrls) && imageUrls.length > 0) || Boolean(imageUrl)
  if (hasText && hasImages) return 'mixed'
  if (hasImages) return 'image'
  return 'text'
}

// ==================== 会话持久化 ====================

const ensureAiSession = async (userId, title) => {
  const [sessionRows] = await pool.query(
    'SELECT id FROM ai_chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [userId]
  )
  let sessionId = sessionRows[0]?.id || null
  if (!sessionId) {
    const [insertSession] = await pool.query(
      'INSERT INTO ai_chat_sessions (user_id, session_title, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
      [userId, title]
    )
    sessionId = insertSession.insertId
  } else {
    await pool.query(
      'UPDATE ai_chat_sessions SET session_title = ?, updated_at = NOW() WHERE id = ?',
      [title, sessionId]
    )
  }
  return sessionId
}

const persistAiConversation = async ({ userId, prompt, responseText, images = [], assistantImageUrl = null }) => {
  if (!userId) return
  const title = buildAiSessionTitle(prompt || responseText)
  const sessionId = await ensureAiSession(userId, title)

  const userMsgType = getMsgType(prompt, images, null)
  const assistantMsgType = getMsgType(responseText, [], assistantImageUrl)

  await pool.query(
    'INSERT INTO ai_chat_messages (session_id, role, content, image_urls, image_url, msg_type, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
    [sessionId, 'user', prompt || '', JSON.stringify(images || []), null, userMsgType]
  )
  await pool.query(
    'INSERT INTO ai_chat_messages (session_id, role, content, image_urls, image_url, msg_type, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
    [sessionId, 'assistant', responseText || '', JSON.stringify([]), assistantImageUrl || null, assistantMsgType]
  )
  await pool.query('UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = ?', [sessionId])
}

/** 由客户端消息数组重建会话（history/sync 用） */
async function persistMessagesFromClient(userId, titleSource, normalizedMessages) {
  const sessionId = await ensureAiSession(userId, buildAiSessionTitle(titleSource))
  for (const msg of normalizedMessages) {
    const msgType = getMsgType(msg.content, msg.imageUrls, msg.imageUrl)
    await pool.query(
      'INSERT INTO ai_chat_messages (session_id, role, content, image_urls, image_url, msg_type, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [sessionId, msg.role, msg.content || '', JSON.stringify(msg.imageUrls || []), msg.imageUrl || null, msgType]
    )
  }
  await pool.query('UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = ?', [sessionId])
  return sessionId
}

// ==================== 模型调用 ====================

/**
 * 图片生成（seedream）
 * @returns {Promise<{url: string|null, raw: object|null, error: object|null}>}
 */
async function generateImage(prompt, imageUrls = [], options = {}) {
  try {
    const requestBody = {
      model: config.ai.imageModel,
      prompt,
      sequential_image_generation: options.sequentialImageGeneration || 'disabled',
      response_format: 'url',
      size: options.size || '2K',
      stream: false,
      watermark: options.watermark ?? true,
    }
    const extraImages = imageUrls.filter(Boolean)
    if (extraImages.length === 1) {
      requestBody.image = extraImages[0]
    } else if (extraImages.length > 1) {
      requestBody.image_urls = extraImages
    }

    const response = await axios.post(
      `${config.ai.baseURL}/images/generations`,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${config.ai.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: config.ai.requestTimeoutMs,
      }
    )
    return { url: response.data.data[0]?.url || null, raw: response.data, error: null }
  } catch (error) {
    const errorData = error.response?.data || { message: error.message }
    logger.error({ err: errorData }, '图像生成失败')
    return { url: null, raw: null, error: errorData }
  }
}

const filePathToDataUrl = async (filePath) => {
  const fileBuffer = await fs.readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const contentTypeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }
  const contentType = contentTypeMap[ext] || 'application/octet-stream'
  return `data:${contentType};base64,${fileBuffer.toString('base64')}`
}

const fileUrlToDataUrl = async (imageUrl) => {
  if (!imageUrl) return ''
  if (imageUrl.startsWith('data:')) return imageUrl
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 })
  const contentType = response.headers['content-type'] || 'image/png'
  const base64 = Buffer.from(response.data, 'binary').toString('base64')
  return `data:${contentType};base64,${base64}`
}

/**
 * 对话流式输出（SSE）
 * @param {Array} messages 完整消息（含 system）
 * @param {string} model 模型名
 * @param {object} streamHandlers { onContent(text), onFinish(fullText), onError(err) }
 * @param {import('express').Response} res SSE 响应对象
 */
async function chatStream(messages, model, res, streamHandlers = {}) {
  const { onContent, onFinish, onError } = streamHandlers
  const response = await axios.post(
    `${config.ai.baseURL}/chat/completions`,
    { model, messages, temperature: 0.7, stream: true },
    {
      headers: {
        Authorization: `Bearer ${config.ai.apiKey}`,
        'Content-Type': 'application/json',
      },
      responseType: 'stream',
      timeout: 120000,
    }
  )

  let buffer = ''
  let finalContent = ''
  let finished = false

  const emitFinish = () => {
    if (finished) return
    finished = true
    res.write(`data: ${JSON.stringify({ type: 'finish' })}\n\n`)
    onFinish?.(finalContent)
  }

  response.data.on('data', (chunk) => {
    buffer += chunk.toString('utf-8')
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimLine = line.trim()
      if (!trimLine || !trimLine.startsWith('data: ')) continue
      if (trimLine === 'data: [DONE]') {
        emitFinish()
        continue
      }
      try {
        const data = JSON.parse(trimLine.slice(6))
        const content = data.choices?.[0]?.delta?.content || ''
        const finishReason = data.choices?.[0]?.finish_reason
        if (content) {
          finalContent += content
          res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`)
          onContent?.(content)
        }
        if (finishReason) emitFinish()
      } catch (e) {
        logger.warn({ err: e }, 'SSE 解析错误')
      }
    }
  })

  response.data.on('end', () => {
    emitFinish()
    res.end()
  })

  response.data.on('error', (err) => {
    logger.error({ err }, '流式传输错误')
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: '流式传输失败' })}\n\n`)
    }
    emitFinish()
    res.end()
    onError?.(err)
  })
}

// ==================== 历史记录 ====================

const normalizeAiMessage = (row) => ({
  role: row.role,
  content: row.content || '',
  imageUrl: row.image_url || null,
  imageUrls: toSafeArray(row.image_urls),
  msgType: row.msg_type || 'text',
  createdAt: row.created_at,
})

async function getHistory(userId, limit = 20) {
  const [sessions] = await pool.query(
    'SELECT id, session_title, created_at, updated_at FROM ai_chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?',
    [userId, limit]
  )
  if (!sessions.length) return { sessions: [], messages: [] }

  const sessionIds = sessions.map((s) => s.id)
  const placeholders = sessionIds.map(() => '?').join(',')
  const [messages] = await pool.query(
    `SELECT id, session_id, role, content, image_urls, image_url, msg_type, created_at
     FROM ai_chat_messages
     WHERE session_id IN (${placeholders})
     ORDER BY created_at ASC, id ASC`,
    sessionIds
  )
  return { sessions, messages: messages.map(normalizeAiMessage) }
}

module.exports = {
  generateImage,
  chatStream,
  filePathToDataUrl,
  fileUrlToDataUrl,
  persistAiConversation,
  persistMessagesFromClient,
  getHistory,
  getMsgType,
  buildAiSessionTitle,
  toSafeArray,
}
