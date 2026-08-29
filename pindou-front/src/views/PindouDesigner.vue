<template>
  <div class="pindou-designer">
    <!-- 头部 -->
    <div class="designer-header">
      <h2><el-icon :size="24" color="#2ec4b5" style="vertical-align: -3px; margin-right: 8px"><Brush /></el-icon>拼豆图纸生成器</h2>
      <p>上传图片，生成精确的拼豆图纸（算法与拼小豆 AI 共用同一引擎）</p>
    </div>

    <!-- 功能选项卡 -->
    <div class="tab-menu">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <el-icon :size="16"><component :is="tab.icon" /></el-icon>
        <span>{{ tab.name }}</span>
      </button>
    </div>

    <!-- 内容区域 -->
    <div class="designer-content">
      <!-- 上传区域 -->
      <div v-if="activeTab === 'upload'" class="upload-section">
        <div class="upload-area" @click="triggerUpload" @dragover.prevent @drop="handleDrop">
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="file-input"
            @change="handleFileSelect"
          />
          <div v-if="!uploadedImage" class="upload-placeholder">
            <span class="upload-icon"><el-icon :size="48" color="#b2bec3"><Camera /></el-icon></span>
            <p>点击或拖拽上传图片</p>
            <p class="hint">支持 JPG、PNG 格式，建议使用高清图片</p>
          </div>
          <div v-else class="image-preview">
            <img :src="uploadedImage" alt="上传的图片" class="preview-image" />
            <button class="remove-btn" @click="removeImage"><el-icon :size="16" color="#fff"><Close /></el-icon></button>
          </div>
        </div>

        <div class="options">
          <div class="option-group">
            <label>网格尺寸:</label>
            <select v-model="gridSize" class="grid-select">
              <option v-for="size in gridOptions" :key="size" :value="size">{{ size }}×{{ size }} {{ sizeLabel(size) }}</option>
            </select>
          </div>
          <div class="option-group">
            <label>颜色数量:</label>
            <select v-model="maxColors" class="grid-select">
              <option :value="0">不限制 (原图色彩)</option>
              <option v-for="c in colorOptions" :key="c" :value="c">{{ c }}色</option>
            </select>
          </div>
          <button class="generate-btn" @click="generatePindou" :disabled="!uploadedImage || isGenerating">
            <el-icon v-if="isGenerating" class="is-loading" :size="16"><Loading /></el-icon>
            <el-icon v-else :size="16"><MagicStick /></el-icon>
            <span>{{ isGenerating ? '生成中...' : '生成图纸' }}</span>
          </button>
          <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        </div>

        <!-- 高级选项 -->
        <div class="advanced-options">
          <label class="checkbox-label">
            <input type="checkbox" v-model="enableEdgeEnhance" />
            <span>边缘增强</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="enableDenoise" />
            <span>降噪处理</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="enableDithering" />
            <span>抖动效果</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="enableBrightnessBoost" />
            <span>亮度提升</span>
          </label>
        </div>
      </div>

      <!-- 图纸结果 -->
      <div v-if="activeTab === 'result'" class="result-section">
        <div v-if="pindouResult" class="result-content">
          <PindouPatternViewer
            :result="pindouResult"
            :show-regenerate="true"
            :saving="saving"
            @regenerate="generatePindou"
            @save="saveDesign"
            @publish="publishDesign"
          />
        </div>
        <div v-else class="empty-result">
          <span class="empty-icon"><el-icon :size="48" color="#b2bec3"><Grid /></el-icon></span>
          <p>还没有生成图纸</p>
          <p class="hint">请先上传图片或输入描述</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { PictureFilled, Brush, Camera, Close, Loading, MagicStick, Grid } from '@element-plus/icons-vue'
import PindouPatternViewer from '@/components/PindouPatternViewer.vue'
import { convertImageToPindou, drawPatternToCanvas, serializePixels } from '@/utils/pindou'
import { designApi } from '@/api'

const router = useRouter()

const tabs = [
  { id: 'upload', name: '图片上传', icon: PictureFilled },
  { id: 'result', name: '图纸结果', icon: Brush },
]

const gridOptions = [16, 24, 32, 48, 52, 64, 86, 128]
const colorOptions = [4, 6, 8, 12, 24, 32, 58, 88, 131, 292]

const sizeLabel = (size) => {
  const map = {
    16: '(小巧)', 24: '(适中)', 32: '(精细)', 48: '(高清)', 52: '(超清)',
    64: '(超大)', 86: '(超大高清)', 128: '(超高精度)',
  }
  return map[size] || ''
}

const activeTab = ref('upload')
const fileInput = ref(null)
const uploadedImage = ref(null)
const gridSize = ref(24)
const maxColors = ref(6)

const pindouResult = ref(null)
const isGenerating = ref(false)
const errorMessage = ref('')
const saving = ref(false)

// 高级选项
const enableEdgeEnhance = ref(true)
const enableDenoise = ref(true)
const enableDithering = ref(false)
const enableBrightnessBoost = ref(true)

// 上传相关
const triggerUpload = () => fileInput.value?.click()

const handleFileSelect = (event) => {
  const file = event.target.files?.[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => (uploadedImage.value = e.target.result)
    reader.readAsDataURL(file)
  }
}

const handleDrop = (event) => {
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (e) => (uploadedImage.value = e.target.result)
    reader.readAsDataURL(file)
  }
}

