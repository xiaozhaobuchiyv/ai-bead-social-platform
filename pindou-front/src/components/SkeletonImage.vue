<template>
  <div class="sk-image" :style="{ minHeight: minHeight + 'px' }">
    <!-- 加载中：骨架屏 shimmer -->
    <div v-if="!loaded && !failed && src" class="sk-shimmer"></div>
    <!-- 真实图片：加载完成后淡入 -->
    <img
      v-if="src"
      :src="src"
      :alt="alt"
      class="sk-el"
      :class="{ loaded }"
      loading="lazy"
      @load="loaded = true"
      @error="failed = true"
    />
    <!-- 失败 / 无图：优雅占位 -->
    <div v-if="failed || !src" class="sk-fallback">
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
      <span v-if="text" class="sk-fallback-text">{{ text }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  // 加载骨架的最小高度，避免加载前空白
  minHeight: { type: Number, default: 260 },
  // 失败/无图时的提示文字
  text: { type: String, default: '' },
})

const loaded = ref(false)
const failed = ref(false)

watch(
  () => props.src,
  () => {
    loaded.value = false
    failed.value = false
  }
)
</script>

<style scoped>
.sk-image {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: #eef1f4;
}

/* 骨架屏：动态 shimmer 渐变 */
.sk-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #eef1f4 25%, #e3e8ee 37%, #eef1f4 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

@keyframes sk-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

/* 真实图片：占满容器、覆盖骨架、加载后淡入 */
.sk-el {
  position: relative;
  z-index: 1;
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.sk-el.loaded {
  opacity: 1;
}

/* 失败 / 无图占位 */
.sk-fallback {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #c3cad5;
  background: linear-gradient(180deg, #f6f7f9 0%, #eef1f4 100%);
}

.sk-fallback-text {
  font-size: 12px;
  color: #a9b2bd;
}
</style>
