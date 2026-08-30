<template>
  <div class="notice-container">
    <div class="notice-header">
      <div class="notice-tabs">
        <div
          v-for="tab in noticeTabs"
          :key="tab.id"
          class="notice-tab"
          :class="{ active: activeType === tab.id }"
          @click="activeType = tab.id"
        >
          {{ tab.label }}
        </div>
      </div>
      <button class="mark-all-btn" v-if="unreadCount > 0" @click="markAllAsRead">
        全部已读
      </button>
    </div>

    <div class="notice-content">
      <div v-if="loading" class="loading">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>

      <div v-else-if="filteredNotices.length === 0" class="empty-state">
        <el-icon class="empty-icon" :size="56"><Bell /></el-icon>
        <p>暂无通知</p>
      </div>

      <div v-else class="notice-list">
        <div
          class="notice-item"
          :class="{ unread: !notice.is_read }"
          v-for="notice in filteredNotices"
          :key="notice.id"
          @click="handleNoticeClick(notice)"
        >
          <SkeletonAvatar :src="notice.from_avatar ? formatAvatar(notice.from_avatar) : ''" :name="notice.from_nickname || notice.nickname || '用户'" :size="40" />

          <div class="n-main">
            <div class="n-head">
              <span class="n-name">{{ notice.from_nickname || '某用户' }}</span>
              <span class="n-action">{{ getActionText(notice.type) }}</span>
              <span class="n-time">{{ formatTime(notice.create_time) }}</span>
            </div>

            <div class="n-body" v-if="getBodyText(notice)">{{ getBodyText(notice) }}</div>

            <div class="n-quote" v-if="(notice.type === 'comment' || notice.type === 'mention') && notice.note_title">
              <span class="quote-label">来自笔记</span>{{ notice.note_title }}
            </div>

            <div class="n-actions" v-if="notice.type === 'comment' || notice.type === 'mention'">
              <button class="n-btn" @click.stop="startReply(notice)">回复</button>
              <button
                class="n-btn n-like"
                :class="{ active: isNoticeLiked(notice) }"
                @click.stop="toggleNoticeLike(notice)"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" :fill="isNoticeLiked(notice) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.3C7.4 17.7 3.5 14.4 3.5 10.2c0-2.6 2-4.6 4.6-4.6 1.5 0 2.9.8 3.9 2.1 1-1.3 2.4-2.1 3.9-2.1 2.6 0 4.6 2 4.6 4.6 0 4.2-3.9 7.5-8.5 10.1z"/></svg>
              </button>
            </div>

            <!-- 内联回复框（点击「回复」后出现） -->
            <div class="n-reply-row" v-if="replyTargetId === notice.id" @click.stop>
              <div class="n-reply-input-wrap">
                <input
                  v-model="replyText"
                  type="text"
                  class="n-reply-input"
                  :placeholder="`回复 ${notice.from_nickname || '用户'}`"
                  @keyup.enter="sendReply(notice)"
                />
              </div>
              <button class="n-reply-send" :disabled="!replyText.trim()" @click="sendReply(notice)">发送</button>
              <button class="n-reply-cancel" @click.stop="cancelReply">取消</button>
            </div>
          </div>

          <div class="n-side">
            <button
              v-if="notice.type === 'follow'"
              class="follow-btn"
              :class="{ followed: notice.followed }"
              @click.stop="handleFollow(notice)"
            >
              {{ notice.followed ? '取消关注' : '关注' }}
            </button>
            <img
              v-else-if="notice.note_cover"
              class="n-cover"
              :src="resolveMediaUrl(notice.note_cover)"
              alt=""
            />
            <span class="unread-dot" v-if="!notice.is_read"></span>
          </div>
        </div>

        <div class="list-footer">— THE END —</div>
      </div>
    </div>

    <NoteDetailCard
      :show="showDetailModal"
      :note-id="selectedNoteId"
      :initial-comment-id="selectedCommentId"
      @close="closeDetailModal"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { noticeApi, followApi, commentApi } from '@/api'
