<template>
  <div class="draft-container">
    <div class="draft-header">
      <h2>我的草稿</h2>
    </div>

    <div class="draft-content">
      <div v-if="loading" class="loading">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>

      <div v-else-if="drafts.length === 0" class="empty-state">
        <div class="empty-icon"><el-icon :size="56" color="#c0c8d0"><EditPen /></el-icon></div>
        <p>暂无草稿</p>
        <button class="publish-btn" @click="$router.push('/publish')">去发布</button>
      </div>

      <div v-else class="drafts-grid">
        <div class="draft-card" v-for="draft in drafts" :key="draft.id">
          <div class="draft-image-wrapper">
            <video
              v-if="draft.video"
              :src="resolveMediaUrl(draft.video)"
              class="draft-cover"
              muted
              playsinline
              preload="auto"
              autoplay
              @loadeddata="holdFirstFrame"
            ></video>
            <img
              v-else
              :src="getFirstImage(draft.images)"
              alt=""
              class="draft-cover"
            />
            <div v-if="draft.video" class="video-badge"><el-icon :size="12" color="#fff"><VideoPlay /></el-icon></div>
            <div v-else-if="getImageCount(draft.images) > 1" class="image-count">{{ getImageCount(draft.images) }}</div>
          </div>
          <div class="draft-info">
            <h3 class="draft-title">{{ draft.title || '无标题' }}</h3>
            <p class="draft-content-text">{{ getContentPreview(draft.content) }}</p>
            <div class="draft-meta">
              <span class="draft-time">{{ formatTime(draft.create_time) }}</span>
              <span class="draft-topics" v-if="draft.category">{{ formatTopics(draft.category) }}</span>
            </div>
          </div>
          <div class="draft-actions">
            <button class="action-btn edit" @click="editDraft(draft)">编辑</button>
            <button class="action-btn publish" @click="publishDraft(draft.id)">发布</button>
            <button class="action-btn delete" @click="deleteDraft(draft.id)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { draftApi } from '@/api'
import { resolveMediaUrl, parseImagesJson } from '@/utils/media'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const drafts = ref([])
const loading = ref(true)

// 视频首帧定格
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

const fetchDrafts = async () => {
  loading.value = true
  try {
    const res = await draftApi.getDraftList()
    if (res.code === 200) {
      drafts.value = res.list
    } else {
      console.warn('获取草稿失败，code:', res.code, 'msg:', res.msg)
    }
  } catch (error) {
    console.error('获取草稿失败:', error)
  } finally {
    loading.value = false
  }
}

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1504753793650-d4a2b783c15e?w=200'

const getFirstImage = (images) => {
  const parsed = parseImagesJson(images)
  return parsed.length > 0 ? resolveMediaUrl(parsed[0]) : DEFAULT_COVER
}

const getImageCount = (images) => parseImagesJson(images).length

const getContentPreview = (content) => {
  if (!content) return '暂无内容'
  return content.length > 50 ? content.substring(0, 50) + '...' : content
}

const formatTopics = (category) => {
  if (!category) return ''
  const topics = category.split(',').filter(t => t.trim())
  return topics.map(t => '#' + t).join(' ')
}

const formatTime = (time) => {
  if (!time) return ''
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const editDraft = (draft) => {
  const draftData = {
    id: draft.id,
    title: draft.title,
    content: draft.content,
    images: draft.images,
    category: draft.category,
    // 视频草稿编辑时也要带上 video，否则 PublishView 的 fillDraftForm
    // 读不到视频，导致视频预览不渲染
    video: draft.video || draft.video_url || draft.videoUrl || '',
    videoUrl: draft.video || draft.video_url || draft.videoUrl || ''
  }
  localStorage.setItem('editingDraft', JSON.stringify(draftData))
  router.push('/publish')
}

const publishDraft = async (draftId) => {
  try {
    const res = await draftApi.publishDraft(draftId)
    if (res.code === 200) {
      ElMessage.success('发布成功')
      await fetchDrafts()
      if (localStorage.getItem('publishingDraftId') === String(draftId)) {
        localStorage.removeItem('publishingDraftId')
      }
    } else {
      ElMessage.error(res.msg || '发布失败')
    }
  } catch (error) {
    console.error('发布失败:', error)
    ElMessage.error('发布失败')
  }
}

const deleteDraft = async (draftId) => {
  try {
    await ElMessageBox.confirm('确定删除这条草稿吗？', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    const res = await draftApi.deleteDraft(draftId)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      await fetchDrafts()
    } else {
      ElMessage.error(res.msg || '删除失败')
    }
  } catch (error) {
    console.error('删除失败:', error)
    ElMessage.error('删除失败')
  }
}

onMounted(fetchDrafts)
</script>

<style scoped lang="scss">
.draft-container {
  min-height: 100vh;
  background: #f7f8fa;
}

.draft-header {
  background: #fff;
  padding: 24px 0 16px;
  margin-bottom: 20px;
  border-bottom: 1px solid #f0f1f3;

  h2 {
    margin: 0;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 30px;
    color: #111;
    font-size: 22px;
    font-weight: 700;
  }
}

.draft-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 30px 30px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: #999;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f0f0f0;
  border-top-color: #2ec4b5;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 0;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.empty-state p {
  font-size: 16px;
  color: #999;
  margin-bottom: 24px;
}

.publish-btn {
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  color: #fff;
  border: none;
  padding: 12px 32px;
  border-radius: 25px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(46, 196, 181, 0.4);
  }
}

/* 草稿网格布局 */
.drafts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.draft-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

.draft-image-wrapper {
  position: relative;
  width: 100%;
  padding-top: 100%;
  overflow: hidden;
}

.draft-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-badge {
  position: absolute;
  right: 8px;
  top: 8px;
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

.image-count {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.draft-info {
  padding: 12px;
}

.draft-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin: 0 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-content-text {
  font-size: 13px;
  color: #666;
  margin: 0 0 10px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.draft-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.draft-time {
  font-size: 12px;
  color: #999;
}

.draft-topics {
  font-size: 11px;
  color: #2ec4b5;
  background: #e8f8f5;
  padding: 3px 8px;
  border-radius: 10px;
}

.draft-actions {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
}

.action-btn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 15px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &.edit {
    background: #f5f5f5;
    color: #666;

    &:hover {
      background: #eee;
    }
  }

  &.publish {
    background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
    color: #fff;

    &:hover {
      transform: scale(1.05);
      box-shadow: 0 2px 8px rgba(46, 196, 181, 0.4);
    }
  }

  &.delete {
    background: #fff;
    color: #ff6b6b;
    border: 1px solid #ff6b6b;

    &:hover {
      background: #fff5f5;
    }
  }
}

/* 响应式 */
@media (max-width: 768px) {
  .drafts-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}

@media (max-width: 480px) {
  .drafts-grid {
    grid-template-columns: 1fr;
  }
}
</style>