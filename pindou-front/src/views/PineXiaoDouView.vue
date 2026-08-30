<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import PindouPatternViewer from '@/components/PindouPatternViewer.vue'
import { convertImageToPindou, drawPatternToCanvas, serializePixels } from '@/utils/pindou'
import { designApi } from '@/api'

const router = useRouter()

const defaultChatHistory = [
  {
    role: 'assistant',
    content: '你好，我是拼小豆。可以帮你解答拼豆创作、图纸思路、配色搭配等问题。~',
    imageUrl: null,
  },
]

const getAuthToken = () => {
  return localStorage.getItem('token') || localStorage.getItem('access_token') || ''
}

const getCurrentUserId = () => {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return 'guest'
  try {
    const parsed = JSON.parse(raw)
    return parsed?.id ? String(parsed.id) : 'guest'
  } catch {
    return 'guest'
  }
}

const getChatHistoryKey = () => `pinexiaodou_chat_history_${getCurrentUserId()}`

const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_BASE || ''
  return configured.replace(/\/$/, '') || 'http://localhost:3000'
}

const resolveMediaUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/uploads/')) return `${getApiBaseUrl()}${url}`
  return url
}

const normalizeMessage = (item) => ({
  role: item?.role || 'assistant',
  content: item?.content || '',
  displayContent: item?.content || item?.displayContent || '',
  imageUrl: resolveMediaUrl(item?.imageUrl || item?.image_url || null),
  imageUrls: Array.isArray(item?.imageUrls)
    ? item.imageUrls.map(resolveMediaUrl)
    : typeof item?.image_urls === 'string'
      ? JSON.parse(item.image_urls || '[]').map(resolveMediaUrl)
      : Array.isArray(item?.image_urls)
        ? item.image_urls.map(resolveMediaUrl)
        : [],
})

const serializeMessage = (item) => ({
  role: item?.role || 'assistant',
  content: item?.content || '',
  imageUrl: item?.imageUrl || null,
  imageUrls: Array.isArray(item?.imageUrls) ? item.imageUrls : [],
})

const loadLocalChatHistory = () => {
  const saved = localStorage.getItem(getChatHistoryKey())
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      return Array.isArray(parsed) ? parsed.map(normalizeMessage) : [...defaultChatHistory]
    } catch (e) {
      console.error('加载聊天记录失败:', e)
    }
  }
  return [...defaultChatHistory]
}

const mergeServerHistory = (messages = []) => {
  if (!Array.isArray(messages) || messages.length === 0) return
  chatList.value = messages
    .map((item) => normalizeMessage({
      role: item.role,
      content: item.content,
      imageUrl: item.imageUrl || null,
      imageUrls: item.imageUrls || [],
    }))
  saveLocalChatHistory()
}

const chatList = ref(loadLocalChatHistory())
const inputValue = ref('')
const selectedTaskMode = ref('analyze')
const pendingImageUrls = ref([])
const pendingImageInfo = ref('')
const sending = ref(false)
const messageContainer = ref(null)
const imageInput = ref(null)
const MAX_IMAGE_SIZE_MB = 10
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const saveLocalChatHistory = () => {
  localStorage.setItem(getChatHistoryKey(), JSON.stringify(chatList.value))
}

const clearChatHistory = async () => {
  try {
    const token = getAuthToken()
    if (token) {
      await fetch('/api/ai/history/clear', {
        method: 'POST',
        headers: { token },
      }).catch(() => null)
    }
  } finally {
    localStorage.removeItem(getChatHistoryKey())
    chatList.value = [...defaultChatHistory]
    ElMessage.success('聊天记录已清除')
  }
}

const scrollToBottom = (smooth = true) => {
  nextTick(() => {
    const behavior = smooth ? 'smooth' : 'auto'
    const scrollNow = () => {
      // 1) 聊天区向上平滑滑到底（最新消息紧贴输入框）
      if (messageContainer.value && typeof messageContainer.value.scrollTo === 'function') {
        messageContainer.value.scrollTo({ top: messageContainer.value.scrollHeight, behavior })
      } else if (messageContainer.value) {
        messageContainer.value.scrollTop = messageContainer.value.scrollHeight
      }
      // 2) 兜底：把页面也平滑滑到最底，确保输入框完整露出
      const el = document.scrollingElement || document.documentElement
      if (el && typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior })
      }
    }
    scrollNow()
    // 图片/内容异步加载会撑高，用平滑滚动补一次（不会像瞬时跳转那样“抖”）
    setTimeout(scrollNow, 320)
  })
}