import { ElMessage } from 'element-plus'
import NoteDetailCard from '@/components/NoteDetailCard.vue'
import { refreshUnreadBadges } from '@/composables/useUnreadBadges'
import { formatAvatar, resolveMediaUrl } from '@/utils/media'
import SkeletonAvatar from '@/components/SkeletonAvatar.vue'

const router = useRouter()

const noticeTabs = [
  { id: 'comment', label: '评论和@' },
  { id: 'collect', label: '赞和收藏' },
  { id: 'follow', label: '新增关注' }
]

const notices = ref([])
const loading = ref(true)
const selectedNoteId = ref(null)
const selectedCommentId = ref(null)
const showDetailModal = ref(false)
const activeType = ref('comment')

// 内联回复 + 点赞状态（点赞的是「通知里那条评论」，与评论区一致为前端切换）
const replyTargetId = ref(null)
const replyText = ref('')

const unreadCount = computed(() => notices.value.filter(n => !n.is_read).length)
// 赞和收藏 = like + collect；评论和@ = comment + mention；新增关注 = follow
const filteredNotices = computed(() => {
  if (activeType.value === 'comment') return notices.value.filter(n => n.type === 'comment' || n.type === 'mention')
  if (activeType.value === 'follow') return notices.value.filter(n => n.type === 'follow')
  if (activeType.value === 'collect') return notices.value.filter(n => n.type === 'like' || n.type === 'collect')
  return notices.value
})

const fetchNotices = async () => {
  loading.value = true
  try {
    const res = await noticeApi.getNoticeList()
    if (res.code === 200) {
      notices.value = res.list
      await applyFollowState()
    }
  } catch (error) {
    console.error('获取通知失败:', error)
  } finally {
    loading.value = false
  }
}

const isNoticeLiked = (notice) => !!notice.liked

// 点赞 / 取消点赞：「点赞的是通知里那条评论」（前后端联调：乐观切换 + 调后端持久化）
const toggleNoticeLike = async (notice) => {
  if (!notice.comment_id) return
  const token = localStorage.getItem('token')
  if (!token) {
    window.dispatchEvent(new Event('showLoginModal'))
    return
  }
  const prev = !!notice.liked
  const prevCount = Number(notice.like_count || 0)
  notice.liked = !prev
  notice.like_count = Math.max(0, prevCount + (notice.liked ? 1 : -1))
  try {
    const res = await commentApi.likeComment(notice.comment_id)
    if (res.code === 200) {
      notice.liked = !!res.liked
      notice.like_count = Number(res.like_count ?? notice.like_count)
    } else {
      notice.liked = prev
      notice.like_count = prevCount
    }
  } catch (error) {
    notice.liked = prev
    notice.like_count = prevCount
  }
}

// 开始内联回复
const startReply = (notice) => {
  replyTargetId.value = notice.id
  replyText.value = ''
  if (!notice.is_read) {
    notice.is_read = 1
    noticeApi.markAsRead(notice.id).catch(() => {})
  }
}

const cancelReply = () => {
  replyTargetId.value = null
  replyText.value = ''
}

// 发送内联回复（作为该评论的回复）
const sendReply = async (notice) => {
  const content = replyText.value.trim()
  if (!content) return
  const token = localStorage.getItem('token')
  if (!token) {
    window.dispatchEvent(new Event('showLoginModal'))
    return
  }
  try {
    const res = await commentApi.addComment({
      noteId: notice.note_id,
      content,
      replyTo: notice.comment_id || null,
    })
    if (res.code === 200) {
      ElMessage.success('回复成功')
      replyText.value = ''
      replyTargetId.value = null
      await fetchNotices()
    } else {
      ElMessage.error(res.msg || '回复失败')
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '回复失败')
  }
}

// 初始化「已关注」状态：用我的关注列表标记每条关注通知
const applyFollowState = async () => {
  const token = localStorage.getItem('token')
  if (!token) return
  try {
    const fRes = await followApi.getMyFollows()
    const followIds = new Set(
      (fRes.list || [])
        .map((u) => Number(u.id ?? u.followee_id ?? u.user_id))
        .filter(Boolean)
    )
    notices.value.forEach((n) => {
      if (n.type === 'follow') n.followed = followIds.has(Number(n.from_user_id))
    })
  } catch (error) {
    console.error('获取关注状态失败:', error)
  }
}

