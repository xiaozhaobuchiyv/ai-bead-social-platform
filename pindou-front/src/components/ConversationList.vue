<template>
  <div class="conversation-list">
    <div v-if="loading && conversations.length === 0" class="list-loading">
      <span class="spinner"></span> 加载中...
    </div>

    <div 
      v-for="conv in conversations" 
      :key="conv.target_id"
      class="conversation-item"
      :class="{ active: activeId === conv.target_id }"
      @click="selectConversation(conv.target_id)"
    >
      <SkeletonAvatar :src="conv.avatar ? formatAvatar(conv.avatar) : ''" :name="conv.nickname || '用户'" :size="44" />
      <div class="conv-info">
        <div class="conv-name">
          {{ conv.nickname }}
          <span v-if="conv.unread_count > 0" class="unread-badge">{{ conv.unread_count > 99 ? '99+' : conv.unread_count }}</span>
        </div>
        <div class="conv-preview">{{ conv.last_message }}</div>
      </div>
      <div class="conv-meta">
        <span class="conv-time">{{ formatTime(conv.last_time) }}</span>
      </div>
    </div>
    
    <div v-if="!loading && conversations.length === 0" class="empty-conversations">
      <div class="empty-icon"><el-icon :size="48" color="#c0c8d0"><ChatDotRound /></el-icon></div>
      <p>暂无消息</p>
      <p class="empty-hint">去首页给喜欢的笔记作者发私信吧~</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import { messageApi } from '@/api'
import SkeletonAvatar from '@/components/SkeletonAvatar.vue'
import { refreshUnreadBadges } from '@/composables/useUnreadBadges'

const props = defineProps({
  selectedId: {
    type: [Number, String],
    default: null
  }
})

const emit = defineEmits(['select', 'unread-change'])

const conversations = ref([])
const activeId = ref(null)
const loading = ref(false)

const formatAvatar = (avatar) => {
  if (!avatar) return 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'
  if (avatar.startsWith('/')) return `${import.meta.env.VITE_API_BASE || 'http://localhost:3000'}${avatar}`
  return avatar
}

// 会话时间：今天显示 HH:mm，昨天显示"昨天"，更早显示 M-D，跨年显示 YYYY-M-D
const formatTime = (time) => {
  if (!time) return ''
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const pad = (n) => String(n).padStart(2, '0')

  const dayDiff = Math.round((startOfToday - startOfDate) / 86400000)
  if (dayDiff === 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (dayDiff === 1) return '昨天'
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}-${date.getDate()}`
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

const fetchConversations = async () => {
  loading.value = true
  try {
    const res = await messageApi.getConversations()
    if (res.code === 200) {
      conversations.value = res.list
      emit('unread-change', conversations.value.some(conv => Number(conv.unread_count) > 0))
    }
  } catch (error) {
    console.error('获取会话列表失败:', error)
  } finally {
    loading.value = false
  }
}

const selectConversation = async (id) => {
  activeId.value = id
  emit('select', id)
  await fetchConversations()
  await refreshUnreadBadges()
}

const handleRefreshConversations = () => fetchConversations()

watch(() => props.selectedId, async (val) => {
  if (val) {
    activeId.value = val
    await fetchConversations()
  }
})

onMounted(async () => {
  await fetchConversations()
  await refreshUnreadBadges()
  window.addEventListener('refreshConversations', handleRefreshConversations)
})

onBeforeUnmount(() => {
  window.removeEventListener('refreshConversations', handleRefreshConversations)
})
</script>

<style scoped lang="scss">
.conversation-list {
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.conversation-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: #f5f5f5;
  }
  
  &.active {
    background: #e8f8f5;
    border-left: 3px solid #2ec4b5;
  }
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.conv-info {
  flex: 1;
  min-width: 0;
}

.conv-name {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.conv-preview {
  font-size: 13px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 4px;
}

.conv-meta {
  text-align: right;
  flex-shrink: 0;
}

.conv-time {
  font-size: 12px;
  color: #b0b8c4;
  white-space: nowrap;
}

.unread-badge {
  display: inline-block;
  min-width: 18px;
  background: #ff4757;
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 500;
  margin-left: 6px;
  vertical-align: middle;
  text-align: center;
}

.list-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: #999;
  font-size: 13px;

  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(46, 196, 181, 0.2);
    border-top-color: #2ec4b5;
    border-radius: 50%;
    animation: conv-spin 0.8s linear infinite;
  }
}

@keyframes conv-spin {
  to { transform: rotate(360deg); }
}

.empty-conversations {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;

  .empty-hint {
    font-size: 12px;
    color: #c0c8d0;
    margin-top: 4px;
  }
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-conversations p {
  font-size: 14px;
  color: #999;
}
</style>