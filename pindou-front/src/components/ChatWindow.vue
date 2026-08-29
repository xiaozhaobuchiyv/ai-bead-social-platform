<template>
  <div class="chat-window">
    <!-- 聊天头部 -->
    <div class="chat-header" v-if="targetUser">
      <img :src="formatAvatar(targetUser.avatar)" class="target-avatar" />
      <span class="target-name">{{ targetUser.nickname }}</span>
      <span class="online-dot" title="在线"></span>
    </div>

    <!-- 消息列表（按天分组） -->
    <div class="messages-container" ref="messagesContainer">
      <template v-for="group in messageGroups" :key="group.label">
        <div class="date-divider">
          <span>{{ group.label }}</span>
        </div>
        <div
          v-for="msg in group.items"
          :key="msg.id"
          class="message-item"
          :class="{ mine: msg.from_user_id === currentUserId, sending: msg.sending }"
        >
          <img :src="formatAvatar(msg.from_user_id === currentUserId ? myAvatar : msg.from_avatar)" class="msg-avatar" @click="openProfile(msg)" />
          <div class="msg-content">
            <div class="msg-text">{{ msg.content }}</div>
            <div class="msg-time">
              <span v-if="msg.sending" class="sending-tag">发送中...</span>
              <template v-else>{{ formatTime(msg.create_time) }}</template>
            </div>
          </div>
        </div>
      </template>

      <div v-if="loadingHistory" class="list-loading">
        <span class="spinner"></span> 加载中...
      </div>
      <div v-else-if="messages.length === 0" class="empty-messages">
        <p>开始聊天吧~</p>
      </div>
    </div>

    <!-- 输入框 -->
    <div class="input-area">
      <input
        v-model="inputMessage"
        type="text"
        placeholder="输入消息..."
        class="msg-input"
        :disabled="sending"
        @keyup.enter="sendMessage"
      />
      <button class="send-btn" :disabled="sending || !inputMessage.trim()" @click="sendMessage">
        {{ sending ? '发送中...' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { messageApi } from '@/api'
import { formatAvatar, DEFAULT_AVATAR } from '@/utils/media'

const router = useRouter()

const props = defineProps({
  targetId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['read', 'conversation-read'])

const messages = ref([])
const inputMessage = ref('')
const messagesContainer = ref(null)
const targetUser = ref(null)
const currentUserId = ref(null)
const sending = ref(false)
const loadingHistory = ref(false)

const currentUser = ref({ id: null, avatar: DEFAULT_AVATAR })
const myAvatar = computed(() => formatAvatar(currentUser.value.avatar))

// 按天分组
const messageGroups = computed(() => {
  const groups = []
  let currentLabel = null
  for (const msg of messages.value) {
    const label = dayLabel(msg.create_time)
    if (label !== currentLabel) {
      currentLabel = label
      groups.push({ label, items: [] })
    }
    groups[groups.length - 1].items.push(msg)
  }
  return groups
})

// 日期标签：今天 / 昨天 / YYYY年M月D日
const dayLabel = (time) => {
  if (!time) return '今天'
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return '今天'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDiff = Math.round((startOfToday - startOfDate) / 86400000)
  if (dayDiff === 0) return '今天'
  if (dayDiff === 1) return '昨天'
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

const formatTime = (time) => {
  if (!time) return ''
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const loadCurrentUser = () => {
  const userInfo = localStorage.getItem('userInfo')
  if (!userInfo) {
    currentUser.value = { id: null, avatar: DEFAULT_AVATAR }
    return
  }
  try {
    const parsed = JSON.parse(userInfo)
    currentUser.value = { id: parsed.id ?? null, avatar: parsed.avatar || DEFAULT_AVATAR }
  } catch {
    currentUser.value = { id: null, avatar: DEFAULT_AVATAR }
  }
}

const syncCurrentUser = () => loadCurrentUser()

// 点击对方头像跳转到其详情主页
const openProfile = (msg) => {
  if (msg.from_user_id && Number(msg.from_user_id) !== Number(currentUserId.value)) {
    router.push(`/user/${Number(msg.from_user_id)}`)
  }
}

const syncUnreadState = () => {
  window.dispatchEvent(new Event('refreshUnreadBadges'))
  window.dispatchEvent(new Event('refreshConversations'))
}

const handleUserInfoUpdated = () => syncCurrentUser()

const scrollToBottom = (smooth = false) => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      })
    }
  })
}

/** 是否已滚动到底部附近（用于静默刷新时判断是否自动滚底） */
const isNearBottom = () => {
  const el = messagesContainer.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120
}

