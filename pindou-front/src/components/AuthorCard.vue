<script setup>
import { ref, watch, computed } from 'vue'
import { userApi, noteApi, followApi } from '@/api'
import { parseImagesJson, resolveMediaUrl, formatAvatar } from '@/utils/media'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  authorId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['close', 'openNote', 'follow-change'])

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1504753793650-d4a2b783c15e?w=400'

const authorInfo = ref(null)
const authorNotes = ref([])
const loading = ref(true)
const followLoading = ref(false)
const isFollowing = ref(false)
const stats = ref({ works: 0, likes: 0, followers: 0, following: 0 })

// 格式化品豆号为8位数
const pindouId = computed(() => {
  if (!authorInfo.value) return ''
  const id = parseInt(authorInfo.value.id) || 0
  return (10000000 + id).toString()
})

// 监听show和authorId变化，重新加载数据
watch([() => props.show, () => props.authorId], async ([newShow, newAuthorId]) => {
  if (newShow && newAuthorId) {
    loading.value = true
    authorInfo.value = null
    authorNotes.value = []
    stats.value = { works: 0, likes: 0, followers: 0, following: 0 }
    await Promise.all([
      getAuthorInfo(),
      getAuthorNotes()
    ])
    loading.value = false
  }
}, { immediate: true })

// const getAuthorInfo = async () => {
//   if (!props.authorId) return
  
//   try {
//     const res = await userApi.getOtherUserInfo(props.authorId)
//     if (res.code === 200) {
//       authorInfo.value = {
//         ...res.user,
//         avatar: res.user.avatar && res.user.avatar.startsWith('/')
//           ? `http://localhost:3000${res.user.avatar}`
//           : res.user.avatar
//       }
//       isFollowing.value = res.isFollowing
//       stats.value = {
//         works: res.works || 0,
//         likes: res.likes || 0,
//         followers: res.followers || 0,
//         following: res.following || 0
//       }
//     } else {
//       console.error('获取作者信息失败:', res.msg)
//     }
//   } catch (error) {
//     console.error('获取作者信息失败:', error)
//   }
// }

// const getAuthorNotes = async () => {
//   if (!props.authorId) return
  
//   try {
//     const res = await noteApi.getAuthorNotes(props.authorId)
//     if (res.code === 200) {
//       authorNotes.value = res.list.map(item => {
//         const imagesArray = item.images ? JSON.parse(item.images || '[]') : []
//         const coverImage = imagesArray.length > 0
//           ? `http://localhost:3000${imagesArray[0]}`
//           : 'https://images.unsplash.com/photo-1504753793650-d4a2b783c15e?w=400'
//         return {
//           id: item.id,
//           coverImage: coverImage,
//           imageCount: imagesArray.length
//         }
//       })
//     }
//   } catch (error) {
//     console.error('获取作者作品失败:', error)
//   }
// }
const getAuthorInfo = async () => {
  if (!props.authorId) return

  try {
    const res = await userApi.getOtherUserInfo(props.authorId)

    if (res.code === 200) {
      if (!res.user) {
        console.error('响应中没有user数据')
        return
      }

      authorInfo.value = {
        ...res.user,
        avatar: formatAvatar(res.user.avatar)
      }

      isFollowing.value = !!res.isFollowing
      stats.value = {
        works: Number(res.works || 0),
        likes: Number(res.likes || 0),
        followers: Number(res.followers || 0),
        following: Number(res.following || 0)
      }
      console.log('作者卡片统计:', stats.value, '关注状态:', isFollowing.value)
    } else {
      console.error('获取作者信息失败:', res.msg)
    }
  } catch (error) {
    console.error('获取作者信息失败:', error)
  }
}
const getAuthorNotes = async () => {
  if (!props.authorId) return

  try {
    const res = await noteApi.getAuthorNotes(props.authorId)
    console.log('作者笔记响应:', res)  // 调试用

    if (res.code === 200) {
      authorNotes.value = res.list.map(item => {
        const imagesArray = parseImagesJson(item.images)
        const coverImage = imagesArray.length > 0
          ? resolveMediaUrl(imagesArray[0])
          : DEFAULT_COVER

        return {
          id: item.id,
          title: item.title,
          coverImage,
          imageCount: imagesArray.length
        }
      })
      console.log('处理后的作品列表:', authorNotes.value)  // 调试用
    }
  } catch (error) {
    console.error('获取作者作品失败:', error)
  }
}
// const toggleFollow = async () => {
//   const token = localStorage.getItem('token')
//   if (!token) {
//     window.dispatchEvent(new Event('showLoginModal'))
//     return
//   }

//   try {
//     const res = await followApi.toggleFollow({ userId: props.authorId })
//     if (res.code === 200) {
//       isFollowing.value = !isFollowing.value
//       stats.value.followers += isFollowing.value ? 1 : -1
//     }
//   } catch (error) {
//     console.error('关注失败:', error)
//   }
// }
const getCurrentUserId = () => {
  const userInfo = localStorage.getItem('userInfo')
  if (!userInfo) return null
  try {
    return Number(JSON.parse(userInfo).id)
  } catch {
    return null
  }
}

