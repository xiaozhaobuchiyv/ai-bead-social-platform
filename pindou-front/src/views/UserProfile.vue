<template>
  <div class="user-profile">
    <!-- 加载 -->
    <div v-if="loading" class="page-loading">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <template v-else-if="user">
      <!-- 顶部资料 -->
      <div class="p-header">
        <img :src="formatAvatar(user.avatar)" alt="头像" class="p-avatar" />
        <div class="p-info">
          <div class="p-name">{{ user.nickname || user.username || '用户' }}</div>
          <div class="p-id">品号: {{ user.id ? (10000000 + parseInt(user.id)) : '-' }}<template v-if="user.region"> · IP属地：{{ user.region }}</template></div>
          <div class="p-bio">{{ user.signature || '这个人很神秘，什么都没有写~' }}</div>
          <div class="p-stats">
            <span class="stat"><b>{{ stats.works }}</b> 作品</span>
            <span class="stat"><b>{{ stats.follows }}</b> 关注</span>
            <span class="stat"><b>{{ stats.fans }}</b> 粉丝</span>
            <span class="stat"><b>{{ stats.likes }}</b> 获赞与收藏</span>
          </div>
        </div>
        <template v-if="!isSelf">
          <button class="p-follow" :class="{ followed: isFollowing }" @click="toggleFollow">
            {{ isFollowing ? '取消关注' : '关注' }}
          </button>
        </template>
      </div>

      <!-- Tab -->
      <div class="p-tabs">
        <div class="p-tab active">笔记</div>
      </div>

      <!-- 笔记瀑布流 -->
      <div class="p-content">
        <div v-if="notesLoading" class="loading">
          <div class="loading-spinner"></div>
          <span>加载中...</span>
        </div>
        <div v-else-if="notes.length === 0" class="empty-state">
          <p>TA 还没有发布任何内容哦</p>
        </div>
        <div v-else class="notes-waterfall">
          <div class="note-card" v-for="note in notes" :key="note.id" @click="openDetail(note.id)">
            <div class="note-image-wrapper">
              <video
                v-if="note.videoUrl"
                :src="note.videoUrl"
                class="note-image video-cover"
                muted
                playsinline
                preload="auto"
                autoplay
                @loadeddata="holdFirstFrame"
              ></video>
              <img v-else :src="note.coverImage" :alt="note.title" class="note-image" loading="lazy" />
              <div v-if="note.videoUrl" class="video-badge"><svg class="play-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
            </div>
            <div class="note-info">
              <p class="note-title">{{ note.description }}</p>
              <div class="note-stats">
                <span class="stat-like" :class="{ liked: note.liked }">
                  <svg viewBox="0 0 24 24" width="14" height="14" :fill="note.liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.3C7.4 17.7 3.5 14.4 3.5 10.2c0-2.6 2-4.6 4.6-4.6 1.5 0 2.9.8 3.9 2.1 1-1.3 2.4-2.1 3.9-2.1 2.6 0 4.6 2 4.6 4.6 0 4.2-3.9 7.5-8.5 10.1z"/></svg>
                  {{ formatNumber(note.likes) }}
                </span>
                <span class="stat-collect" :class="{ collected: note.collected }">
                  <svg viewBox="0 0 24 24" width="14" height="14" :fill="note.collected ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>
                  {{ formatNumber(note.collects) }}
                </span>
                <span class="stat-comment"><el-icon><ChatDotRound /></el-icon> {{ formatNumber(note.commentCount) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="empty-state">用户不存在</div>

    <NoteDetailCard
      :show="showDetailModal"
      :note-id="selectedNoteId"
      @close="showDetailModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { userApi, noteApi, followApi } from '@/api'
import { formatAvatar, resolveMediaUrl, parseImagesJson } from '@/utils/media'
import { ElMessage } from 'element-plus'
import NoteDetailCard from '@/components/NoteDetailCard.vue'

const route = useRoute()
const router = useRouter()

const userId = Number(route.params.id)
const user = ref(null)
const stats = ref({ works: 0, follows: 0, fans: 0, likes: 0 })
const isFollowing = ref(false)
const loading = ref(true)
const notes = ref([])
const notesLoading = ref(true)

const selectedNoteId = ref(null)
const showDetailModal = ref(false)

const currentUserId = computed(() => {
  try { return Number(JSON.parse(localStorage.getItem('userInfo') || '{}').id) } catch { return null }
})
const isSelf = computed(() => !!currentUserId.value && Number(userId) === currentUserId.value)

const formatNumber = (n) => (Number(n) >= 10000 ? `${(Number(n) / 10000).toFixed(1)}w` : String(Number(n) || 0))
const normalizeBoolean = (v) => v === true || v === 1 || v === '1' || v === 'true'

const mapNote = (item) => {
  const imgs = parseImagesJson(item.images)
  return {
    id: item.id,
    title: item.title,
    description: item.content,
    coverImage: imgs.length ? resolveMediaUrl(imgs[0]) : 'https://images.unsplash.com/photo-1504753793650-d4a2b783c15e?w=400',
    videoUrl: resolveMediaUrl(item.video || item.video_url || ''),
    likes: Number(item.likes || 0),
    collects: Number(item.collects || 0),
    commentCount: Number(item.comment_count || 0),
    liked: normalizeBoolean(item.liked),
    collected: normalizeBoolean(item.collected),
  }
}

const fetchProfile = async () => {
  loading.value = true
  try {
    const res = await userApi.getOtherUserInfo(userId)
    if (res.code === 200) {
      user.value = res.user
      stats.value = { works: res.works, follows: res.following, fans: res.followers, likes: res.likes }
      isFollowing.value = !!res.isFollowing
    } else if (res.code === 404) {
      user.value = null
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
  } finally {
    loading.value = false
  }
}

const fetchNotes = async () => {
  notesLoading.value = true
  try {
    const res = await noteApi.getAuthorNotes(userId)
    if (res.code === 200) {
      notes.value = (res.list || []).map(mapNote)
    }
  } catch (error) {
    console.error('获取作品失败:', error)
  } finally {
    notesLoading.value = false
  }
}

const toggleFollow = async () => {
  const token = localStorage.getItem('token')
  if (!token) {
    window.dispatchEvent(new Event('showLoginModal'))
    return
  }
  try {
    const res = await followApi.toggleFollow(userId)
    if (res.code === 200) {
      isFollowing.value = !!res.isActive
      stats.value.fans += isFollowing.value ? 1 : -1
      ElMessage.success(isFollowing.value ? '已关注' : '已取消关注')
    } else {
      ElMessage.error(res.msg || '操作失败')
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '操作失败')
  }
}

const openDetail = (id) => {
  selectedNoteId.value = id
  showDetailModal.value = true
}

const holdFirstFrame = (event) => {
  const video = event.target
  if (!video) return
  try {
    video.pause()
    video.currentTime = 0.01
  } catch {
    // ignore
  }
}

onMounted(() => {
  fetchProfile()
  fetchNotes()
})
</script>

<style scoped lang="scss">
.user-profile {
  min-height: 100vh;
  background: #fff;
}

.page-loading,
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
@keyframes spin { to { transform: rotate(360deg); } }

.p-header {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 24px 28px;
  display: flex;
  align-items: center;
  gap: 24px;
  position: relative;
  border-bottom: 1px solid #f0f1f3;
}

.p-avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.p-info {
  flex: 1;
  min-width: 0;
}

.p-name {
  font-size: 22px;
  font-weight: 700;
  color: #111;
  margin-bottom: 6px;
}

.p-id {
  font-size: 13px;
  color: #7d8796;
  margin-bottom: 10px;
}

.p-bio {
  font-size: 14px;
  color: #475569;
  margin-bottom: 12px;
}

.p-stats {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #7d8796;

  b {
    color: #111;
    font-weight: 700;
  }
}

.p-follow {
  position: absolute;
  top: 40px;
  right: 24px;
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
  transition: all 0.2s;

  &:hover { opacity: 0.92; }

  &.followed {
    background: #eefbf8;
    color: #0f766e;
    border: 1px solid rgba(46, 196, 181, 0.4);
  }
}

.p-tabs {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #f0f1f3;
}

.p-tab {
  font-size: 15px;
  color: #667085;
  cursor: pointer;
  padding: 14px 4px;
  position: relative;

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
}

.p-content {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px 24px 40px;
}

.empty-state {
  text-align: center;
  padding: 80px 0;
  color: #94a3b8;
}

.notes-waterfall {
  columns: 5;
  column-gap: 14px;
}

@media (max-width: 1400px) {
  .notes-waterfall { columns: 4; }
}
@media (max-width: 1100px) {
  .notes-waterfall { columns: 3; }
}
@media (max-width: 760px) {
  .notes-waterfall { columns: 2; }
  .p-content { padding: 16px 14px 32px; }
}

.note-card {
  break-inside: avoid;
  margin-bottom: 16px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  transition: all 0.2s;

  &:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1); }
}

.note-image-wrapper {
  position: relative;
  overflow: hidden;
}

.note-image {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
  background: #f3f4f6;
}

.video-cover {
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  background: #f3f4f6;
  display: block;
  pointer-events: none;
}

.video-badge {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  .play-icon { font-size: 10px; }
}

.note-info {
  padding: 12px 14px;
}

.note-title {
  font-size: 14px;
  color: #333;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.note-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: #94a3b8;

  > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .stat-like.liked {
    color: #ff2442;
  }

  .stat-collect.collected {
    color: #ffd700;
  }
}
</style>
