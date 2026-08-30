import { createRouter, createWebHistory } from 'vue-router'
import Layout from '@/components/Layout.vue'
import { useUserStore } from '@/stores/user'
import { installRouteProgress } from '@/composables/useRouteProgress'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // 切换页面时回到顶部（浏览器前进/后退则还原原位置），
  // 避免从很长的首页切到短页面时停留在旧滚动位置造成“卡一下”。
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      component: Layout,
      children: [
        {
          path: '/',
          meta: { title: '首页', icon: 'House', needLogin: false, showHeader: true },
          component: () => import('@/views/HomeView.vue')
        },
        {
          path: 'notice',
          meta: { title: '通知', icon: 'Message', needLogin: true, showHeader: false },
          component: () => import('@/views/NoticeView.vue')
        },
        {
          path: 'message',
          meta: { title: '消息', icon: 'ChatRound', needLogin: true, showHeader: false },
          component: () => import('@/views/MessageView.vue')
        },
        {
          path: 'user',
          meta: { title: '我的', icon: 'User', needLogin: true, showHeader: false },
          component: () => import('@/views/UserCenter.vue')
        },
        {
          path: 'publish',
          meta: { title: '发布', icon: 'Position', needLogin: true, showHeader: false },
          component: () => import('@/views/PublishView.vue')
        },
        {
          path: 'draft',
          meta: { title: '草稿', icon: 'Edit', needLogin: false, showHeader: false },
          component: () => import('@/views/DraftView.vue')
        },
        {
          path: 'designer',
          meta: { title: '图纸转换', icon: 'Switch', needLogin: false, showHeader: false },
          component: () => import('@/views/PindouDesigner.vue')
        },
        {
          path: 'pine-xiaodou',
          meta: { title: '拼小豆', icon: 'ChatDotRound', needLogin: false, showHeader: false },
          component: () => import('@/views/PineXiaoDouView.vue')
        },
        {
          path: 'user/:id',
          meta: { title: '用户主页', needLogin: false, showHeader: false },
          component: () => import('@/views/UserProfile.vue')
        },
        {
          path: 'designs',
          meta: { title: '我的图纸', icon: 'Picture', needLogin: true, showHeader: false },
          component: () => import('@/views/MyDesignsView.vue')
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// 注册全局路由加载进度（顶部进度条），避免懒加载切换时空白“卡一下”
installRouteProgress(router)

router.beforeEach((to, from, next) => {
  const store = useUserStore()
  const needLogin = to.matched.some((record) => record.meta?.needLogin)

  // 设置页面标题
  document.title = to.meta?.title ? `${to.meta.title} · 拼豆` : '拼豆'

  if (needLogin && !store.isLoggedIn) {
    store.openLogin()
    localStorage.setItem('redirectAfterLogin', to.fullPath)
    next('/')
    return
  }

  next()
})

export default router
