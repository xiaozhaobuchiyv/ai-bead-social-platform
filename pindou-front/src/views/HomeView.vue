<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { noteApi, actionApi, collectionApi, followApi } from '@/api'
import NoteDetailCard from '@/components/NoteDetailCard.vue'
import SkeletonImage from '@/components/SkeletonImage.vue'
import SkeletonAvatar from '@/components/SkeletonAvatar.vue'
import { parseImagesJson, resolveMediaUrl, formatAvatar } from '@/utils/media'

const route = useRoute()
const router = useRouter()

// 笔记数据
const notes = ref([])
const loading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(true)
const page = ref(1)
const pageSize = ref(15)
const searchKeyword = computed(() => (route.query.q || '').toString().trim())
const isSearchMode = computed(() => searchKeyword.value.length > 0)
const followedAuthorIds = ref(new Set())
const filteredNotes = computed(() => {
  if (!isSearchMode.value) return notes.value
  const keyword = searchKeyword.value.toLowerCase()
  return notes.value.filter((item) => {
    const title = (item.title || '').toLowerCase()
    const description = (item.description || '').toLowerCase()
    const authorName = (item.authorName || '').toLowerCase()
    // 分类为逗号拼接的话题，如「手作,拼豆」，做模糊包含匹配
    const category = (item.category || '').toLowerCase()
    return title.includes(keyword) || description.includes(keyword) || authorName.includes(keyword) || category.includes(keyword)
  })
})

const highlightText = (text) => {
  if (!isSearchMode.value) return text || ''
  const source = (text || '').toString()
  const keyword = searchKeyword.value
  if (!keyword) return source

  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.replace(new RegExp(`(${escaped})`, 'ig'), '<mark class="search-highlight">$1</mark>')
}

// 瀑布列数（仅骨架屏展示用；真实瀑布流使用 CSS columns 自适应）
const columnCount = ref(3)

// 笔记详情弹窗
const showDetailModal = ref(false)
const selectedNoteId = ref(null)
const selectedNoteData = ref(null)

// 笔记图片数量（多图角标）
const noteImageCount = (item) => {
  const n = parseImagesJson(item.images || '[]').length
  return n > 1 ? n : 0
}

// 视频首帧定格，作为卡片封面（autoplay 解码后立即暂停并回到首帧）
const holdFirstFrame = (event) => {
  const video = event.target
  if (!video) return
  try {
    video.pause()
    video.currentTime = 0.01
  } catch {
    // 忽略 seek 失败
  }
}

// 无限滚动：接近底部自动加载下一页（节流 200ms）
let scrollThrottleTimer = null
const onWindowScroll = () => {
  if (scrollThrottleTimer) return
  scrollThrottleTimer = setTimeout(() => {
    scrollThrottleTimer = null
    const doc = document.documentElement
    const nearBottom = doc.scrollTop + window.innerHeight >= doc.scrollHeight - 600
    if (nearBottom) {
      loadMore()
    }
  }, 200)
}

const mapNoteItem = (item) => {
  const imagesArray = parseImagesJson(item.images)
  const coverImage = imagesArray.length > 0
    ? resolveMediaUrl(imagesArray[0])
    : ''

  const likedValue = item.liked ?? item.is_liked ?? item.like_status ?? item.likeStatus ?? false
  const collectedValue = item.collected ?? item.is_collected ?? item.collection_status ?? item.collectionStatus ?? false
  const collects = Number(item.collects ?? item.collections ?? item.collection_count ?? 0)
  const commentCount = Number(item.comment_count ?? item.comments ?? 0)

  return {
    id: item.id,
    userId: item.user_id,
    title: item.title,
    description: item.content,
    category: item.category || '',
    coverImage: coverImage,
    videoUrl: resolveMediaUrl(item.video || item.video_url || item.videoUrl || ''),
    authorAvatar: formatAvatar(item.avatar),
    authorAvatarRaw: item.avatar || '',
    authorName: item.nickname || '用户',
    likes: Number(item.likes || 0),
    collects,
    commentCount,
    liked: likedValue === true || likedValue === 1 || likedValue === '1' || likedValue === 'true',
    collected: collectedValue === true || collectedValue === 1 || collectedValue === '1' || collectedValue === 'true',
    followed: followedAuthorIds.value.has(Number(item.user_id)),
    height: 280 + Math.random() * 100
  }
}

