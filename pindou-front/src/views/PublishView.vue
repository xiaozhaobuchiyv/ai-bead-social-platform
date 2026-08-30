<template>
  <div class="publish-container">
    <div class="publish-header">
      <h2>发布笔记</h2>
    </div>

    <div class="publish-layout">
      <div class="publish-main">
        <div class="publish-form">
          <div class="form-item">
            <input v-model="form.title" type="text" class="title-input" placeholder="填写标题会有更多赞哦~" />
          </div>

          <div class="form-item">
            <textarea v-model="form.content" class="content-textarea" placeholder="分享这一刻的想法..." rows="10"></textarea>
          </div>

          <div class="form-item">
            <label class="form-label">上传内容（图片 或 视频二选一）</label>
            <!-- 图片上传 -->
            <div class="upload-area-wrap" v-if="!videoUrl">
              <div class="upload-area">
                <div class="upload-item" v-for="(image, index) in images" :key="index">
                  <img :src="image" alt="" class="upload-image" />
                  <div class="upload-delete" @click="removeImage(index)">×</div>
                </div>
                <div class="upload-item upload-add" @click="triggerUpload" v-if="images.length < 9">
                  <div class="upload-icon">+</div>
                  <span class="upload-text">上传图片</span>
                </div>
                <div class="upload-item upload-add upload-video-add" @click="triggerVideoUpload">
                  <el-icon class="upload-icon upload-icon-svg"><VideoPlay /></el-icon>
                  <span class="upload-text">上传视频</span>
                </div>
              </div>
              <div v-if="compressing" class="upload-processing">
                <span class="spinner processing-spinner"></span>
                图片处理中...
              </div>
            </div>
            <input type="file" id="imageUpload" class="upload-input" multiple accept="image/*"
              @change="handleImageUpload" />
            <input type="file" id="videoUpload" class="upload-input" accept="video/mp4,video/webm,video/ogg,video/quicktime"
              @change="handleVideoUpload" />

            <!-- 视频预览 -->
            <div v-if="videoUrl" class="video-preview">
              <div class="video-preview-header">
                <span class="video-label">
                  <el-icon><VideoPlay /></el-icon>
                  视频预览
                </span>
                <button class="video-remove" @click="removeVideo">
                  <el-icon><Delete /></el-icon> 删除视频
                </button>
              </div>
              <div class="video-preview-body">
                <video :src="previewVideoUrl" controls preload="metadata" v-video-volume class="preview-video"></video>
              </div>
              <div class="video-uploading" v-if="videoUploading">
                <span class="spinner"></span> 视频上传中...
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="publish-sidebar">
        <div class="topic-section">
          <div class="section-header">
            <el-icon class="section-icon"><CollectionTag /></el-icon>
            <span class="section-title">话题</span>
          </div>
          <div class="topic-input-wrapper">
            <input v-model="newTopic" type="text" class="topic-input" placeholder="添加或创建话题" @keyup.enter="addTopic" />
            <button class="add-topic-btn" @click="addTopic" :disabled="!newTopic.trim()">添加</button>
          </div>
          <div class="topic-list" v-if="topics.length > 0">
            <span class="topic-tag" v-for="(topic, index) in topics" :key="index">
              #{{ topic }}
              <span class="topic-remove" @click="removeTopic(index)">×</span>
            </span>
          </div>
          <div class="topic-hint" v-if="topics.length === 0">
            添加话题让更多人发现你的笔记
          </div>
        </div>

        <div class="action-section">
          <button class="btn-draft" @click="saveDraft" :disabled="saving">
            {{ saving ? '保存中...' : '存为草稿' }}
          </button>
          <button class="btn-publish" @click="publishNote" :disabled="!canPublish || publishing">
            {{ publishing ? '发布中...' : '发布笔记' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { noteApi, draftApi } from '@/api'
import { parseImagesJson, resolveMediaUrl } from '@/utils/media'
import imageCompression from 'browser-image-compression'

const saving = ref(false)
const publishing = ref(false)
// 正在编辑的草稿 id（编辑草稿进入发布页后记住，发布/再存草稿时用到）
const editingDraftId = ref(null)
const compressing = ref(false)
const form = ref({ title: '', content: '', category: '' })
const images = ref([])
const fileList = ref([])
const existingImagePaths = ref([])
const topics = ref([])
const newTopic = ref('')
const videoUrl = ref('')
const videoUploading = ref(false)
const MAX_VIDEO_SIZE_MB = 200
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']

const canPublish = computed(() =>
  form.value.title.trim() &&
  form.value.content.trim() &&
  (images.value.length > 0 || videoUrl.value) &&
  !compressing.value &&
  !videoUploading.value
)

// 视频预览地址：把 /uploads/... 相对路径解析到后端，否则 Vite 下视频加载不出（黑屏）
const previewVideoUrl = computed(() => (videoUrl.value ? resolveMediaUrl(videoUrl.value) : ''))

const fillDraftForm = (draft) => {
  form.value.title = draft.title || ''
  form.value.content = draft.content || ''
  form.value.category = draft.category || ''

  topics.value = draft.category
    ? draft.category.split(',').filter(t => t.trim())
    : []

  images.value = []
  fileList.value = []
  existingImagePaths.value = []
  videoUrl.value = draft.video || draft.video_url || draft.videoUrl || ''

  const imageSource = draft.images || draft.image_urls || draft.imageUrls
  const parsedImages = parseImagesJson(imageSource)
  if (parsedImages.length > 0) {
    existingImagePaths.value = parsedImages
    images.value = parsedImages.map((img) => {
      if (typeof img !== 'string' || !img.trim()) return ''
      if (img.startsWith('data:') || img.startsWith('http')) return img
      return resolveMediaUrl(img)
    }).filter(Boolean)
  }
}

const triggerUpload = () => document.getElementById('imageUpload').click()
const triggerVideoUpload = () => document.getElementById('videoUpload').click()

// 视频上传
const handleVideoUpload = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    ElMessage.warning('只支持 mp4 / webm / ogg / mov 视频格式')
    return
  }
  if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
    ElMessage.warning(`视频不能超过 ${MAX_VIDEO_SIZE_MB}MB`)
    return
  }

  videoUploading.value = true
  try {
    const formData = new FormData()
    formData.append('video', file)
    const res = await noteApi.uploadVideo(formData)
    if (res.code === 200 && res.data?.videoUrl) {
      videoUrl.value = res.data.videoUrl
      ElMessage.success('视频上传成功')
    } else {
      ElMessage.error(res.msg || '视频上传失败')
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '视频上传失败')
  } finally {
    videoUploading.value = false
  }
}

