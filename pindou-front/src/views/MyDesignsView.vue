<template>
  <div class="my-designs">
    <header class="designs-header">
      <h2><el-icon :size="22" color="#2ec4b5" style="vertical-align: -3px; margin-right: 6px"><FolderOpened /></el-icon>我的图纸</h2>
      <p>在拼小豆 / 图纸转换中一键保存的拼豆图纸</p>
    </header>

    <!-- 图纸列表 -->
    <div v-if="designs.length" class="designs-grid">
      <div v-for="design in designs" :key="design.id" class="design-card" @click="openDetail(design)">
        <div class="design-preview">
          <img
            v-if="design.previewImage"
            :src="resolveMediaUrl(design.previewImage)"
            :alt="`${design.gridWidth}x${design.gridHeight} 图纸`"
          />
          <div v-else class="no-preview"><el-icon :size="44" color="#cbd5e1"><Grid /></el-icon></div>
          <span class="design-size">{{ design.gridWidth }}×{{ design.gridHeight }}</span>
        </div>
        <div class="design-info">
          <div class="design-meta">
            <span class="meta-item"><el-icon :size="14" color="#64748b"><Brush /></el-icon> {{ design.colorCount }} 色</span>
            <span class="meta-item"><el-icon :size="14" color="#64748b"><Odometer /></el-icon> {{ design.similarity }}%</span>
            <span class="meta-item"><el-icon :size="14" color="#64748b"><Timer /></el-icon> {{ design.estimatedTime }}</span>
          </div>
          <div class="design-time">{{ formatTime(design.createdAt) }}</div>
        </div>
        <div class="design-actions">
          <button class="design-btn view-btn" @click.stop="openDetail(design)">查看</button>
          <button class="design-btn publish-btn" @click.stop="publishDesign(design)">发布</button>
          <button class="design-btn delete-btn" @click.stop="deleteDesign(design)">删除</button>
        </div>
      </div>
    </div>

    <div v-else-if="loading" class="empty-state">加载中...</div>
    <div v-else class="empty-state">
      <span class="empty-icon"><el-icon :size="48" color="#94a3b8"><Grid /></el-icon></span>
      <p>还没有保存过图纸</p>
      <p class="hint">去「拼小豆」或「图纸转换」生成一张试试~</p>
      <div class="empty-actions">
        <button class="empty-btn" @click="$router.push('/pine-xiaodou')">去拼小豆</button>
        <button class="empty-btn" @click="$router.push('/designer')">去图纸转换</button>
      </div>
    </div>

    <!-- 分页加载 -->
    <div v-if="hasMore" class="load-more">
      <button class="load-more-btn" :disabled="loading" @click="loadMore">
        {{ loading ? '加载中...' : '加载更多' }}
      </button>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="detailVisible" class="detail-mask" @click.self="detailVisible = false">
      <div class="detail-dialog">
        <div class="detail-header">
          <h3><el-icon :size="18" color="#2ec4b5" style="vertical-align: -3px; margin-right: 6px"><Grid /></el-icon>图纸详情 ({{ detailResult?.gridWidth }}×{{ detailResult?.gridHeight }})</h3>
          <button class="detail-close" @click="detailVisible = false"><el-icon :size="16"><Close /></el-icon></button>
        </div>
        <div class="detail-body">
          <PindouPatternViewer
            v-if="detailResult"
            :result="detailResult"
            :show-save="false"
            :show-publish="true"
            @publish="publishDesign"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { designApi } from '@/api'
import { deserializePixels, drawPatternToCanvas } from '@/utils/pindou'
import PindouPatternViewer from '@/components/PindouPatternViewer.vue'

const router = useRouter()

const designs = ref([])
const loading = ref(false)
const hasMore = ref(false)
const page = ref(1)
const pageSize = 12

const detailVisible = ref(false)
const detailResult = ref(null)
const currentDesign = ref(null)

const resolveMediaUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/uploads/')) {
    const base = import.meta.env.VITE_API_BASE || ''
    return `${base.replace(/\/$/, '') || 'http://localhost:3000'}${url}`
  }
  return url
}