// 获取笔记列表（游标分页）
const cursor = ref(null)
const fetchNotes = async (reset = false) => {
  if (reset) {
    page.value = 1
    cursor.value = null
    hasMore.value = true
    notes.value = []
  }

  if (page.value === 1) {
    loading.value = true
  } else {
    loadingMore.value = true
  }

  try {
    const listParams = {
      pageSize: 15,
      ...(cursor.value ? { cursor: cursor.value } : {}),
      ...(isSearchMode.value ? { q: searchKeyword.value } : {})
    }
    const [notesRes, likesRes, collectionsRes] = await Promise.all([
      // 搜索模式走服务端搜索接口（标题/内容/分类/作者 模糊匹配 + 游标分页），
      // 普通模式走 Feed 列表
      isSearchMode.value ? noteApi.searchNotes(listParams) : noteApi.getNotesList(listParams),
      checkLogin() ? collectionApi.getLikes() : Promise.resolve({ code: 200, list: [] }),
      checkLogin() ? collectionApi.getCollections() : Promise.resolve({ code: 200, list: [] })
    ])

    if (checkLogin()) {
      try {
        const followRes = await followApi.getMyFollows()
        followedAuthorIds.value = new Set(
          Array.isArray(followRes?.list)
            ? followRes.list.map(item => Number(item.id)).filter(Boolean)
            : []
        )
      } catch {
        followedAuthorIds.value = new Set()
      }
    } else {
      followedAuthorIds.value = new Set()
    }

    const likedIds = new Set(
      Array.isArray(likesRes?.list)
        ? likesRes.list.map(item => item.id ?? item.note_id ?? item.noteId).filter(Boolean)
        : []
    )
    const collectedIds = new Set(
      Array.isArray(collectionsRes?.list)
        ? collectionsRes.list.map(item => item.id ?? item.note_id ?? item.noteId).filter(Boolean)
        : []
    )

    if (notesRes.code === 200) {
      const newNotes = notesRes.list.map((item) => {
        const mapped = mapNoteItem(item)
        if (!mapped.liked && likedIds.has(mapped.id)) {
          mapped.liked = true
        }
        if (collectedIds.has(mapped.id)) {
          mapped.collected = true
        } else if (item.collection_status !== undefined || item.collectionStatus !== undefined || item.collected !== undefined) {
          mapped.collected = item.collected ?? item.collection_status ?? item.collectionStatus ?? false
        }
        return mapped
      })
      if (reset) {
        notes.value = newNotes
      } else {
        // 追加去重（游标边界安全）
        const existingIds = new Set(notes.value.map((n) => n.id))
        notes.value = [...notes.value, ...newNotes.filter((n) => !existingIds.has(n.id))]
      }
      cursor.value = notesRes.nextCursor || null
      hasMore.value = Boolean(notesRes.hasMore)
    }
  } catch (error) {
    console.error('获取笔记列表失败:', error)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const reloadNotes = () => fetchNotes(true)

// 加载更多
const loadMore = () => {
  if (loadingMore.value || !hasMore.value) return
  page.value++
  fetchNotes()
}

// 打开详情弹窗
const openDetailModal = (noteId) => {
  const selected = notes.value.find(item => item.id === noteId)
  selectedNoteId.value = noteId
  if (selected) {
    selectedNoteData.value = { ...selected }
  }
  showDetailModal.value = true
}

// 关闭详情弹窗
const closeDetailModal = () => {
  showDetailModal.value = false
  selectedNoteId.value = null
  selectedNoteData.value = null
}

// 检查登录状态
const checkLogin = () => {
  return !!localStorage.getItem('token')
}

// 显示登录卡片
const showLoginCard = () => {
  window.dispatchEvent(new Event('showLoginModal'))
}

const homeRefreshCount = ref(0)
const onRefreshHome = () => {
  if (route.path === '/') {
    homeRefreshCount.value++
    reloadNotes()
  }
}

// 点赞/取消点赞
const syncSelectedNote = (item) => {
  if (selectedNoteId.value === item.id) {
    selectedNoteData.value = {
      ...(selectedNoteData.value || {}),
      ...item,
      images: selectedNoteData.value?.images ?? item.images,
      content: selectedNoteData.value?.content ?? item.content,
      title: selectedNoteData.value?.title ?? item.title,
      avatar: selectedNoteData.value?.avatar ?? item.avatar,
      nickname: selectedNoteData.value?.nickname ?? item.nickname,
      user_id: selectedNoteData.value?.user_id ?? item.user_id,
      create_time: selectedNoteData.value?.create_time ?? item.create_time,
      category: selectedNoteData.value?.category ?? item.category,
      description: selectedNoteData.value?.description ?? item.description,
      coverImage: selectedNoteData.value?.coverImage ?? item.coverImage,
      authorAvatar: selectedNoteData.value?.authorAvatar ?? item.authorAvatar,
      authorName: selectedNoteData.value?.authorName ?? item.authorName
    }
  }
}

const patchNoteById = (id, patch) => {
  const target = notes.value.find(item => item.id === Number(id))
  if (!target) return
  const keepImages = target.images
  const keepCoverImage = target.coverImage
  const keepAuthorAvatar = target.authorAvatar
  const keepAuthorName = target.authorName
  Object.assign(target, patch)
  if (keepImages !== undefined && target.images === undefined) target.images = keepImages
  if (keepCoverImage !== undefined && target.coverImage === undefined) target.coverImage = keepCoverImage
  if (keepAuthorAvatar !== undefined && target.authorAvatar === undefined) target.authorAvatar = keepAuthorAvatar
  if (keepAuthorName !== undefined && target.authorName === undefined) target.authorName = keepAuthorName
  notes.value = [...notes.value]
  syncSelectedNote(target)
}

const handleNoteStateChange = (payload) => {
  if (!payload?.id) return
  const normalized = { ...payload }
  // 后端字段 → 前端卡片字段映射
  if (payload.comment_count !== undefined) normalized.commentCount = payload.comment_count
  patchNoteById(payload.id, normalized)
}

const handleFollowChange = ({ authorId, isFollowing, followers }) => {
  if (!authorId) return
  notes.value.forEach(item => {
    if (Number(item.userId) === Number(authorId)) {
      item.followed = !!isFollowing
    }
  })
  notes.value = [...notes.value]
}

const toggleLike = async (item) => {
  if (!checkLogin()) {
    localStorage.setItem('pendingAction', JSON.stringify({ type: 'like', noteId: item.id }))
    window.dispatchEvent(new Event('showLoginModal'))
    return
  }

  const previousLiked = item.liked
  const previousLikes = item.likes
  item.liked = !previousLiked
  item.likes = Math.max(0, previousLikes + (item.liked ? 1 : -1))
  item.animatingLike = true
  notes.value = [...notes.value]
  syncSelectedNote(item)

  try {
    const res = await actionApi.toggleAction({ noteId: item.id, type: 'like' })
    if (res.code === 200) {
      if (typeof res.isActive !== 'undefined') {
        item.liked = !!res.isActive
        item.likes = Number(res.count ?? item.likes)
      }
      setTimeout(() => { item.animatingLike = false }, 180)
      notes.value = [...notes.value]
      syncSelectedNote(item)
    } else {
      item.liked = previousLiked
      item.likes = previousLikes
      item.animatingLike = false
      notes.value = [...notes.value]
      syncSelectedNote(item)
      console.error('点赞失败:', res.msg)
    }
  } catch (error) {
    item.liked = previousLiked
    item.likes = previousLikes
    item.animatingLike = false
    notes.value = [...notes.value]
    syncSelectedNote(item)
    console.error('点赞失败:', error)
  }
}

// 收藏/取消收藏
const toggleCollect = async (item) => {
  if (!checkLogin()) {
    localStorage.setItem('pendingAction', JSON.stringify({ type: 'collect', noteId: item.id }))
    window.dispatchEvent(new Event('showLoginModal'))
    return
  }

  const previousCollected = item.collected
  const previousCollects = item.collects
  item.collected = !previousCollected
  item.collects = Math.max(0, previousCollects + (item.collected ? 1 : -1))
  item.animatingCollect = true
  notes.value = [...notes.value]
  syncSelectedNote(item)

  try {
    const res = await actionApi.toggleAction({ noteId: item.id, type: 'collect' })
    if (res.code === 200) {
      if (typeof res.isActive !== 'undefined') {
        item.collected = !!res.isActive
      }
      if (typeof res.count !== 'undefined') {
        item.collects = Number(res.count)
      }
      setTimeout(() => { item.animatingCollect = false }, 180)
      notes.value = [...notes.value]
      syncSelectedNote(item)
    } else {
      item.collected = previousCollected
      item.collects = previousCollects
      item.animatingCollect = false
      notes.value = [...notes.value]
      syncSelectedNote(item)
      console.error('收藏失败:', res.msg)
    }
  } catch (error) {
    item.collected = previousCollected
    item.collects = previousCollects
    item.animatingCollect = false
    notes.value = [...notes.value]
    syncSelectedNote(item)
    console.error('收藏失败:', error)
  }
}

// 格式化数字
const formatNumber = (num) => {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + 'w'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k'
  }
  return num.toString()
}

// 跳转到作者主页（统一：点击作者直接进入其主页，不再弹卡片）
const goToAuthor = (userId) => {
  if (userId) {
    router.push(`/user/${Number(userId)}`)
  }
}

watch(() => route.query.authorId, (authorId) => {
  if (authorId) {
    goToAuthor(authorId)
  }
}, { immediate: true })

// 响应式列数
const updateColumnCount = () => {
  const width = window.innerWidth
  if (width < 600) {
    columnCount.value = 2
  } else if (width < 900) {
    columnCount.value = 3
  } else if (width < 1200) {
    columnCount.value = 4
  } else {
    columnCount.value = 5
  }
}

watch(searchKeyword, () => {
  reloadNotes()
})

watch(() => route.query.authorId, (authorId) => {
  if (authorId) {
    goToAuthor(authorId)
  }
}, { immediate: true })

onMounted(() => {
  updateColumnCount()
  window.addEventListener('resize', updateColumnCount)
  window.addEventListener('loginSuccess', handleLoginSuccess)
  window.addEventListener('refreshHome', onRefreshHome)
  window.addEventListener('scroll', onWindowScroll, { passive: true })
  reloadNotes()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateColumnCount)
  window.removeEventListener('loginSuccess', handleLoginSuccess)
  window.removeEventListener('refreshHome', onRefreshHome)
  window.removeEventListener('scroll', onWindowScroll)
  if (scrollThrottleTimer) clearTimeout(scrollThrottleTimer)
})