// ==================== 打字机效果 ====================
// 打字机：基础逐字延迟。SSE 内容已流式到达，为了不「滞后」，落后较多时一次补多字（追赶）。
const charDelay = 12
let typeTimer = null

const stopTypeTimer = () => {
  if (typeTimer) {
    clearTimeout(typeTimer)
    typeTimer = null
  }
}

/** 立即补全上一条仍在打字的回复，避免下一条开始时内容卡在中间 */
const flushCurrentTyping = () => {
  stopTypeTimer()
  const last = chatList.value[chatList.value.length - 1]
  if (last && last.role === 'assistant') {
    last.displayContent = last.content
  }
}

/**
 * 打印式揭示：把 msg.content 完整文本逐字写入 msg.displayContent（打字机效果）。
 * content 一直保存完整文本（用于持久化），displayContent 用于逐字展示。
 */
const ensureTyping = (msg) => {
  if (!msg || typeTimer) return
  const tick = () => {
    const full = msg.content || ''
    const cur = msg.displayContent || ''
    const backlog = full.length - cur.length
    if (backlog > 0) {
      // 落后越多一次补越多字，让展示速度跟上流式内容，避免「越等越久」
      const step = backlog > 80 ? 4 : backlog > 30 ? 2 : 1
      msg.displayContent = full.slice(0, cur.length + step)
      scrollToBottom()
      typeTimer = setTimeout(tick, charDelay)
    } else {
      typeTimer = null
    }
  }
  tick()
}

const extractAssistantContent = (data) => {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) {
    return data
      .map((item) => item?.text || item?.content || '')
      .join('')
  }
  return data?.content || data?.text || ''
}

const readSSEStream = async (response, assistantMessage) => {
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let eventLines = []

  const handleEvent = (lines) => {
    if (!lines.length) return

    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())

    if (!dataLines.length) return

    const payload = dataLines.join('\n').trim()
    if (!payload || payload === '[DONE]') return

    let data
    try {
      data = JSON.parse(payload)
    } catch (error) {
      console.warn('忽略无法解析的 SSE 数据:', payload)
      return
    }

    if (data.type === 'image') {
      assistantMessage.content = data.content || '为您生成的图片：'
      assistantMessage.imageUrl = resolveMediaUrl(data.imageUrl || null)
      assistantMessage.imageUrls = []
      ensureTyping(assistantMessage)
      scrollToBottom()
      return
    }

    if (data.type === 'content') {
      assistantMessage.content = (assistantMessage.content || '') + extractAssistantContent(data.content)
      ensureTyping(assistantMessage)
      scrollToBottom()
      return
    }

    if (data.type === 'error') {
      throw new Error(data.message || 'AI 回复失败')
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    let newlineIndex
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
      buffer = buffer.slice(newlineIndex + 1)

      if (!line.trim()) {
        handleEvent(eventLines)
        eventLines = []
        continue
      }

      eventLines.push(line)
    }
  }

  if (buffer.trim()) {
    eventLines.push(buffer.replace(/\r$/, ''))
  }

  handleEvent(eventLines)
}

const persistHistoryToServer = async () => {
  const token = getAuthToken()
  if (!token) return

  await fetch('/api/ai/history/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token,
    },
    body: JSON.stringify({ messages: chatList.value.map(serializeMessage) }),
  }).catch((error) => {
    console.error('同步聊天历史失败:', error)
  })
}

const setTaskMode = (mode) => {
  selectedTaskMode.value = mode
}