const getActionText = (type) => {
  switch (type) {
    case 'like': return '赞了你的笔记'
    case 'collect': return '收藏了你的笔记'
    case 'comment': return '评论了你的笔记'
    // 正文（notice.content）本身以「@昵称」开头，避免动作文案与正文出现两个 @
    case 'mention': return '提到了你'
    case 'follow': return '开始关注你了'
    default: return '与你互动'
  }
}

// 关注 / 互相关注：切换关注状态
const handleFollow = async (notice) => {
  try {
    const token = localStorage.getItem('token')
    if (!token) {
      window.dispatchEvent(new Event('showLoginModal'))
      return
    }
    const res = await followApi.toggleFollow(notice.from_user_id)
    if (res.code === 200) {
      notice.followed = !!res.isFollowing
      ElMessage.success(res.isFollowing ? '已关注' : '已取消关注')
      window.dispatchEvent(new Event('refreshUnreadBadges'))
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '操作失败')
  }
}

const getBodyText = (notice) => {
  if (notice.type === 'comment') return notice.content || ''
  if (notice.type === 'follow') return ''
  return notice.content || ''
}

const formatTime = (time) => {
  if (!time) return ''
  const date = new Date(time)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const syncUnreadState = async () => {
  await refreshUnreadBadges()
  window.dispatchEvent(new Event('refreshUnreadBadges'))
}

const markAllLocalAsRead = () => {
  notices.value.forEach(n => { n.is_read = 1 })
}

const handleNoticeClick = async (notice) => {
  if (!notice.is_read) {
    await noticeApi.markAsRead(notice.id)
    notice.is_read = 1
    await syncUnreadState()
  }

  if (notice.type === 'follow' && notice.from_user_id) {
    router.push(`/user/${Number(notice.from_user_id)}`)
    return
  }

  selectedCommentId.value = null
  if (notice.note_id) {
    selectedNoteId.value = Number(notice.note_id)
    selectedCommentId.value = Number(notice.comment_id || 0) || null
    showDetailModal.value = true
  }
}

const markAllAsRead = async () => {
  try {
    const res = await noticeApi.markAllAsRead()
    if (res.code === 200) {
      markAllLocalAsRead()
      ElMessage.success('已全部标记为已读')
      await syncUnreadState()
    }
  } catch (error) {
    console.error('标记已读失败:', error)
  }
}

const closeDetailModal = () => {
  showDetailModal.value = false
  selectedNoteId.value = null
}

const onRefreshUnreadBadges = async () => {
  await fetchNotices()
}

const onOpenAuthorCard = (event) => {
  const authorId = event?.detail?.authorId
  if (authorId) {
    router.push(`/user/${Number(authorId)}`)
  }
}

onMounted(async () => {
  await fetchNotices()
  window.addEventListener('refreshUnreadBadges', onRefreshUnreadBadges)
  window.addEventListener('openAuthorCard', onOpenAuthorCard)
})

onUnmounted(() => {
  window.removeEventListener('refreshUnreadBadges', onRefreshUnreadBadges)
  window.removeEventListener('openAuthorCard', onOpenAuthorCard)
})
</script>

<style scoped lang="scss">
.notice-container {
  min-height: 100vh;
  background: #fff;
}

.notice-header {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #f0f1f3;
}

.notice-tabs {
  display: flex;
  gap: 8px;
}

.notice-tab {
  font-size: 15px;
  color: #667085;
  cursor: pointer;
  padding: 16px 14px;
  position: relative;
  transition: color 0.2s ease;

  &.active {
    color: #111;
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      width: 24px;
      height: 3px;
      background: #2ec4b5;
      border-radius: 3px;
    }
  }

  &:hover:not(.active) {
    color: #2ec4b5;
  }
}