const removeVideo = () => {
  videoUrl.value = ''
}

const drawGridOverlay = async (sourceFile) => {
  const imageUrl = URL.createObjectURL(sourceFile)
  try {
    const image = new Image()
    image.src = imageUrl
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
    })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 初始化失败')

    canvas.width = image.width
    canvas.height = image.height
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, image.width, image.height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) throw new Error('处理图片失败')

    return blob
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

const handleImageUpload = async (e) => {
  const files = e.target.files
  if (!files || files.length === 0) return

  compressing.value = true

  try {
    for (const file of Array.from(files)) {
      if (images.value.length >= 9) break
      if (!file.type.startsWith('image/')) continue
      if (file.size > 10 * 1024 * 1024) {
        ElMessage.warning(`图片 ${file.name} 超过10MB，已跳过`)
        continue
      }

      try {
        const options = {
          maxSizeMB: 0.3,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
          fileType: 'image/jpeg',
          initialQuality: 0.8
        }

        let compressedFile = file
        if (file.size > 200 * 1024) {
          compressedFile = await imageCompression(file, options)
        }

        const processedBlob = await drawGridOverlay(compressedFile)
        const processedFile = new File([processedBlob], `${Date.now()}-${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' })
        fileList.value.push(processedFile)

        const reader = new FileReader()
        await new Promise((resolve, reject) => {
          reader.onload = (ev) => {
            images.value.push(ev.target.result)
            resolve()
          }
          reader.onerror = reject
          reader.readAsDataURL(processedFile)
        })
      } catch (error) {
        console.error(`处理失败:`, error)
        fileList.value.push(file)
        const reader = new FileReader()
        await new Promise((resolve, reject) => {
          reader.onload = (ev) => {
            images.value.push(ev.target.result)
            resolve()
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }
    }
  } finally {
    compressing.value = false
  }

  e.target.value = ''
}

const removeImage = (index) => {
  images.value.splice(index, 1)
  fileList.value.splice(index, 1)
  existingImagePaths.value.splice(index, 1)
}

const addTopic = () => {
  const topic = newTopic.value.trim()
  if (topic && !topics.value.includes(topic)) {
    topics.value.push(topic)
  }
  newTopic.value = ''
}

const removeTopic = (index) => {
  topics.value.splice(index, 1)
}

const saveDraft = async () => {
  saving.value = true
  try {
    const topicStr = topics.value.join(',')
    // 使用 FormData 格式发送请求，参照发布作品的代码
    const formData = new FormData()
    formData.append('title', form.value.title)
    formData.append('content', form.value.content)
    formData.append('category', topicStr)
    if (videoUrl.value) {
      formData.append('video', videoUrl.value)
    }

    // 添加图片文件
    fileList.value.forEach((file) => {
      formData.append('images', file)
    })
    existingImagePaths.value.forEach((imagePath) => {
      formData.append('images', imagePath)
    })

    let res
    if (editingDraftId.value) {
      // 编辑已有草稿：更新原草稿，而不是新建重复条目
      res = await draftApi.editDraft(editingDraftId.value, formData)
    } else {
      // 新建草稿：保存后记住新草稿 id，后续再点「存为草稿」就更新这条
      res = await draftApi.saveDraft(formData)
      if (res.code === 200 && res.id) {
        editingDraftId.value = res.id
      }
    }
    if (res.code === 200) {
      ElMessage.success('已存为草稿')
      // 保留表单内容，方便继续编辑；不重置 editingDraftId，
      // 这样再次「存为草稿」会更新同一条草稿，内容不会丢
    } else {
      console.error(res.msg || '保存失败')
    }
  } catch (error) {
    console.error('保存草稿失败:', error)
  } finally {
    saving.value = false
  }
}

const buildPayload = () => {
  const topicStr = topics.value.join(',')
  const formData = new FormData()
  formData.append('title', form.value.title)
  formData.append('content', form.value.content)
  formData.append('category', topicStr)
  if (videoUrl.value) {
    formData.append('video', videoUrl.value)
  }

  existingImagePaths.value.forEach((imagePath) => {
    formData.append('images', imagePath)
  })

  fileList.value.forEach((file) => {
    formData.append('images', file)
  })

  return formData
}

const publishNote = async () => {
  if (!canPublish.value) return

  publishing.value = true
  try {
    const formData = buildPayload()
    const editingNote = localStorage.getItem('editingNote')

    if (editingNote) {
      const draft = JSON.parse(editingNote)
      const res = await noteApi.updateNote(draft.id, formData)
      if (res.code === 200) {
        localStorage.removeItem('editingNote')
      } else {
        console.error(res.msg || '修改失败')
      }
    } else {
      const res = await noteApi.publishNote(formData)
      if (res.code === 200) {
        ElMessage.success('发布成功')
        // 编辑草稿后发布：删除被编辑的草稿，避免草稿残留
        if (editingDraftId.value) {
          await draftApi.deleteDraft(editingDraftId.value)
          editingDraftId.value = null
        }
        // 兼容旧逻辑（publishingDraftId 目前无人写入，保留以防未来扩展）
        const legacyDraftId = localStorage.getItem('publishingDraftId')
        if (legacyDraftId) {
          await draftApi.deleteDraft(legacyDraftId)
          localStorage.removeItem('publishingDraftId')
        }
      } else {
        console.error(res.msg || '发布失败')
      }
    }

    form.value = { title: '', content: '', category: '' }
    images.value = []
    fileList.value = []
    existingImagePaths.value = []
    topics.value = []
    videoUrl.value = ''
  } catch (error) {
    console.error('发布失败:', error)
  } finally {
    publishing.value = false
  }
}

onMounted(() => {
  const draftSources = [
    { key: 'editingDraft', storage: localStorage },
    { key: 'editingNote', storage: localStorage }
  ]

  for (const source of draftSources) {
    const draftText = source.storage.getItem(source.key)
    if (!draftText) continue

    try {
      const draft = JSON.parse(draftText)
      fillDraftForm(draft)
      if (source.key === 'editingDraft' && draft.id) {
        editingDraftId.value = draft.id
      }
      source.storage.removeItem(source.key)
      break
    } catch (e) {
      console.error('解析草稿数据失败:', e)
      source.storage.removeItem(source.key)
    }
  }

  // 从拼豆图纸 / 拼小豆一键发布的图纸图片（dataURL）
  const publishImage = localStorage.getItem('pindouPublishImage')
  if (publishImage) {
    localStorage.removeItem('pindouPublishImage')
    try {
      const blob = dataUrlToBlob(publishImage)
      const file = new File([blob], `pindou-design-${Date.now()}.png`, { type: 'image/png' })
      fileList.value.push(file)
      images.value.push(publishImage)
      if (!form.value.title.trim()) {
        form.value.title = '我的拼豆图纸分享'
      }
      if (!form.value.content.trim()) {
        form.value.content = '用拼小豆 + 图纸转换生成的拼豆图纸，分享给大家~'
      }
    } catch (e) {
      console.error('解析拼豆图纸图片失败:', e)
    }
  }
})

/** dataURL 转 Blob */
const dataUrlToBlob = (dataUrl) => {
  const [meta, base64] = dataUrl.split(',')
  const mime = meta.match(/data:(.*?);/)?.[1] || 'image/png'
  const byteString = atob(base64)
  const arrayBuffer = new ArrayBuffer(byteString.length)
  const uint8Array = new Uint8Array(arrayBuffer)
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i)
  }
  return new Blob([uint8Array], { type: mime })
}
</script>

<style scoped lang="scss">
.publish-container {
  min-height: 100vh;
  background: #fff;
}

.publish-header {
  background: #fff;
  padding: 24px 0 16px;
  margin-bottom: 8px;
  border-bottom: 1px solid #f0f1f3;

  h2 {
    margin: 0;
    max-width: 1100px;
    margin: 0 auto;
    color: #111;
    font-size: 22px;
    font-weight: 700;
  }
}

.publish-layout {
  display: flex;
  gap: 24px;
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 30px 30px;
}

.publish-main {
  flex: 1;
  min-width: 0;
}

.publish-sidebar {
  width: 280px;
  flex-shrink: 0;
}

.publish-form {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.form-item {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
}

.title-input {
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-bottom: 1px solid #e8e8e8;
  border-radius: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
  transition: border-color 0.2s;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-bottom-color: #2ec4b5;
  }

  &::placeholder {
    color: #ccc;
    font-weight: normal;
  }
}

.content-textarea {
  width: 100%;
  padding: 16px;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  font-size: 15px;
  line-height: 1.7;
  color: #333;
  resize: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  min-height: 200px;

  &:focus {
    outline: none;
    border-color: #2ec4b5;
  }

  &::placeholder {
    color: #bbb;
  }
}

.topic-section {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.section-icon {
  font-size: 18px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.topic-input-wrapper {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.topic-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e8e8e8;
  border-radius: 20px;
  font-size: 13px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #2ec4b5;
  }
}

.add-topic-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: scale(1.05);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.topic-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.topic-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: linear-gradient(135deg, #e8f8f5 0%, #d0f0eb 100%);
  color: #2ec4b5;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
}

.topic-remove {
  cursor: pointer;
  opacity: 0.6;
  font-size: 14px;

  &:hover {
    opacity: 1;
  }
}

.topic-hint {
  font-size: 12px;
  color: #999;
  text-align: center;
  padding: 10px 0;
}

.action-section {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.btn-draft,
.btn-publish {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 25px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 10px;

  &:last-child {
    margin-bottom: 0;
  }
}

.btn-draft {
  background: #f5f5f5;
  color: #666;

  &:hover:not(:disabled) {
    background: #eee;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-publish {
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  color: #fff;

  &:hover:not(:disabled) {
    transform: scale(1.02);
    box-shadow: 0 4px 16px rgba(46, 196, 181, 0.4);
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
}

.upload-area-wrap {
  position: relative;
}

.upload-area {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

/* 图片压缩/处理中的遮罩 */
.upload-processing {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(3px);
  border-radius: 10px;
  color: #333;
  font-size: 14px;
  font-weight: 500;

  .processing-spinner {
    width: 30px;
    height: 30px;
    border: 3px solid rgba(46, 196, 181, 0.22);
    border-top-color: #2ec4b5;
  }
}

.upload-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: #f8f9fa;

  &.upload-add {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: 2px dashed #e0e0e0;
    transition: all 0.2s;

    &:hover {
      border-color: #2ec4b5;
      background: #e8f8f5;
    }
  }
}

.upload-icon {
  font-size: 28px;
  color: #aaa;
  margin-bottom: 4px;
}

.upload-text {
  font-size: 12px;
  color: #aaa;
}

.upload-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.upload-item:hover .upload-delete {
  opacity: 1;
}

.upload-input {
  display: none;
}

/* 视频上传 */
.upload-video-add {
  background: linear-gradient(135deg, #f0f9ff, #eefbf8);
  border-color: #b3e6e0 !important;
}

.video-preview {
  position: relative;
  margin-top: 12px;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #eceef1;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);

  .video-preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 14px;
    background: #fafbfc;
    border-bottom: 1px solid #f0f1f3;

    .video-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      color: #333;

      .el-icon {
        color: #2ec4b5;
      }
    }

    .video-remove {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: #fff;
      color: #ff5a5a;
      border: 1px solid #ffe3e3;
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;

      .el-icon {
        font-size: 13px;
      }

      &:hover {
        background: #fff1f1;
        border-color: #ffc9c9;
      }
    }
  }

  .video-preview-body {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f7f8fa;
    padding: 12px;

    .preview-video {
      /* 保持视频原始比例，不拉伸成全宽黑块 */
      max-width: 100%;
      max-height: 380px;
      width: auto;
      height: auto;
      display: block;
      border-radius: 8px;
      background: transparent;
    }
  }
}

.video-uploading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 14px;
  backdrop-filter: blur(4px);
}

/* 上传图片/视频图标（SVG） */
.upload-icon-svg {
  font-size: 26px;
  color: #2ec4b5;
}

.section-icon {
  display: inline-flex;
  align-items: center;
  font-size: 17px;
  color: #2ec4b5;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: #2ec4b5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>