const fetchMessages = async ({ silent = false } = {}) => {
  if (!props.targetId) return
  if (!silent) loadingHistory.value = true
  const wasNearBottom = isNearBottom()

  try {
    const res = await messageApi.getChat(props.targetId)
    if (res.code === 200) {
      // 增量合并，避免重置滚动位置
      const existingIds = new Set(messages.value.map((m) => m.id))
      const newItems = (res.list || []).filter((m) => !existingIds.has(m.id))
      if (newItems.length > 0) {
        messages.value = [...messages.value, ...newItems]
        if (wasNearBottom || silent) scrollToBottom(silent)
      }

      if (res.list.length > 0) {
        const firstMsg = res.list[0]
        targetUser.value = firstMsg.from_user_id === props.targetId
          ? { nickname: firstMsg.from_nickname, avatar: firstMsg.from_avatar }
          : { nickname: firstMsg.to_nickname, avatar: firstMsg.to_avatar }
      }
      emit('read')
      emit('conversation-read')
      syncUnreadState()
      if (silent) scrollToBottom(false)
    }
  } catch (error) {
    if (!silent) {
      console.error('获取聊天记录失败:', error)
      ElMessage.error('聊天记录加载失败')
    }
  } finally {
    if (!silent) loadingHistory.value = false
  }
}

const sendMessage = async () => {
  if (!inputMessage.value.trim() || !props.targetId || sending.value) return

  const content = inputMessage.value.trim()
  sending.value = true

  // 乐观追加发送中消息
  const tempId = `temp-${Date.now()}`
  messages.value.push({
    id: tempId,
    from_user_id: currentUserId.value,
    to_user_id: props.targetId,
    content,
    create_time: new Date().toISOString(),
    from_avatar: myAvatar.value,
    sending: true,
  })
  inputMessage.value = ''
  scrollToBottom(true)

  try {
    const res = await messageApi.sendMessage({ targetId: props.targetId, content })
    if (res.code === 200) {
      const idx = messages.value.findIndex((m) => m.id === tempId)
      if (idx !== -1) {
        messages.value[idx] = {
          id: res.data.id,
          from_user_id: currentUserId.value,
          to_user_id: props.targetId,
          content,
          create_time: res.data.create_time || new Date().toISOString(),
          from_avatar: myAvatar.value,
          sending: false,
        }
      }
      emit('read')
      emit('conversation-read')
      syncUnreadState()
    } else {
      ElMessage.error(res.msg || '发送失败')
      messages.value = messages.value.filter((m) => m.id !== tempId)
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '发送失败，请重试')
    messages.value = messages.value.filter((m) => m.id !== tempId)
  } finally {
    sending.value = false
    scrollToBottom(true)
  }
}

watch(() => props.targetId, () => {
  messages.value = []
  targetUser.value = null
  fetchMessages()
}, { immediate: true })

// 新消息轮询（30s，静默增量刷新）
let pollTimer = null
const startPolling = () => {
  stopPolling()
  pollTimer = setInterval(() => {
    if (props.targetId && document.visibilityState === 'visible') {
      fetchMessages({ silent: true })
    }
  }, 30000)
}
const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(() => {
  loadCurrentUser()
  currentUserId.value = currentUser.value.id
  window.addEventListener('userInfoUpdated', handleUserInfoUpdated)
  startPolling()
})

onUnmounted(() => {
  window.removeEventListener('userInfoUpdated', handleUserInfoUpdated)
  stopPolling()
})
</script>

<style scoped lang="scss">
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #f8f9fa;
  box-sizing: border-box;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 2;
}

.target-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
}

.target-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2ec4b5;
  box-shadow: 0 0 0 4px rgba(46, 196, 181, 0.15);
}

.messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 20px;
  scroll-behavior: smooth;
}

.date-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px 0 16px;

  span {
    background: #eceff3;
    color: #8a94a6;
    font-size: 12px;
    padding: 3px 14px;
    border-radius: 999px;
  }
}

.list-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 30px 0;
  color: #999;
  font-size: 13px;

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(46, 196, 181, 0.2);
    border-top-color: #2ec4b5;
    border-radius: 50%;
    animation: chat-spin 0.8s linear infinite;
  }
}

@keyframes chat-spin {
  to { transform: rotate(360deg); }
}

.empty-messages {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
}

.message-item {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;

  &.mine {
    flex-direction: row-reverse;

    .msg-content {
      align-items: flex-end;

      .msg-text {
        background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
        color: #fff;
        border-radius: 16px 16px 4px 16px;
      }
    }
  }
}

.msg-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.msg-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 60%;
}

.msg-text {
  background: #fff;
  padding: 12px 16px;
  border-radius: 16px 16px 16px 4px;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  word-break: break-word;
}

.msg-time {
  font-size: 11px;
  color: #999;

  .sending-tag {
    color: #2ec4b5;
  }
}

.input-area {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.98);
  border-top: 1px solid #e8e8e8;
  flex-shrink: 0;
  box-sizing: border-box;
  position: sticky;
  bottom: 0;
  z-index: 2;
  backdrop-filter: blur(10px);
  box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.04);
}

.msg-input {
  flex: 1;
  height: 40px;
  box-sizing: border-box;
  padding: 0 16px;
  border: 1px solid #e8e8e8;
  border-radius: 20px;
  font-size: 14px;
  outline: none;
  line-height: 40px;

  &:focus {
    border-color: #2ec4b5;
  }

  &:disabled {
    background: #f5f5f5;
    color: #999;
  }
}

.send-btn {
  height: 40px;
  padding: 0 20px;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: scale(1.03);
    box-shadow: 0 2px 8px rgba(46, 196, 181, 0.4);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