const sendMessage = async (mode = selectedTaskMode.value) => {
  const content = inputValue.value.trim()
  const imageUrls = pendingImageUrls.value
  const imageTaskMode = mode
  if (sending.value) return
  if (!content && imageUrls.length === 0) return
  if (mode === 'edit' && imageUrls.length === 0) {
    ElMessage.warning('图生图模式需要先上传至少 1 张图片')
    return
  }

  if (content.length > 500) {
    ElMessage.warning('消息太长了，请精简后再发送')
    return
  }

  // 上一条若仍在打字，先补全，避免与新消息打字冲突
  flushCurrentTyping()

  const userMessage = { role: 'user', content, imageUrl: null, imageUrls, taskMode: imageTaskMode }
  chatList.value.push(userMessage)
  inputValue.value = ''
  pendingImageUrls.value = []
  pendingImageInfo.value = ''
  sending.value = true
  scrollToBottom()
  saveLocalChatHistory()

  const assistantMessage = { role: 'assistant', content: '', displayContent: '', imageUrl: null, imageUrls: [] }
  chatList.value.push(assistantMessage)
  // 取数组里的响应式代理来更新（直接改原始对象不触发渲染，会导致整段一次性显示）
  const liveAssistant = chatList.value[chatList.value.length - 1]
  scrollToBottom()

  try {
    if (imageUrls.length > 0) {
      const response = await fetch('/api/ai/chat-with-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAuthToken() ? { token: getAuthToken() } : {}),
        },
        body: JSON.stringify({
          messages: chatList.value.slice(0, -1),
          images: imageUrls,
          prompt: content || '请帮我看看这张图片~',
          mode: imageTaskMode,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.msg || '请求失败')
      }

      await readSSEStream(response, liveAssistant)
    } else {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAuthToken() ? { token: getAuthToken() } : {}),
        },
        body: JSON.stringify({
          messages: chatList.value.slice(0, -1),
          prompt: content,
          mode,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.msg || '请求失败')
      }

      await readSSEStream(response, liveAssistant)
    }
    // 打字机继续逐字显示，不在此处打断
  } catch (error) {
    stopTypeTimer()
    if (!liveAssistant.content && !liveAssistant.imageUrl) {
      liveAssistant.displayContent = '（回复被中断）'
    } else {
      liveAssistant.displayContent = liveAssistant.content
    }
    ElMessage.error(error?.msg || error?.message || 'AI 回复失败')
    const lastIndex = chatList.value.findIndex(m => m === liveAssistant)
    if (lastIndex !== -1 && !liveAssistant.content && !liveAssistant.imageUrl) {
      chatList.value.splice(lastIndex, 1)
    }
  } finally {
    sending.value = false
    saveLocalChatHistory()
    await persistHistoryToServer()
  }
}

const handleKeydown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

const removePendingImage = (index) => {
  pendingImageUrls.value.splice(index, 1)
  if (pendingImageUrls.value.length === 0) {
    pendingImageInfo.value = ''
  } else {
    pendingImageInfo.value = `${pendingImageUrls.value.length} 张图片已添加，请继续输入后发送`
  }
}

// 图片上传处理
const handleImageUpload = async (event) => {
  const files = Array.from(event.target.files || [])
  if (files.length === 0) return

  if (files.length > 5) {
    ElMessage.warning('一次最多上传 5 张图片')
    if (imageInput.value) imageInput.value.value = ''
    return
  }

  const invalidType = files.find((file) => !ALLOWED_IMAGE_TYPES.includes(file.type))
  if (invalidType) {
    ElMessage.warning('只支持 JPG、PNG、GIF、WEBP 图片格式')
    if (imageInput.value) imageInput.value.value = ''
    return
  }

  const oversized = files.find((file) => file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024)
  if (oversized) {
    ElMessage.warning(`单张图片不能超过 ${MAX_IMAGE_SIZE_MB}MB`)
    if (imageInput.value) imageInput.value.value = ''
    return
  }

  const formData = new FormData()
  for (const file of files) {
    formData.append('images', file)
  }

  try {
    const response = await fetch('/api/ai/upload-image', {
      method: 'POST',
      body: formData,
    })

    const result = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(result?.msg || '图片上传失败')
    }

    if (result.code === 200 && result.data?.images?.length) {
      pendingImageUrls.value = result.data.images.map(resolveMediaUrl)
      pendingImageInfo.value = `${pendingImageUrls.value.length} 张图片已添加，请继续输入后发送`
      ElMessage.success('图片已添加，请继续输入后发送')
      scrollToBottom()
    } else {
      throw new Error(result?.msg || '图片上传失败')
    }
  } catch (error) {
    ElMessage.error(error?.message || '图片上传失败')
    console.error('Image upload error:', error)
  }

  if (imageInput.value) {
    imageInput.value.value = ''
  }
}