const removeImage = () => {
  uploadedImage.value = null
  if (fileInput.value) fileInput.value.value = ''
}

// 生成拼豆图纸（调用共享算法模块）
const generatePindou = async () => {
  if (!uploadedImage.value) return

  errorMessage.value = ''
  isGenerating.value = true

  try {
    activeTab.value = 'result'

    pindouResult.value = await convertImageToPindou(uploadedImage.value, gridSize.value, {
      edgeEnhance: enableEdgeEnhance.value,
      denoise: enableDenoise.value,
      dithering: enableDithering.value,
      maxColors: maxColors.value,
      brightnessBoost: enableBrightnessBoost.value,
    })

    await nextTick()
  } catch (error) {
    console.error('生成图纸失败:', error)
    errorMessage.value = error.message || '生成图纸失败，请重试'
    pindouResult.value = null
  } finally {
    isGenerating.value = false
  }
}

/** 将图纸渲染为 PNG dataURL（用于保存/发布） */
const renderPatternImage = (result) => {
  const canvas = document.createElement('canvas')
  drawPatternToCanvas(canvas, result, { pixelSize: 18, labelSize: 28 })
  return canvas.toDataURL('image/png')
}

// 保存到我的图纸
const saveDesign = async (result) => {
  if (!result) return
  saving.value = true
  try {
    const payload = {
      sourceImage: result.originalImage,
      gridWidth: result.gridWidth,
      gridHeight: result.gridHeight,
      gridSize: gridSize.value,
      maxColors: maxColors.value,
      pixels: serializePixels(result.pixels),
      palette: result.colorPalette,
      totalPixels: result.totalPixels,
      colorCount: result.colorCount,
      similarity: result.similarity,
      estimatedTime: result.estimatedTime,
      previewImage: renderPatternImage(result),
    }
    const res = await designApi.saveDesign(payload)
    if (res.code === 200) {
      ElMessage.success('图纸已保存到「我的图纸」~')
    } else {
      ElMessage.error(res.msg || '保存失败')
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

// 发布为笔记
const publishDesign = (result) => {
  if (!result) return
  const dataUrl = renderPatternImage(result)
  localStorage.setItem('pindouPublishImage', dataUrl)
  router.push('/publish')
}
</script>

<style scoped lang="scss">
.pindou-designer {
  min-height: 100vh;
  background: #ffffff;
  padding: 10px;
  box-sizing: border-box;
}

.designer-header {
  text-align: center;
  margin-bottom: 20px;

  h2 {
    font-size: 28px;
    color: #2d3436;
    margin-bottom: 8px;
  }

  p {
    color: #636e72;
    font-size: 14px;
  }
}

.tab-menu {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 24px;
}

.tab-btn {
  padding: 12px 24px;
  border: 2px solid #e8e8e8;
  border-radius: 24px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover {
    border-color: #2ec4b5;
    color: #2ec4b5;
  }

  &.active {
    background: linear-gradient(135deg, #2ec4b5 0%, #20a99e 100%);
    border-color: #2ec4b5;
    color: #fff;
    font-weight: 500;
  }
}

.designer-content {
  width: 100%;
  max-width: none;
  margin: 0;
}

.upload-section {
  background: #fff;
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.upload-area {
  border: 2px dashed #e8e8e8;
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;

  &:hover {
    border-color: #2ec4b5;
    background: #f8fdfc;
  }
}

.file-input {
  display: none;
}

.upload-placeholder {
  .upload-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 16px;
  }

  p {
    margin: 8px 0;
    color: #636e72;
    font-size: 15px;

    &.hint {
      font-size: 13px;
      color: #b2bec3;
    }
  }
}

.image-preview {
  position: relative;

  .preview-image {
    max-width: 400px;
    max-height: 300px;
    border-radius: 8px;
    object-fit: contain;
  }

  .remove-btn {
    position: absolute;
    top: -10px;
    right: -10px;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 50%;
    background: #ff6b6b;
    color: #fff;
    font-size: 20px;
    cursor: pointer;
    transition: transform 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;

    &:hover {
      transform: scale(1.1);
    }
  }
}

.options {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.option-group {
  display: flex;
  align-items: center;
  gap: 8px;

  label {
    font-size: 14px;
    color: #636e72;
    white-space: nowrap;
  }

  .grid-select {
    padding: 8px 16px;
    border: 2px solid #e8e8e8;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    background: #fff;

    &:focus {
      border-color: #2ec4b5;
    }
  }
}

.advanced-options {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #f0f0f0;
  flex-wrap: wrap;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #636e72;

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    accent-color: #2ec4b5;
  }
}

.generate-btn {
  padding: 12px 32px;
  background: linear-gradient(135deg, #2ec4b5 0%, #20a99e 100%);
  color: #fff;
  border: none;
  border-radius: 28px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: 0 4px 12px rgba(46, 196, 181, 0.3);

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(46, 196, 181, 0.4);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.result-section {
  background: #fff;
  padding: 10px;
  box-sizing: border-box;
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.empty-result {
  text-align: center;
  padding: 60px 20px;

  .empty-icon {
    font-size: 64px;
    display: block;
    margin-bottom: 16px;
  }

  p {
    margin: 8px 0;
    color: #636e72;

    &.hint {
      font-size: 13px;
      color: #b2bec3;
    }
  }
}

.error-message {
  color: #e74c3c;
  font-size: 13px;
  margin-top: 12px;
  text-align: center;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
