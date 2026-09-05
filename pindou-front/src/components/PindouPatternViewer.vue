<template>
  <div class="pindou-pattern-viewer">
    <!-- 对比视图 -->
    <div class="compare-view">
      <div class="result-image">
        <h4>原图</h4>
        <img :src="result?.originalImage" alt="原图" class="result-img" />
      </div>
      <div class="result-image">
        <h4>缩略图</h4>
        <canvas ref="thumbnailCanvas" class="result-img"></canvas>
      </div>
    </div>

    <!-- 拼豆图纸（带缩放功能） -->
    <div class="pindou-grid-container">
      <div class="grid-header">
        <h4>拼豆图纸 ({{ result?.gridWidth }}×{{ result?.gridHeight }})</h4>
        <div class="zoom-controls">
          <button class="zoom-btn" @click="zoomOut" :disabled="zoomLevel <= 0.3">−</button>
          <span class="zoom-percent">{{ Math.round(zoomLevel * 100) }}%</span>
          <button class="zoom-btn" @click="zoomIn" :disabled="zoomLevel >= 3">+</button>
          <button class="zoom-btn reset-btn" @click="resetZoom">重置</button>
          <button class="zoom-btn fullscreen-btn" @click="toggleFullscreen"><el-icon :size="16"><FullScreen /></el-icon></button>
        </div>
      </div>
      <div class="view-style-bar">
        <span class="view-style-label">图纸样式</span>
        <button class="view-style-btn" :class="{ active: styleMode === 'blueprint' }" @click="setStyle('blueprint')">
          施工图纸（格子纸）
        </button>
        <button class="view-style-btn" :class="{ active: styleMode === 'pixel' }" @click="setStyle('pixel')">
          纯像素图（无格线标注）
        </button>
      </div>
      <div
        class="grid-wrapper"
        ref="gridWrapper"
        @wheel.prevent="handleWheel"
        @mousedown="startPan"
        @mousemove="pan"
        @mouseup="endPan"
        @mouseleave="endPan"
        :class="{ panning: isPanning }"
      >
        <div
          class="canvas-container"
          :style="{
            transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel})`,
            cursor: isPanning ? 'grabbing' : 'grab',
          }"
        >
          <canvas ref="gridCanvas" class="pindou-canvas" style="image-rendering: pixelated"></canvas>
        </div>
      </div>
    </div>

    <!-- 配色方案 -->
    <div class="color-palette">
      <h4><el-icon :size="16" color="#2d3436" style="vertical-align: -2px; margin-right: 6px"><Brush /></el-icon>配色方案</h4>
      <div class="color-list">
        <div
          v-for="color in result?.colorPalette || []"
          :key="color.code"
          class="color-item"
          :class="{ selected: selectedColor === color.code }"
          @click="selectedColor = selectedColor === color.code ? null : color.code"
        >
          <div class="color-dot" :style="{ backgroundColor: color.code }"></div>
          <span class="color-name">{{ color.name }}</span>
        </div>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats">
      <div class="stat-item">
        <span class="stat-label">总豆豆数</span>
        <span class="stat-value">{{ result?.totalPixels }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">颜色种类</span>
        <span class="stat-value">{{ result?.colorCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">预计时间</span>
        <span class="stat-value">{{ result?.estimatedTime }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">相似度</span>
        <span class="stat-value">{{ result?.similarity }}%</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-buttons">
      <button class="action-btn" @click="handleDownloadDesign"><el-icon :size="16"><Download /></el-icon><span>{{ styleMode === 'pixel' ? '下载像素图' : '下载图纸' }}</span></button>
      <button v-if="styleMode !== 'pixel'" class="action-btn secondary" @click="handleDownloadPixel"><el-icon :size="16"><Picture /></el-icon><span>下载像素图</span></button>
      <button class="action-btn" @click="handleDownloadPattern"><el-icon :size="16"><Grid /></el-icon><span>下载网格图</span></button>
      <button v-if="showSave" class="action-btn" @click="handleSave" :disabled="saving">
        <el-icon v-if="saving" class="is-loading" :size="16"><Loading /></el-icon>
        <el-icon v-else :size="16"><FolderOpened /></el-icon>
        <span>{{ saving ? '保存中...' : '保存到我的图纸' }}</span>
      </button>
      <button v-if="showPublish" class="action-btn" @click="handlePublish"><el-icon :size="16"><Upload /></el-icon><span>发布为笔记</span></button>
      <button v-if="showRegenerate" class="action-btn secondary" @click="emit('regenerate')">
        <el-icon :size="16"><RefreshRight /></el-icon><span>重新生成</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { drawPatternToCanvas, downloadDesign, downloadPixelOnly, downloadPattern } from '@/utils/pindou'

const props = defineProps({
  result: { type: Object, default: null },
  showSave: { type: Boolean, default: true },
  showPublish: { type: Boolean, default: true },
  showRegenerate: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'publish', 'regenerate'])

const thumbnailCanvas = ref(null)
const gridCanvas = ref(null)
const gridWrapper = ref(null)
const zoomLevel = ref(1)
const panX = ref(0)
const panY = ref(0)
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const selectedColor = ref(null)
// 图纸样式：'blueprint' = 施工图纸（格子纸：蓝网格+每10格粉色线+色号+行列编号）；'pixel' = 纯像素图（无格线无标注）
const styleMode = ref('blueprint')

const setStyle = (style) => {
  styleMode.value = style
  drawGrid()
}

// 绘制缩略图
const updateThumbnail = () => {
  if (!thumbnailCanvas.value || !props.result) return
  const ctx = thumbnailCanvas.value.getContext('2d')
  const { gridWidth, gridHeight } = props.result
  thumbnailCanvas.value.width = gridWidth
  thumbnailCanvas.value.height = gridHeight
  ctx.clearRect(0, 0, gridWidth, gridHeight)
  props.result.pixels.forEach((pixel, index) => {
    const x = index % gridWidth
    const y = Math.floor(index / gridWidth)
    ctx.fillStyle = pixel.color
    ctx.fillRect(x, y, 1, 1)
  })
}

// 绘制图纸（跟随当前样式：格子纸 / 纯像素）
const drawGrid = () => {
  if (!gridCanvas.value || !props.result) return
  drawPatternToCanvas(gridCanvas.value, props.result, { style: styleMode.value })
}

watch(
  () => props.result,
  (val) => {
    if (!val) return
    nextTick(() => {
      resetZoom()
      updateThumbnail()
      drawGrid()
    })
  },
  { immediate: true }
)

// ==================== 缩放与平移 ====================
const zoomIn = () => {
  if (zoomLevel.value >= 3) return
  const oldZoom = zoomLevel.value
  const newZoom = Math.min(zoomLevel.value + 0.25, 3)
  zoomLevel.value = newZoom
  if (gridWrapper.value) {
    const rect = gridWrapper.value.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const scale = newZoom / oldZoom
    panX.value = centerX - (centerX - panX.value) * scale
    panY.value = centerY - (centerY - panY.value) * scale
  }
}

const zoomOut = () => {
  if (zoomLevel.value <= 0.3) return
  const oldZoom = zoomLevel.value
  const newZoom = Math.max(zoomLevel.value - 0.25, 0.3)
  zoomLevel.value = newZoom
  if (gridWrapper.value) {
    const rect = gridWrapper.value.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const scale = newZoom / oldZoom
    panX.value = centerX - (centerX - panX.value) * scale
    panY.value = centerY - (centerY - panY.value) * scale
  }
}

const resetZoom = () => {
  zoomLevel.value = 1
  panX.value = 0
  panY.value = 0
}

const handleWheel = (event) => {
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const newZoom = Math.min(3, Math.max(0.3, zoomLevel.value + delta))
  if (newZoom !== zoomLevel.value) {
    const rect = gridWrapper.value.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    const scale = newZoom / zoomLevel.value
    panX.value = mouseX - (mouseX - panX.value) * scale
    panY.value = mouseY - (mouseY - panY.value) * scale
    zoomLevel.value = newZoom
  }
}

const startPan = (event) => {
  if (event.button !== 0) return
  isPanning.value = true
  panStart.value = { x: event.clientX - panX.value, y: event.clientY - panY.value }
  event.preventDefault()
}

const pan = (event) => {
  if (!isPanning.value) return
  panX.value = event.clientX - panStart.value.x
  panY.value = event.clientY - panStart.value.y
}

const endPan = () => {
  isPanning.value = false
}

const toggleFullscreen = () => {
  const wrapper = gridWrapper.value
  if (!document.fullscreenElement) {
    wrapper.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

// ==================== 下载 ====================
const handleDownloadDesign = () => {
  if (!props.result) return
  if (styleMode.value === 'pixel') {
    downloadPixelOnly(props.result)
  } else {
    downloadDesign(props.result)
  }
}

const handleDownloadPixel = () => {
  if (!props.result) return
  downloadPixelOnly(props.result)
}

// 保存 / 发布时把当前图纸样式一并交给父级，使生成的预览图与所选样式一致
const handleSave = () => emit('save', props.result, styleMode.value)
const handlePublish = () => emit('publish', props.result, styleMode.value)

const handleDownloadPattern = () => {
  if (!props.result) return
  downloadPattern(props.result, props.result.gridWidth)
}

defineExpose({ drawGrid, updateThumbnail })
</script>

<style scoped lang="scss">
.pindou-pattern-viewer {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.compare-view {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.result-image {
  text-align: center;

  h4 {
    margin-bottom: 12px;
    color: #636e72;
    font-size: 14px;
  }

  .result-img {
    max-width: 200px;
    max-height: 200px;
    border-radius: 8px;
    object-fit: contain;
    border: 1px solid #e8e8e8;
  }
}

.pindou-grid-container {
  width: 100%;

  .grid-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 10px;

    h4 {
      margin: 0;
      color: #636e72;
      font-size: 14px;
    }
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 8px;

    .zoom-btn {
      width: 32px;
      height: 32px;
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      transition: all 0.2s;

      &:hover:not(:disabled) {
        background: #2ec4b5;
        color: #fff;
        border-color: #2ec4b5;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &.reset-btn {
        width: 50px;
        font-size: 12px;
      }

      &.fullscreen-btn {
        width: 36px;
        font-size: 14px;
      }
    }

    .zoom-percent {
      min-width: 50px;
      text-align: center;
      font-size: 13px;
      color: #636e72;
    }
  }
}

.view-style-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;

  .view-style-label {
    font-size: 13px;
    color: #636e72;
  }

  .view-style-btn {
    padding: 6px 14px;
    border: 1px solid #d5e8e5;
    border-radius: 16px;
    background: #fff;
    font-size: 13px;
    color: #2d3436;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: #2ec4b5;
    }

    &.active {
      background: #2ec4b5;
      border-color: #2ec4b5;
      color: #fff;
    }
  }
}

.grid-wrapper {
  overflow: hidden;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #fff;
  position: relative;
  min-height: 360px;
  max-height: 70vh;
  cursor: grab;

  &.panning {
    cursor: grabbing;
  }

  .canvas-container {
    display: inline-block;
    transform-origin: 0 0;
    transition: transform 0.05s ease-out;
  }
}

.pindou-canvas {
  display: block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  pointer-events: none;
}

.color-palette {
  width: 100%;

  h4 {
    margin-bottom: 16px;
    color: #2d3436;
    font-size: 16px;
  }
}

.color-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.color-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #f8f9fa;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #eefbf8;
    transform: translateY(-2px);
  }

  &.selected {
    background: #2ec4b5;

    .color-name {
      color: #fff;
    }
  }

  .color-dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid #ddd;
  }

  .color-name {
    font-size: 14px;
    font-weight: bold;
    color: #2d3436;
    min-width: 40px;
  }
}

.stats {
  display: flex;
  justify-content: center;
  gap: 32px;
  padding: 20px;
  background: #f8fdfc;
  border-radius: 12px;
  flex-wrap: wrap;
  width: 100%;
  box-sizing: border-box;
}

.stat-item {
  text-align: center;

  .stat-label {
    display: block;
    font-size: 12px;
    color: #636e72;
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 20px;
    font-weight: 600;
    color: #2ec4b5;
  }
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #2ec4b5 0%, #20a99e 100%);
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(46, 196, 181, 0.3);
  }

  &.secondary {
    background: #f0f0f0;
    color: #636e72;

    &:hover {
      background: #e8e8e8;
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.grid-wrapper:fullscreen {
  max-height: 100vh;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;

  .canvas-container {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