.mark-all-btn {
  background: #fff;
  color: #2ec4b5;
  border: 1px solid rgba(46, 196, 181, 0.35);
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #eefbf8;
  }
}

.notice-content {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 16px 24px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: #94a3b8;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #eef2f7;
  border-top-color: #2ec4b5;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 0;
  color: #94a3b8;
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 18px;
}

.empty-state p {
  font-size: 15px;
}

.notice-list {
  display: flex;
  flex-direction: column;
}

.notice-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 20px 4px;
  border-bottom: 1px solid #f0f1f3;
  cursor: pointer;
  transition: background 0.18s ease;

  &:hover {
    background: #fafbfc;
  }
}

.n-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.n-main {
  flex: 1;
  min-width: 0;
}

.n-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.n-name {
  font-size: 15px;
  font-weight: 700;
  color: #111;
}

.n-action {
  font-size: 13px;
  color: #7d8796;
}

.n-time {
  font-size: 12px;
  color: #b0b8c4;
}

.n-body {
  font-size: 14px;
  color: #333;
  line-height: 1.6;
  margin-bottom: 8px;
  word-break: break-word;
}

.n-quote {
  font-size: 13px;
  color: #7d8796;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  .quote-label {
    color: #b0b8c4;
    margin-right: 6px;
  }
}

.n-actions {
  display: flex;
  gap: 10px;
}

.n-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #fff;
  color: #2ec4b5;
  border: 1px solid rgba(46, 196, 181, 0.35);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    background: #eefbf8;
    border-color: rgba(46, 196, 181, 0.5);
  }
}

/* 通知里的点赞按钮（默认中性描边，点赞后为主题色） */
.n-btn.n-like {
  width: 36px;
  padding: 5px 0;
  justify-content: center;
  color: #64748b;
  border-color: #e4e6e9;

  svg {
    display: block;
  }

  &:hover {
    color: #2ec4b5;
    border-color: rgba(46, 196, 181, 0.4);
  }

  &.active {
    color: #2ec4b5;
    border-color: rgba(46, 196, 181, 0.35);
    background: rgba(46, 196, 181, 0.08);
  }
}

/* 内联回复框 */
.n-reply-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;

  .n-reply-input-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    background: #f5f6f8;
    border: 1px solid #eceef1;
    border-radius: 999px;
    padding: 4px 10px;

    .n-reply-input {
      flex: 1;
      min-width: 0;
      height: 30px;
      border: none;
      outline: none;
      background: transparent;
      font-size: 14px;
      color: #111;
    }
  }

  .n-reply-send {
    flex-shrink: 0;
    height: 34px;
    padding: 0 18px;
    border: none;
    border-radius: 999px;
    background: #2ec4b5;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      opacity: 0.9;
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  .n-reply-cancel {
    flex-shrink: 0;
    height: 34px;
    padding: 0 16px;
    border: 1px solid #eceef1;
    border-radius: 999px;
    background: #fff;
    color: #333;
    font-size: 14px;
    cursor: pointer;

    &:hover {
      background: #f5f6f7;
    }
  }
}

.n-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

/* 关注 / 已关注 按钮（主题色青绿） */
.follow-btn {
  min-width: 76px;
  height: 34px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  align-self: flex-end;

  &:hover {
    opacity: 0.92;
    transform: translateY(-1px);
  }

  &.followed {
    background: #eefbf8;
    color: #0f766e;
    border: 1px solid rgba(46, 196, 181, 0.4);
  }
}

.n-cover {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  object-fit: cover;
  background: #f3f4f6;
}

.unread-dot {
  width: 8px;
  height: 8px;
  background: #2ec4b5;
  border-radius: 50%;
}

.list-footer {
  text-align: center;
  color: #b0b8c4;
  font-size: 13px;
  padding: 32px 0 12px;
  letter-spacing: 2px;
}

@media (max-width: 768px) {
  .notice-tabs {
    flex-wrap: wrap;
  }

  .notice-tab {
    padding: 12px 10px;
  }

  .n-cover {
    width: 56px;
    height: 56px;
  }
}
</style>