// 发送包含图片的消息
const sendMessageWithImages = async (imageUrls, textContent, mode = 'analyze') => {
  if (sending.value) return

  sending.value = true
  const userMessage = { role: 'user', content: textContent, imageUrl: null, imageUrls }
  chatList.value.push(userMessage)
  pendingImageUrls.value = []
  pendingImageInfo.value = ''
  saveLocalChatHistory()
  scrollToBottom()

  const assistantMessage = { role: 'assistant', content: '', imageUrl: null, imageUrls: [] }
  chatList.value.push(assistantMessage)
  scrollToBottom()

  try {
    const response = await fetch('/api/ai/chat-with-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getAuthToken() ? { token: getAuthToken() } : {}),
      },
      body: JSON.stringify({
        messages: chatList.value.slice(0, -1),
        images: imageUrls,
        prompt: textContent,
        mode,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      throw new Error(errorData?.msg || '请求失败')
    }

    await readSSEStream(response, assistantMessage)
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || 'AI 回复失败')
    const lastIndex = chatList.value.findIndex(m => m === assistantMessage)
    if (lastIndex !== -1) {
      chatList.value.splice(lastIndex, 1)
    }
  } finally {
    sending.value = false
    saveLocalChatHistory()
    await persistHistoryToServer()
  }
}

