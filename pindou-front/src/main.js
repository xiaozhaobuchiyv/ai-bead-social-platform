import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import './style.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus)
// 全局注册ElementPlusIconsVue图标组件
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 全局指令：让视频播放器的默认音量为 50%（避免默认全音量太大声）。
// 可传值指定，默认 0.5。静音封面（muted）不受影响。
const DEFAULT_VIDEO_VOLUME = 0.5
function applyVideoVolume(el) {
  if (!el || typeof el.volume !== 'number' || el.muted) return
  try {
    el.volume = DEFAULT_VIDEO_VOLUME
  } catch (e) {
    /* ignore */
  }
}
app.directive('video-volume', {
  mounted(el) {
    applyVideoVolume(el)
    // 某些情况下源码变化/元数据加载后会重置音量，这里兜底再次设置
    const onMeta = () => applyVideoVolume(el)
    const onCanplay = () => applyVideoVolume(el)
    el.__videoVolumeHandlers = { onMeta, onCanplay }
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('canplay', onCanplay)
  },
  unmounted(el) {
    const h = el.__videoVolumeHandlers
    if (h) {
      el.removeEventListener('loadedmetadata', h.onMeta)
      el.removeEventListener('canplay', h.onCanplay)
      el.__videoVolumeHandlers = null
    }
  }
})

app.mount('#app')