// 登录成功后的回调，执行待处理的操作
const handleLoginSuccess = async () => {
  const pendingAction = localStorage.getItem('pendingAction')
  if (pendingAction) {
    try {
      const action = JSON.parse(pendingAction)
      if (action.noteId) {
        const note = notes.value.find(n => n.id === action.noteId)
        if (note) {
          if (action.type === 'like') {
            await toggleLike(note)
          } else if (action.type === 'collect') {
            await toggleCollect(note)
          }
        }
      }
    } catch (error) {
      console.error('执行待处理操作失败:', error)
    } finally {
      localStorage.removeItem('pendingAction')
    }
  }

  reloadNotes()
}
</script>

<template>
  <div class="home-container">
    <!-- 骨架屏 -->
    <div v-if="loading" class="skeleton-waterfall">
      <div class="skeleton-column" v-for="i in columnCount" :key="i">
        <div class="skeleton-item" v-for="j in 3" :key="j">
          <div class="skeleton-image"></div>
          <div class="skeleton-content">
            <div class="skeleton-title"></div>
            <div class="skeleton-desc"></div>
            <div class="skeleton-footer">
              <div class="skeleton-avatar"></div>
              <div class="skeleton-name"></div>
              <div class="skeleton-stats">
                <div class="skeleton-stat"></div>
                <div class="skeleton-stat"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 小红书风格瀑布式布局作品列表（CSS columns 真实高度） -->
    <div v-else class="waterfall">
      <div class="waterfall-item" v-for="item in filteredNotes" :key="item.id" @click="openDetailModal(item.id)">
        <div class="item-image-wrapper">
          <!-- 视频笔记：用视频首帧作封面（自动解码后立即定格） -->
          <div class="sk-video-bg sk-shimmer-bg"></div>
          <video
            v-if="item.videoUrl"
            :src="item.videoUrl"
            class="item-image video-cover"
            muted
            playsinline
            preload="auto"
            autoplay
            @loadeddata="holdFirstFrame"
          ></video>
          <SkeletonImage
            v-else
            :src="item.coverImage"
            :alt="item.title"
            :min-height="220"
          />
          <!-- 视频角标（右上角小图标） -->
          <div v-if="item.videoUrl" class="video-badge">
            <svg class="play-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span v-if="!item.videoUrl && noteImageCount(item)" class="image-count-badge">{{ noteImageCount(item) }}</span>
        </div>
        <div class="item-content">
          <p v-if="item.title" class="item-title">{{ item.title }}</p>
          <p class="item-desc" v-html="highlightText(item.description)"></p>
          <div class="item-footer">
            <div class="author-row" @click.stop="goToAuthor(item.userId)">
              <SkeletonAvatar :src="item.authorAvatarRaw ? resolveMediaUrl(item.authorAvatarRaw) : ''" :name="item.authorName" :size="32" @click.stop="goToAuthor(item.userId)" />
              <div class="author-meta">
                <span class="author-name">{{ item.authorName }}</span>
                <span v-if="item.followed" class="follow-badge">已关注</span>
              </div>
            </div>
            <div class="action-row">
              <span class="footer-like" :class="{ liked: item.liked, animating: item.animatingLike }" @click.stop="toggleLike(item)">
                <XhsIcon name="like" :filled="item.liked" :class="{ liked: item.liked }" /> {{ formatNumber(item.likes) }}
              </span>
              <span class="footer-comment" @click.stop="openDetailModal(item.id)">
                <XhsIcon name="comment" /> {{ formatNumber(item.commentCount) }}
              </span>
              <span class="footer-collect" :class="{ collected: item.collected, animating: item.animatingCollect }" @click.stop="toggleCollect(item)">
                <XhsIcon name="collect" :filled="item.collected" :class="{ collected: item.collected }" /> {{ formatNumber(item.collects) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 无限滚动加载提示 -->
    <div v-if="!loading && loadingMore" class="loading-more-hint">
      <span class="spinner"></span> 加载中...
    </div>

    <!-- 加载更多 -->
    <div v-if="!loading && hasMore" class="load-more">
      <button class="load-more-btn" @click="loadMore" :disabled="loadingMore">
        <span>{{ loadingMore ? '加载中...' : '加载更多' }}</span>
      </button>
    </div>

    <!-- 没有更多数据 -->
    <div v-if="!loading && !hasMore && notes.length > 0" class="no-more">
      <p>已经到底了~</p>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && filteredNotes.length === 0" class="empty-state">
      <p>{{ isSearchMode ? `未找到与「${searchKeyword}」相关的笔记` : '暂无笔记' }}</p>
      <span v-if="isSearchMode" class="empty-hint">试试搜索标题、内容或作者昵称</span>
    </div>

    <!-- 笔记详情弹窗组件 -->
    <NoteDetailCard 
      :show="showDetailModal" 
      :note-id="selectedNoteId" 
      :note-data="selectedNoteData"
      @close="closeDetailModal" 
      @note-state-change="handleNoteStateChange"
      @deleted="reloadNotes"
    />
  </div>
</template>

<style scoped lang="scss">
.home-container {
  width: 100%;
  min-height: calc(100vh - 120px);
  padding: 20px;
  box-sizing: border-box;
}

.skeleton-waterfall {
  display: flex;
  gap: 16px;
}

.skeleton-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skeleton-item {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
}

.skeleton-image {
  width: 100%;
  height: 300px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
}

.skeleton-content {
  padding: 12px;
}

.skeleton-title {
  height: 18px;
  width: 80%;
  margin-bottom: 8px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 4px;
}

.skeleton-desc {
  height: 16px;
  width: 60%;
  margin-bottom: 16px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 4px;
}

.skeleton-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
}

.skeleton-name {
  height: 14px;
  width: 60px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 4px;
}

.skeleton-stats {
  display: flex;
  gap: 16px;
  margin-left: auto;
}

.skeleton-stat {
  height: 12px;
  width: 30px;
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.waterfall {
  columns: 5;
  column-gap: 16px;
}

@media (max-width: 1200px) {
  .waterfall { columns: 4; }
}

@media (max-width: 900px) {
  .waterfall { columns: 3; }
}

@media (max-width: 600px) {
  .waterfall { columns: 2; column-gap: 8px; }
}

.waterfall-item {
  break-inside: avoid;
  margin-bottom: 16px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }
}

.item-image-wrapper {
  position: relative;
  overflow: hidden;
}

.item-image {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
  background: #f3f4f6;
  transition: transform 0.35s ease;
}

/* 视频封面：定格首帧，稳定比例，不拦截点击；悬浮时放大 */
.video-cover {
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  background: #f3f4f6;
  display: block;
  pointer-events: none;
  transition: transform 0.35s ease;
  position: relative;
  z-index: 1;
}

/* 视频封面骨架背景（首帧解码/加载前显示 shimmer） */
.sk-video-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.waterfall-item:hover .item-image,
.waterfall-item:hover .video-cover {
  transform: scale(1.04);
}

/* 视频角标（右上角小圆徽标） */
.video-badge {
  position: absolute;
  right: 10px;
  top: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  backdrop-filter: blur(4px);

  .play-icon {
    font-size: 10px;
  }
}

/* 鼠标移入作品：蒙一层半透明黑 */
.waterfall-item:hover .item-image-wrapper::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

/* 多图角标 */
.image-count-badge {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  backdrop-filter: blur(4px);
}

.item-content {
  padding: 12px;
}

.item-title {
  font-size: 15px;
  font-weight: 600;
  color: #111;
  line-height: 1.45;
  margin: 0 0 6px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-desc {
  font-size: 14px;
  color: #333;
  line-height: 1.5;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search-highlight {
  background: rgba(255, 230, 0, 0.35);
  color: inherit;
  border-radius: 3px;
  padding: 0 2px;
}

.item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.author-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
  transition: transform 0.2s ease;
  flex-shrink: 0;

  &:hover {
    transform: scale(1.1);
  }
}

.author-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.author-name {
  font-size: 13px;
  color: #333;
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.follow-badge {
  font-size: 10px;
  color: #2ec4b5;
  background: rgba(46, 196, 181, 0.12);
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 600;
  width: fit-content;
  margin-top: 2px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.footer-like,
.footer-comment,
.footer-collect {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  transition: transform 0.18s ease, color 0.18s ease, opacity 0.18s ease;
  will-change: transform;

  .xhs-icon {
    color: #333;
  }

  &.animating {
    animation: pulsePop 0.18s ease;
  }
}

.footer-like {
  &:hover,
  &:hover .xhs-icon {
    color: #ff2442;
  }

  &.liked,
  &.liked .xhs-icon {
    color: #ff2442;
  }
}

.footer-collect {
  &:hover,
  &:hover .xhs-icon {
    color: #ffd700;
  }

  &.collected,
  &.collected .xhs-icon {
    color: #ffd700;
  }
}

.footer-comment {
  &:hover {
    color: #333;
  }
}

@keyframes pulsePop {
  0% { transform: scale(1); }
  50% { transform: scale(1.12); }
  100% { transform: scale(1); }
}

.load-more {
  text-align: center;
  padding: 30px;
}

.load-more-btn {
  padding: 12px 40px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 24px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f8f8f8;
    border-color: #d8d8d8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.loading-more-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 0;
  color: #94a3b8;
  font-size: 13px;

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(46, 196, 181, 0.2);
    border-top-color: #2ec4b5;
    border-radius: 50%;
    animation: home-spin 0.8s linear infinite;
  }
}

@keyframes home-spin {
  to { transform: rotate(360deg); }
}

.no-more,
.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}

.empty-hint {
  display: inline-block;
  margin-top: 8px;
  font-size: 13px;
  color: #b3b3b3;
}
</style>