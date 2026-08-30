/**
 * 全局路由加载进度
 * -------------------------------------------------
 * 路由组件是懒加载（dynamic import），首次切换到未加载过的页面时
 * 会有一段等待 chunk 下载的时间，页面此时为空白。这里用一个顶部
 * 进度条即时给出反馈，避免“点了没反应/卡一下”的体感。
 *
 * 只在导航进行期间显示（beforeEach → afterEach），结束即隐藏：
 * - 已加载过的页面秒切，进度条几乎不可见，不产生“无谓的等待感”；
 * - 首次进入未加载的页面（需下载 chunk）时进度条可见。
 *
 * 通过 `installRouteProgress(router)`（在 router/index.js 调用）注册
 * 全局钩子，组件仅通过 `useRouteProgress()` 读取状态，避免循环依赖。
 */
import { ref } from 'vue'

const loading = ref(false)

let installed = false

export function installRouteProgress(router) {
  if (installed || !router) return
  installed = true

  router.beforeEach((to, from, next) => {
    loading.value = true
    next()
  })

  router.afterEach(() => {
    loading.value = false
  })
}

export function useRouteProgress() {
  return loading
}