const toggleFollow = async () => {
  const token = localStorage.getItem('token')
  if (!token) {
    window.dispatchEvent(new Event('showLoginModal'))
    return
  }

  if (!props.authorId) {
    console.error('关注对象无效')
    return
  }

  const currentUserId = getCurrentUserId()
  if (currentUserId && Number(props.authorId) === currentUserId) {
    return
  }

  if (followLoading.value) return
  followLoading.value = true

  const previousFollowing = isFollowing.value
  const previousFollowers = stats.value.followers
  const nextFollowing = !previousFollowing

  isFollowing.value = nextFollowing
  stats.value.followers = Math.max(0, previousFollowers + (nextFollowing ? 1 : -1))

  try {
    const res = await followApi.toggleFollow({ followeeId: Number(props.authorId) })

    if (res.code === 200) {
      isFollowing.value = !!res.isFollowing
      if (typeof res.followers !== 'undefined') {
        stats.value.followers = Math.max(0, Number(res.followers || 0))
      } else {
        stats.value.followers = Math.max(0, previousFollowers + (res.isFollowing ? 1 : -1))
      }
      emit('follow-change', {
        authorId: Number(props.authorId),
        isFollowing: isFollowing.value,
        followers: stats.value.followers
      })
    } else {
      isFollowing.value = previousFollowing
      stats.value.followers = previousFollowers
      console.error('关注操作失败:', res.msg)
    }
  } catch (error) {
    isFollowing.value = previousFollowing
    stats.value.followers = previousFollowers
    console.error('关注失败:', error)
  } finally {
    followLoading.value = false
  }
}
const openDetailModal = (noteId) => {
  emit('openNote', noteId)
}

const close = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="author-card-overlay" @click.self="close">
      <div class="author-card">
        <div class="card-header">
          <div class="close-btn" @click="close"><el-icon :size="20"><Close /></el-icon></div>
        </div>
        
        <div v-if="loading" class="card-loading">
          <div class="loading-spinner"></div>
        </div>
        
        <template v-else-if="authorInfo">
          <div class="profile-section">
            <img 
              :src="authorInfo.avatar || 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'" 
              :alt="authorInfo.nickname" 
              class="avatar" 
            />
            <h2 class="nickname">{{ authorInfo.nickname || authorInfo.username || '用户' }}</h2>
            <p class="pindou-id">品豆号: {{ pindouId }}</p>
            <p class="bio">{{ authorInfo.signature || '暂无签名' }}</p>
            
            <div class="stats-row">
              <div class="stat-item">
                <span class="stat-value">{{ stats.works }}</span>
                <span class="stat-label">作品</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{{ stats.likes }}</span>
                <span class="stat-label">获赞</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{{ stats.followers }}</span>
                <span class="stat-label">粉丝</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{{ stats.following }}</span>
                <span class="stat-label">关注</span>
              </div>
            </div>
            
            <button 
              class="follow-btn" 
              :class="{ following: isFollowing, self: authorInfo.id === getCurrentUserId() }"
              :disabled="followLoading || authorInfo.id === getCurrentUserId()"
              @click="toggleFollow"
            >
              {{ authorInfo.id === getCurrentUserId() ? '不能关注自己' : (followLoading ? '处理中...' : (isFollowing ? '已关注，点此取消' : '+ 关注')) }}
            </button>
          </div>
          
          <div class="works-section">
            <h3 class="section-title">他的作品</h3>
            <div v-if="authorNotes.length === 0" class="empty-works">
              <p>暂无作品</p>
            </div>
            <div v-else class="works-grid">
              <div 
                class="work-item" 
                v-for="note in authorNotes" 
                :key="note.id"
                @click="openDetailModal(note.id)"
              >
                <img :src="note.coverImage" :alt="note.title" class="work-image" />
                <div v-if="note.imageCount > 1" class="image-count">{{ note.imageCount }}</div>
              </div>
            </div>
          </div>
        </template>
        
        <div v-else class="error-message">
          <p>无法加载作者信息</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.author-card-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.author-card {
  background: #fff;
  border-radius: 20px;
  width: 90%;
  max-width: 700px;
  max-height: 90vh;
  overflow: hidden;
  animation: slideUp 0.3s ease;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}

@keyframes slideUp {
  from { 
    opacity: 0; 
    transform: translateY(20px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
}

.card-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 0;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
}

.close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  cursor: pointer;
  z-index: 20;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.7);
    transform: scale(1.1);
  }
}

.card-loading {
  padding: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #f0f0f0;
  border-top-color: #2ec4b5;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.profile-section {
  padding: 28px 40px 26px;
  text-align: center;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  color: #fff;
}

.avatar {
  width: 124px;
  height: 124px;
  border-radius: 50%;
  border: 5px solid rgba(255, 255, 255, 0.9);
  object-fit: cover;
  margin-bottom: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

.nickname {
  font-size: 30px;
  font-weight: 700;
  margin-bottom: 8px;
}

.pindou-id {
  font-size: 14px;
  opacity: 0.8;
  margin-bottom: 12px;
  font-family: 'Courier New', monospace;
}

.bio {
  font-size: 16px;
  opacity: 0.95;
  margin-bottom: 24px;
  line-height: 1.6;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}

.stats-row {
  display: flex;
  justify-content: center;
  gap: 40px;
  margin-bottom: 28px;
  padding: 20px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 13px;
  opacity: 0.85;
}

.follow-btn {
  padding: 14px 40px;
  background: #fff;
  color: #2ec4b5;
  border: none;
  border-radius: 30px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.75;
    transform: none;
  }

  &.self {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    border: 2px solid rgba(255, 255, 255, 0.5);
  }

  &.following {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    border: 2px solid rgba(255, 255, 255, 0.5);
  }
}

.works-section {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  max-height: 400px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin-bottom: 20px;
  padding-left: 8px;
}

.empty-works {
  text-align: center;
  padding: 60px 0;
  color: #999;
}

.works-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.work-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    opacity: 0.9;
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
}

.work-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-count {
  position: absolute;
  bottom: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 6px;
}

.error-message {
  padding: 60px;
  text-align: center;
  color: #999;
}
</style>
