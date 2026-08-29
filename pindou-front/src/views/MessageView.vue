<template>
  <div class="message-page">
    <div class="message-container">
      <div class="conversation-panel">
        <div class="panel-header">
          <h2>消息</h2>
          <button class="clear-all-btn" @click="clearAllUnread">全部已读</button>
        </div>
        <ConversationList
          :selected-id="selectedId"
          @select="selectConversation"
        />
      </div>
      
      <div class="chat-panel">
        <ChatWindow
          v-if="selectedId"
          :target-id="selectedId"
          @read="handleMessageRead"
          @conversation-read="handleConversationRead"
        />
        <div v-else class="empty-panel">
          <div class="empty-icon"><el-icon :size="56" color="#94a3b8"><ChatDotRound /></el-icon></div>
          <p>选择一个会话开始聊天</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import ConversationList from '@/components/ConversationList.vue'
import ChatWindow from '@/components/ChatWindow.vue'
import { messageApi } from '@/api'
import { refreshUnreadBadges } from '@/composables/useUnreadBadges'

const selectedId = ref(null)

const syncUnreadState = async () => {
  await refreshUnreadBadges()
  window.dispatchEvent(new Event('refreshUnreadBadges'))
  window.dispatchEvent(new Event('refreshConversations'))
}

const selectConversation = async (id) => {
  selectedId.value = id
}

const handleMessageRead = async () => {
  await syncUnreadState()
}

const handleConversationRead = async () => {
  await syncUnreadState()
}

const clearAllUnread = async () => {
  try {
    const res = await messageApi.clearUnread()
    if (res.code === 200) {
      ElMessage.success('已清理全部未读消息')
      await syncUnreadState()
    }
  } catch (error) {
    console.error('清理未读消息失败:', error)
  }
}

onMounted(() => {
  document.body.classList.add('message-view-active')
})

onUnmounted(() => {
  document.body.classList.remove('message-view-active')
})
</script>

<style scoped lang="scss">
.message-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: #f7f8fa;
}

.message-container {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
  gap: 16px;
  padding: 16px;
  box-sizing: border-box;
}

.conversation-panel,
.chat-panel {
  background: #fff;
  border: 1px solid #eef0f2;
  border-radius: 12px;
  overflow: hidden;
  min-height: 0;
}

.conversation-panel {
  width: 340px;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 20px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(249,250,251,0.9));
  
  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
  }
}

.clear-all-btn {
  border: none;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  color: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 8px 16px rgba(46, 196, 181, 0.18);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 18px rgba(46, 196, 181, 0.24);
  }
}

.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.empty-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at top, rgba(46,196,181,0.08), transparent 55%), #fff;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.empty-panel p {
  font-size: 16px;
  color: #94a3b8;
}

@media (max-width: 900px) {
  .message-container {
    flex-direction: column;
  }

  .conversation-panel {
    width: 100%;
    height: 360px;
  }
}
</style>