const formatTime = (t) => {
  if (!t) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const loadList = async (reset = false) => {
  if (loading.value) return
  loading.value = true
  try {
    const res = await designApi.getDesignList({ page: page.value, pageSize })
    if (res.code === 200) {
      designs.value = reset ? res.data.list : [...designs.value, ...res.data.list]
      hasMore.value = page.value < res.data.pagination.totalPages
    } else {
      ElMessage.error(res.msg || '加载失败')
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadMore = () => {
  page.value += 1
  loadList()
}

/** 打开详情：反序列化像素并渲染 */
const openDetail = (design) => {
  currentDesign.value = design
  const palette = Array.isArray(design.palette) ? design.palette : []
  detailResult.value = {
    pixels: deserializePixels(design.pixels, palette),
    colorPalette: palette,
    totalPixels: design.totalPixels,
    colorCount: design.colorCount,
    estimatedTime: design.estimatedTime,
    similarity: design.similarity,
    originalImage: resolveMediaUrl(design.sourceImage),
    gridWidth: design.gridWidth,
    gridHeight: design.gridHeight,
  }
  detailVisible.value = true
}

/** 一键发布为笔记 */
const publishDesign = (design) => {
  const target = design?.id ? design : currentDesign.value
  if (!target) return
  const canvas = document.createElement('canvas')
  drawPatternToCanvas(canvas, detailResult.value || {
    pixels: deserializePixels(target.pixels, target.palette || []),
    gridWidth: target.gridWidth,
    gridHeight: target.gridHeight,
  })
  localStorage.setItem('pindouPublishImage', canvas.toDataURL('image/png'))
  detailVisible.value = false
  ElMessage.success('已带图跳转发布页~')
  router.push('/publish')
}

const deleteDesign = async (design) => {
  try {
    await ElMessageBox.confirm('确定删除这张图纸吗？', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    const res = await designApi.deleteDesign(design.id)
    if (res.code === 200) {
      designs.value = designs.value.filter((d) => d.id !== design.id)
      if (detailVisible.value && currentDesign.value?.id === design.id) {
        detailVisible.value = false
      }
      ElMessage.success('删除成功')
    } else {
      ElMessage.error(res.msg || '删除失败')
    }
  } catch (error) {
    ElMessage.error(error?.msg || error?.message || '删除失败')
  }
}

onMounted(() => loadList(true))
</script>

<style scoped lang="scss">
.my-designs {
  min-height: 100vh;
  background: #fff;
  padding: 16px;
  box-sizing: border-box;
}

.designs-header {
  text-align: center;
  margin-bottom: 24px;

  h2 {
    font-size: 26px;
    color: #2d3436;
    margin-bottom: 6px;
  }

  p {
    color: #636e72;
    font-size: 14px;
  }
}

.designs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.design-card {
  background: #fff;
  border: 1px solid #eef2f5;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
  }
}

.design-preview {
  position: relative;
  aspect-ratio: 1;
  background: #f8fafc;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .no-preview {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    font-size: 48px;
  }

  .design-size {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.72);
    color: #fff;
    font-size: 12px;
  }
}

.design-info {
  padding: 12px 14px 8px;

  .design-meta {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #64748b;
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .design-time {
    margin-top: 6px;
    font-size: 12px;
    color: #94a3b8;
  }
}

.design-actions {
  display: flex;
  gap: 8px;
  padding: 0 14px 14px;
}

.design-btn {
  flex: 1;
  height: 32px;
  border: none;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;

  &.view-btn {
    background: linear-gradient(135deg, #2ec4b5, #23b7a8);
    color: #fff;
  }

  &.publish-btn {
    background: #eefbf8;
    color: #0f766e;
  }

  &.delete-btn {
    background: #fef2f2;
    color: #dc2626;
  }
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  color: #64748b;

  .empty-icon {
    font-size: 56px;
    display: block;
    margin-bottom: 14px;
  }

  p {
    margin: 6px 0;

    &.hint {
      color: #94a3b8;
      font-size: 13px;
    }
  }
}

.empty-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 18px;

  .empty-btn {
    padding: 10px 22px;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, #2ec4b5, #23b7a8);
    color: #fff;
    cursor: pointer;
    font-size: 14px;
  }
}

.load-more {
  text-align: center;
  margin-top: 24px;

  .load-more-btn {
    padding: 10px 28px;
    border: 1px solid #2ec4b5;
    border-radius: 999px;
    background: #fff;
    color: #2ec4b5;
    cursor: pointer;
    font-size: 14px;
  }
}

.detail-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.detail-dialog {
  width: min(880px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eef2f5;

  h3 {
    margin: 0;
    font-size: 17px;
    color: #102a43;
  }
}

.detail-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.detail-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}
</style>
