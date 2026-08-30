<template>
  <span class="sk-avatar" :style="{ width: size + 'px', height: size + 'px' }">
    <!-- 加载中：圆形 shimmer -->
    <span v-if="!loaded && !failed && src" class="sk-shimmer-bg sk-avatar-shimmer"></span>
    <!-- 真实头像：加载后淡入 -->
    <img
      v-if="src"
      :src="src"
      :alt="name"
      class="sk-avatar-img"
      :class="{ loaded }"
      loading="lazy"
      @load="loaded = true"
      @error="failed = true"
    />
    <!-- 失败 / 无图：昵称首字占位 -->
    <span
      v-if="failed || !src"
      class="sk-avatar-fallback sk-fallback-bg"
      :style="{ fontSize: Math.round(size * 0.42) + 'px' }"
    >{{ initial }}</span>
  </span>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: Number, default: 36 },
})

const loaded = ref(false)
const failed = ref(false)

// 昵称首字（取昵称或用户名的第一个字符）
const initial = computed(() => {
  const n = (props.name || '').trim()
  return n ? n[0].toUpperCase() : '?'
})

watch(
  () => props.src,
  () => {
    loaded.value = false
    failed.value = false
  }
)
</script>

<style scoped>
.sk-avatar {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  background: #eef1f4;
  vertical-align: middle;
}

.sk-avatar-shimmer {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.sk-avatar-img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.sk-avatar-img.loaded {
  opacity: 1;
}

.sk-avatar-fallback {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  border-radius: 50%;
}
</style>