// 下载图片前添加黑色网格和色号标注
const loadHistoryFromServer = async () => {
  const token = getAuthToken()
  if (!token) return

  try {
    const response = await fetch('/api/ai/history', {
      headers: { token },
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.code !== 200) return

    const messages = result.data?.messages || []
    if (!messages.length) return

    mergeServerHistory(messages)
    scrollToBottom()
  } catch (error) {
    console.error('加载服务端历史失败:', error)
  }
}

onMounted(async () => {
  // 进入拼小豆即自动定位到聊天最下方（最新消息）
  scrollToBottom()
  await loadHistoryFromServer()
  scrollToBottom()
  window.addEventListener('userInfoUpdated', loadHistoryFromServer)
})

onBeforeUnmount(() => {
  window.removeEventListener('userInfoUpdated', loadHistoryFromServer)
  stopTypeTimer()
})

const downloadImage = async (imageUrl, filename = 'ai-image') => {
  try {
    // 远程图片（AI 生成，如火山方舟 TOS）无 CORS 头，直接 fetch 会被拦。
    // 改走后端代理接口 /api/ai/proxy-image（同源，无 CORS 问题）。
    const target = getApiBaseUrl() && /^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith(getApiBaseUrl())
      ? `/api/ai/proxy-image?url=${encodeURIComponent(imageUrl)}`
      : imageUrl
    const response = await fetch(target)
    const blob = await response.blob()

    // 直接下载原图（不叠加网格/色号）
    const outUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = outUrl
    link.download = `${filename}-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(outUrl)
  } catch (error) {
    console.error('下载图片失败，直接下载原图:', error)
    const link = document.createElement('a')
    link.href = imageUrl
    link.download = `${filename}-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}

// 触发图片上传
const triggerImageUpload = () => {
  if (imageInput.value) {
    imageInput.value.click()
  }
}

// ==================== 拼豆图纸转换（拼小豆 × 图纸算法融合） ====================
const PATTERN_GRID_OPTIONS = [16, 24, 32, 48, 52, 64, 86, 128]
const PATTERN_COLOR_OPTIONS = [4, 6, 8, 12, 24, 32, 58, 88, 131, 292]

const patternDialogVisible = ref(false)
const patternSourceImage = ref('')
const patternGridSize = ref(52)
const patternMaxColors = ref(292)
const patternResult = ref(null)
const patternConverting = ref(false)
const patternSaving = ref(false)

/** 判断图片源：远程非同源 URL（AI 生成图）→ 走服务端 jimp 转换；本地 → 前端 Canvas 算法 */
const isRemoteSource = (url) => {
  if (!/^https?:\/\//i.test(url)) return false
  return !url.startsWith(getApiBaseUrl())
}

/** 打开转换弹窗并立即转换 */
const openPatternDialog = async (imageUrl) => {
  if (!imageUrl) return
  patternSourceImage.value = imageUrl
  patternResult.value = null
  patternDialogVisible.value = true
  await convertForPattern(imageUrl)
}

/** 执行图纸转换（本地前端算法 / 远程服务端算法） */
const convertForPattern = async (imageUrl) => {
  const resolved = resolveMediaUrl(imageUrl)
  patternConverting.value = true
  patternResult.value = null
  try {
    if (isRemoteSource(resolved)) {
      const response = await fetch('/api/ai/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAuthToken() ? { token: getAuthToken() } : {}),
        },
        body: JSON.stringify({
          imageUrl: resolved,
          gridSize: patternGridSize.value,
          maxColors: patternMaxColors.value,
          options: { edgeEnhance: true, denoise: true, brightnessBoost: true },
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.code !== 200 || !result?.data?.pattern) {
        throw new Error(result?.msg || '服务端图纸转换失败')
      }
      const p = result.data.pattern
      patternResult.value = {
        // 服务端像素不带 label，这里补上色号，保证和用户图（前端引擎）一样显示色值标注
        pixels: (p.pixels || []).map((x) => ({ ...x, label: x.label || x.name || x.code, name: x.name || x.code })),
        colorPalette: p.palette || [],
        totalPixels: p.totalPixels,
        colorCount: p.colorCount,
        estimatedTime: p.estimatedTime,
        originalImage: resolved,
        similarity: p.similarity,
        gridWidth: p.gridWidth,
        gridHeight: p.gridHeight,
      }
    } else {
      patternResult.value = await convertImageToPindou(resolved, patternGridSize.value, {
        edgeEnhance: true,
        denoise: true,
        brightnessBoost: true,
        maxColors: patternMaxColors.value,
      })
    }
  } catch (error) {
    console.error('图纸转换失败:', error)
    ElMessage.error(error?.message || '图纸转换失败，请重试')
  } finally {
    patternConverting.value = false
  }
}

/** 图纸渲染为 PNG dataURL（保存/发布用） */
const renderPatternImage = (result) => {
  const canvas = document.createElement('canvas')
  drawPatternToCanvas(canvas, result)
  return canvas.toDataURL('image/png')
}

/** 保存图纸到「我的图纸」 */
const savePatternDesign = async (result) => {
  if (!result) return
  const token = getAuthToken()
  if (!token) {
    ElMessage.warning('请先登录后再保存图纸~')
    window.dispatchEvent(new Event('showLoginModal'))
    return
  }
  patternSaving.value = true
  try {
    const res = await designApi.saveDesign({
      sourceImage: result.originalImage,
      gridWidth: result.gridWidth,
      gridHeight: result.gridHeight,
      gridSize: patternGridSize.value,
      maxColors: patternMaxColors.value,
      pixels: serializePixels(result.pixels),
      palette: result.colorPalette,
      totalPixels: result.totalPixels,
      colorCount: result.colorCount,
      similarity: result.similarity,
      estimatedTime: result.estimatedTime,
      previewImage: renderPatternImage(result),
    })
    if (res.code === 200) {
      ElMessage.success('图纸已保存到「我的图纸」~')
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '保存失败，请稍后重试')
  } finally {
    patternSaving.value = false
  }
}

/** 一键发布为笔记 */
const publishPatternDesign = (result) => {
  if (!result) return
  const canvas = document.createElement('canvas')
  drawPatternToCanvas(canvas, result)
  localStorage.setItem('pindouPublishImage', canvas.toDataURL('image/png'))
  router.push('/publish')
}
</script>

<!-- template 保持不变，已有 imageUrl 显示逻辑 -->

<template>
  <div class="pine-xiaodou-page">
    <header class="topbar">
      <div class="brand-block">
        <div class="avatar">豆</div>
        <div>
          <p class="eyebrow">拼小豆</p>
          <h1>像豆包一样好用的 AI 聊天助手</h1>
        </div>
      </div>

      <div class="topbar-actions">
        <span class="status-pill" :class="{ live: !sending }">
          <i class="status-dot"></i>
          {{ sending ? '正在回复' : '在线' }}
        </span>
        <button class="clear-history-btn" @click="clearChatHistory" title="清除聊天记录">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </header>

    <main class="chat-page">
      <!-- 绑定ref -->
      <section class="messages" ref="messageContainer">
        <div v-for="(item, index) in chatList" :key="index" class="message-row" :class="item.role">
          <div class="message-avatar">{{ item.role === 'assistant' ? '豆' : '你' }}</div>
          <div class="message-bubble">
            <div class="message-name">{{ item.role === 'assistant' ? '拼小豆' : '你' }}</div>
            <div class="message-content">
              <template v-if="item.role === 'assistant' && !item.content && sending">
                <span class="dots"><span></span><span></span><span></span></span>
              </template>
              <template v-else>
                {{ item.displayContent ?? item.content }}
              </template>
            </div>
            <!-- 用户上传的图片 -->
            <div v-if="item.imageUrls && item.imageUrls.length > 0" class="message-images">
              <div v-for="(imgUrl, imgIndex) in item.imageUrls" :key="imgIndex" class="message-image user-image">
                <img :src="imgUrl" alt="上传的图片" />
                <button class="convert-btn" title="转换为拼豆图纸" @click="openPatternDialog(imgUrl)"><el-icon :size="12"><Grid /></el-icon><span>转图纸</span></button>
              </div>
            </div>
            <div v-if="item.imageUrl" class="message-image-wrapper ai-image">
              <div class="message-image">
                <img :src="item.imageUrl" alt="生成的图片" />
              </div>
              <div class="ai-image-actions">
                <button class="download-btn" @click="downloadImage(item.imageUrl)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>下载</span>
                </button>
                <button class="download-btn convert-cta" @click="openPatternDialog(item.imageUrl)">
                  <el-icon :size="12"><Grid /></el-icon><span>转拼豆图纸</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="composer-bar">
        <div class="composer-inner">
          <div class="composer-box">
            <div class="task-mode-switch">
              <button type="button" :class="{ active: selectedTaskMode === 'analyze' }" @click="setTaskMode('analyze')">图片分析</button>
              <button type="button" :class="{ active: selectedTaskMode === 'generate' }" @click="setTaskMode('generate')">文生图</button>
              <button type="button" :class="{ active: selectedTaskMode === 'edit' }" @click="setTaskMode('edit')">图生图</button>
            </div>
            <div class="composer-input-wrap">
              <input 
                ref="imageInput"
                type="file" 
                multiple 
                accept="image/*" 
                class="image-upload-input"
                @change="handleImageUpload"
              />

              <button 
                type="button" 
                class="image-upload-btn"
                :disabled="sending"
                @click="triggerImageUpload"
                title="上传图片"
                aria-label="上传图片"
              >
                <el-icon :size="14"><Plus /></el-icon>
              </button>

              <div v-if="pendingImageInfo" class="pending-image-hint">{{ pendingImageInfo }}</div>
              <div v-if="pendingImageUrls.length" class="pending-image-grid">
                <div v-for="(imgUrl, index) in pendingImageUrls" :key="imgUrl + index" class="pending-image-item">
                  <img :src="imgUrl" alt="待发送图片预览" />
                  <button type="button" class="pending-image-remove" @click="removePendingImage(index)"><el-icon :size="12"><Close /></el-icon></button>
                </div>
              </div>

              <textarea id="pine-xiaodou-input" v-model="inputValue" rows="1" placeholder="给拼小豆发消息..."
                @keydown="handleKeydown"></textarea>
            </div>
          </div>

          <button :disabled="sending || (!inputValue.trim() && pendingImageUrls.length === 0)" @click="sendMessage(selectedTaskMode)">
            {{ sending ? '发送中...' : (selectedTaskMode === 'edit' ? '图生图' : selectedTaskMode === 'generate' ? '文生图' : '发送') }}
          </button>
        </div>
      </footer>
    </main>

    <!-- 拼豆图纸转换弹窗（拼小豆 × 图纸算法融合） -->
    <div v-if="patternDialogVisible" class="pattern-dialog-mask" @click.self="patternDialogVisible = false">
      <div class="pattern-dialog">
        <div class="pattern-dialog-header">
          <h3><el-icon :size="18" color="#0f766e" style="vertical-align: -3px; margin-right: 6px"><Grid /></el-icon>拼豆图纸转换</h3>
          <button class="pattern-dialog-close" @click="patternDialogVisible = false"><el-icon :size="16"><Close /></el-icon></button>
        </div>
        <div class="pattern-dialog-params">
          <label>
            网格尺寸
            <select v-model="patternGridSize" :disabled="patternConverting" @change="convertForPattern(patternSourceImage)">
              <option v-for="s in PATTERN_GRID_OPTIONS" :key="s" :value="s">{{ s }}×{{ s }}</option>
            </select>
          </label>
          <label>
            颜色数量
            <select v-model="patternMaxColors" :disabled="patternConverting" @change="convertForPattern(patternSourceImage)">
              <option :value="0">不限制</option>
              <option v-for="c in PATTERN_COLOR_OPTIONS" :key="c" :value="c">{{ c }}色</option>
            </select>
          </label>
          <span class="pattern-engine-tip">
            {{ isRemoteSource(resolveMediaUrl(patternSourceImage)) ? '服务端引擎' : '本地引擎' }}
          </span>
        </div>
        <div class="pattern-dialog-body">
          <div v-if="patternConverting" class="pattern-loading"><el-icon class="is-loading" :size="20" color="#2ec4b5"><Loading /></el-icon><span>正在转换图纸，请稍候...</span></div>
          <PindouPatternViewer
            v-else-if="patternResult"
            :result="patternResult"
            :show-save="true"
            :show-publish="true"
            :saving="patternSaving"
            @save="savePatternDesign"
            @publish="publishPatternDesign"
          />
          <div v-else class="pattern-loading pattern-loading-error">
            <el-icon :size="20" color="#e74c3c"><CircleClose /></el-icon>
            <span>转换失败，请重试</span>
            <button class="retry-btn" @click="convertForPattern(patternSourceImage)">重试</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pine-xiaodou-page {
  /* 钉在视口高度：消息区内部滚动，输入栏固定底部，不随消息增长把整页顶下去 */
  height: 100vh;
  min-height: 0;
  padding: 18px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: radial-gradient(circle at top, #f4fffd 0, #eef8f7 35%, #f6f8ff 100%);
  overflow: hidden;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex: 0 0 auto;
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 14px;
}

.avatar {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  background: linear-gradient(135deg, #2ec4b5, #6ee7d8);
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  display: grid;
  place-items: center;
  box-shadow: 0 12px 30px rgba(46, 196, 181, 0.28);
}

.eyebrow {
  color: #2ec4b5;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
}

h1 {
  font-size: 24px;
  color: #102a43;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  background: #e8f6f4;
  color: #0f766e;
  font-weight: 600;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2ec4b5;
  box-shadow: 0 0 0 6px rgba(46, 196, 181, 0.16);
}

/* 清除聊天记录按钮 */
.clear-history-btn {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 12px;
  background: #f87171;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  margin-left: 12px;
  padding: 0;
  box-shadow: none;
}

.clear-history-btn:hover {
  background: #ef4444;
  transform: scale(1.05);
}

.chat-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(12px);
}

.messages {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.75), rgba(247, 251, 255, 0.92)),
    repeating-linear-gradient(to bottom, rgba(46, 196, 181, 0.04) 0, rgba(46, 196, 181, 0.04) 1px, transparent 1px, transparent 28px);
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.message-row.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #2ec4b5, #22a699);
}

.message-row.user .message-avatar {
  background: linear-gradient(135deg, #3b82f6, #60a5fa);
}

.message-bubble {
  max-width: min(720px, 82%);
  background: #fff;
  border: 1px solid #e5eef5;
  border-radius: 20px;
  padding: 14px 16px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
}

.message-row.user .message-bubble {
  background: #eff6ff;
}

.message-name {
  font-size: 12px;
  color: #7b8794;
  margin-bottom: 6px;
}

.message-content {
  color: #102a43;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.message-image {
  margin-top: 12px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
}

.message-image img {
  max-width: 100%;
  height: auto;
  display: block;
}

.user-image {
  width: 120px;
  height: 120px;
}

.user-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ai-image {
  max-width: 280px;
}

.ai-image img {
  width: 100%;
  height: auto;
  object-fit: contain;
}

.loading-bubble .dots {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 24px;
}

/* 三点指示：flex 让点的 transform(跳跃) 生效（行内元素不响应 transform） */
.dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: middle;
}

.dots span {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2ec4b5;
  animation: dot-jump 1s infinite ease-in-out;
}

.dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.dots span:nth-child(3) {
  animation-delay: 0.3s;
}

.composer-bar {
  flex: 0 0 auto;
  padding: 14px;
  background: rgba(255, 255, 255, 0.82);
  border-top: 1px solid rgba(229, 238, 245, 0.8);
  /* 钉在页面最底部，保证输入框始终完整露出（类似豆包/私信） */
  position: sticky;
  bottom: 0;
  z-index: 5;
  backdrop-filter: blur(10px);
  box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.04);
}

.composer-inner {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  max-width: 980px;
  margin: 0 auto;
}

.composer-box {
  flex: 1;
  min-height: 56px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid #d9e5ec;
  border-radius: 18px;
  padding: 10px 12px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
  position: relative;
}

.task-mode-switch {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;

  button {
    border: 1px solid rgba(46, 196, 181, 0.25);
    background: #fff;
    color: #1f3c46;
    border-radius: 999px;
    padding: 8px 14px;
    cursor: pointer;
    transition: all 0.2s ease;

    &.active {
      background: linear-gradient(135deg, #2ec4b5, #6ee7d8);
      color: #fff;
      border-color: transparent;
      box-shadow: 0 8px 20px rgba(46, 196, 181, 0.25);
    }
  }
}

.composer-input-wrap {
  position: relative;
  flex: 1;
  min-height: 40px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 36px;
}

.pending-image-hint {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin: 0;
  font-size: 12px;
  color: #0f766e;
  background: rgba(46, 196, 181, 0.12);
  border: 1px solid rgba(46, 196, 181, 0.18);
  border-radius: 999px;
  padding: 6px 10px;
  pointer-events: none;
}

.pending-image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pending-image-item {
  position: relative;
  width: 92px;
  height: 92px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #d9e5ec;
  background: #f8fafc;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
}

.pending-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pending-image-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.82);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

textarea {
  width: 100%;
  min-height: 40px;
  max-height: 120px;
  resize: none;
  border: none;
  border-radius: 14px;
  padding: 10px 8px 10px 8px;
  font-size: 15px;
  line-height: 1.7;
  outline: none;
  background: transparent;
  box-sizing: border-box;
}

textarea:focus {
  border-color: #2ec4b5;
  box-shadow: 0 0 0 4px rgba(46, 196, 181, 0.14);
}

button {
  border: none;
  border-radius: 999px;
  padding: 14px 24px;
  background: linear-gradient(135deg, #2ec4b5, #23b7a8);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(46, 196, 181, 0.25);
  height: 56px;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

/* 图片上传相关样式 */
.image-upload-input {
  display: none;
}

.image-upload-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
  font-size: 20px;
  font-weight: 500;
  line-height: 1;
  padding: 0;
  position: absolute;
  right: 8px;
  top: 8px;
  z-index: 2;
}

.plus-icon {
  transform: translateY(-1px);
}

.image-upload-btn:hover:not(:disabled) {
  background: #e2e8f0;
  color: #475569;
}

.image-upload-btn:disabled {
  opacity: 0.5;
}

/* 多图片显示 */
.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

/* 图片容器（带下载按钮） */
.message-image-wrapper {
  position: relative;
  margin-top: 12px;
  border-radius: 12px;
  overflow: hidden;
}

.download-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
  height: auto;
  box-shadow: none;
  padding: 6px 10px;
}

.message-image-wrapper:hover .download-btn {
  opacity: 1;
}

.download-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

@keyframes dot-jump {
  0%,
  70%,
  100% {
    transform: translateY(0) scale(1);
  }
  35% {
    transform: translateY(-6px) scale(1.1);
  }
}

@media (max-width: 768px) {
  .pine-xiaodou-page {
    padding: 12px;
  }

  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }

  h1 {
    font-size: 20px;
  }

  .composer-inner {
    flex-direction: column;
    align-items: stretch;
  }

  button {
    width: 100%;
  }

  .message-bubble {
    max-width: 90%;
  }
}

/* ==================== 拼豆图纸转换 ==================== */
.message-image.user-image {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
}

.message-image.user-image img {
  display: block;
  width: 180px;
  max-height: 180px;
  object-fit: cover;
  border-radius: 10px;
}

.convert-btn {
  position: absolute;
  right: 6px;
  bottom: 6px;
  height: auto;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  background: rgba(46, 196, 181, 0.92);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.message-image.user-image:hover .convert-btn {
  opacity: 1;
}

.ai-image-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.message-image-wrapper:hover .ai-image-actions {
  opacity: 1;
}

.ai-image-actions .download-btn {
  position: static;
  opacity: 1;
  height: auto;
}

.ai-image-actions .convert-cta {
  background: rgba(46, 196, 181, 0.9);
}

.pattern-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.pattern-dialog {
  width: min(880px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
}

.pattern-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eef2f5;
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 17px;
    color: #102a43;
  }
}

.pattern-dialog-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  box-shadow: none;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #e2e8f0;
  }
}

.pattern-dialog-params {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid #eef2f5;
  flex-wrap: wrap;
  flex-shrink: 0;

  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #475569;
  }

  select {
    padding: 6px 10px;
    border: 1px solid #d9e5ec;
    border-radius: 8px;
    font-size: 13px;
    background: #fff;
    outline: none;

    &:focus {
      border-color: #2ec4b5;
    }
  }
}

.pattern-engine-tip {
  font-size: 12px;
  color: #0f766e;
  background: rgba(46, 196, 181, 0.1);
  padding: 4px 10px;
  border-radius: 999px;
}

.pattern-dialog-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

.pattern-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 320px;
  color: #64748b;
  font-size: 15px;

  &.pattern-loading-error {
    color: #e74c3c;
  }
}

.retry-btn {
  height: auto;
  padding: 8px 18px;
  font-size: 13px;
  border-radius: 999px;
  background: linear-gradient(135deg, #2ec4b5, #23b7a8);
}
</style>
