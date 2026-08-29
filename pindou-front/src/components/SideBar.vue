<script setup>
import { useRouter } from 'vue-router'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import LoginCard from '@/components/LoginCard.vue'

const router = useRouter()

import { routeNeedsLogin } from '@/constants/auth'
import { formatAvatar } from '@/utils/media'
import {
  unreadNoticeCount,
  unreadMessageCount,
  refreshUnreadBadges,
  setupUnreadBadgeListeners,
} from '@/composables/useUnreadBadges'

// 登录状态
const isLoggedIn = ref(false)
const userInfo = ref(null)
const showLoginCard = ref(false)

// 检查登录状态
const checkLoginStatus = () => {
  const token = localStorage.getItem('token')
  const user = localStorage.getItem('userInfo')
  if (token && user) {
    isLoggedIn.value = true
    const parsedUser = JSON.parse(user)
    parsedUser.avatar = formatAvatar(parsedUser.avatar)
    userInfo.value = parsedUser
    return true
  }
  isLoggedIn.value = false
  userInfo.value = null
  return false
}

const handleUserInfoUpdated = () => {
  checkLoginStatus()
}

// 页面加载时检查登录状态
let removeBadgeListeners = null
let refreshTimer = null

const handleWindowFocus = () => {
  if (checkLoginStatus()) {
    refreshUnreadBadges()
  }
}

onMounted(() => {
  checkLoginStatus()
  refreshUnreadBadges()
  removeBadgeListeners = setupUnreadBadgeListeners()
  window.addEventListener('showLoginModal', handleShowLoginModal)
  window.addEventListener('userInfoUpdated', handleUserInfoUpdated)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('visibilitychange', handleWindowFocus)
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && checkLoginStatus()) {
      refreshUnreadBadges()
    }
  }, 30000)
})

onUnmounted(() => {
  window.removeEventListener('showLoginModal', handleShowLoginModal)
  window.removeEventListener('userInfoUpdated', handleUserInfoUpdated)
  window.removeEventListener('focus', handleWindowFocus)
  window.removeEventListener('visibilitychange', handleWindowFocus)
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
  removeBadgeListeners?.()
})

// 处理显示登录卡片事件
const handleShowLoginModal = () => {
  if (showLoginCard.value) return
  showLoginCard.value = true
}

// 检查是否需要登录
const checkNeedLogin = (path) => routeNeedsLogin(path)

// 点击菜单项
const selectMenu = (item) => {
  const path = item.path.startsWith('/') ? item.path : '/' + item.path
  const currentPath = router.currentRoute.value.path
  
  const token = localStorage.getItem('token')
  const hasToken = !!token
  
  if (checkNeedLogin(path) && !hasToken) {
    localStorage.setItem('redirectAfterLogin', path)
    showLoginCard.value = true
    return
  }
  
  if (path === '/' && currentPath === '/') {
    window.dispatchEvent(new Event('refreshHome'))
    return
  }
  
  router.push(path)
  if (path === '/message') {
    clearMessageBadge()
    window.dispatchEvent(new Event('refreshUnreadBadges'))
  }
}

// el-menu 选择事件处理
const handleMenuSelect = (index) => {
  const currentPath = router.currentRoute.value.path
  
  const token = localStorage.getItem('token')
  const hasToken = !!token
  
  if (checkNeedLogin(index) && !hasToken) {
    localStorage.setItem('redirectAfterLogin', index)
    showLoginCard.value = true
    return
  }
  
  if (index === '/' && currentPath === '/') {
    window.dispatchEvent(new Event('refreshHome'))
    return
  }
  
  router.push(index)
  if (index === '/message') {
    clearMessageBadge()
    window.dispatchEvent(new Event('refreshUnreadBadges'))
  }
}

// 点击登录/我的
const handleLogin = () => {
  if (isLoggedIn.value) {
    // 已登录，跳转到个人中心
    router.push('/user')
  } else {
    // 未登录，显示登录卡片（不设置跳转路径，由之前的操作决定）
    showLoginCard.value = true
  }
}

// 登录成功回调
const handleLoginSuccess = (user) => {
  console.log('handleLoginSuccess - 收到用户:', user)
  isLoggedIn.value = true
  user.avatar = formatAvatar(user.avatar)
  userInfo.value = user
  showLoginCard.value = false
  console.log('handleLoginSuccess - isLoggedIn:', isLoggedIn.value)
  window.dispatchEvent(new Event('loginSuccess'))
  refreshUnreadBadges()

  const redirectPath = localStorage.getItem('redirectAfterLogin')
  setTimeout(() => {
    if (redirectPath) {
      localStorage.removeItem('redirectAfterLogin')
      router.push(redirectPath)
    } else {
      router.push('/')
    }
  }, 100)
}

// 退出登录
const handleLogout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('userInfo')
  isLoggedIn.value = false
  userInfo.value = null
  unreadNoticeCount.value = 0
  unreadMessageCount.value = 0
  router.push('/')
}

const menuBadgeCount = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (normalizedPath === '/notice') return unreadNoticeCount.value
  if (normalizedPath === '/message') return unreadMessageCount.value
  return 0
}

const hasBadge = (path) => menuBadgeCount(path) > 0

const clearMessageBadge = () => {
  unreadMessageCount.value = 0
}

// 获取菜单项列表（安全方式）
const menuItems = computed(() => {
  const children = router.options.routes[0]?.children || []
  return children.filter(item => item && item.path !== 'user' && item.meta?.icon)
})

// 当前路由路径，用于菜单选中状态
const currentRoute = computed(() => {
  const path = router.currentRoute.value.path
  if (path === '/user') {
    return '/user'
  }
  const menuPaths = menuItems.value.map(item => 
    item.path.startsWith('/') ? item.path : '/' + item.path
  )
  if (menuPaths.includes(path)) {
    return path
  }
  return '/'
})

</script>

<template>
  <el-aside width="210px" style="height: 100vh; position: fixed; left: 0; top: 0; border-right: 1px solid #e4e7ed; display: flex;flex-direction: column; overflow-y: auto;">
    <div class="logo">
      <p style="line-height: 55px;color:#fff;font-size:20px;font-weight: 700;">pindou</p>
    </div>
    <el-menu style="border: none; flex: 1;" :default-active="currentRoute" @select="handleMenuSelect">
      <el-menu-item v-for="item in menuItems" :key="item.path"
        :index="item.path.startsWith('/') ? item.path : '/' + item.path">
        <span class="menu-span">
          <span class="menu-label">
            <el-icon>
              <component :is="item.meta.icon" />
            </el-icon>
            <span>{{ item.meta.title }}</span>
          </span>
          <span
            v-if="hasBadge(item.path)"
            class="menu-badge"
            aria-hidden="true"
          ></span>
        </span>
      </el-menu-item>

      <!-- 未登录显示登录按钮，已登录显示头像+我的 -->
      <div v-if="!isLoggedIn" class="login-btn-wrapper">
        <button @click="handleLogin">登录</button>
      </div>
      <div v-else class="user-info-wrapper" :class="{ active: currentRoute === '/user' }" @click="handleLogin">
        <el-avatar :size="36"
          :src="userInfo?.avatar || 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'" />
        <span class="username">我的</span>
      </div>
    </el-menu>
    <div class="claim-container" v-if="!isLoggedIn">
      <p style="font-size: 16px;color: black;margin-bottom: 10px;"><el-icon>
          <Finished />
        </el-icon>马上登录即可</p>
      <p><el-icon>
          <Pointer />
        </el-icon>刷到更懂你的优质内容</p>
      <p><el-icon>
          <Search />
        </el-icon>搜索最新种草、拔草信息</p>
      <p><el-icon>
          <Star />
        </el-icon>查看收藏、点赞的笔记</p>
      <p><el-icon>
          <ChatSquare />
        </el-icon>与他人更好的互动、交流</p>
    </div>

    <!-- 退出登录按钮（仅登录状态显示） -->
    <div v-if="isLoggedIn" class="logout-wrapper">
      <button class="logout-btn" @click="handleLogout">退出登录</button>
    </div>
  </el-aside>
  
  <!-- 使用 Teleport 将登录卡片渲染到 body 上，避免被侧边栏的固定定位影响层级 -->
  <Teleport to="body">
    <LoginCard :show="showLoginCard" @close="showLoginCard = false" @login-success="handleLoginSuccess" />
  </Teleport>
</template>

<style scoped lang="scss">
.layout-container {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: start;

  .logo {
    margin-left: 20px;
    margin-top: 30px;
    margin-bottom: 100px;
    background-color: #2ec4b5;
    width: 100px;
    height: 55px;
    text-align: center;
    border-radius: 30px;

  }

  .el-menu-item {
    background-color: transparent;
    margin-bottom: 10px;
    margin-top: 10px;
    height: 50px;

    .menu-span {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      text-align: left;
      font-size: 18px;
      border-radius: 25px;
      gap: 8px;

      .menu-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .menu-badge {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        background: #ff4757;
        border-radius: 50%;
        box-shadow: 0 0 0 2px #fff;
      }
    }
  }

  .el-menu-item:focus {
    background-color: #a1e7e0;
    color: #fff;
    border-radius: 25px;
  }

  .el-menu-item.is-active {
    background-color: #2ec4b5;
    color: #fff;
    border-radius: 25px;

    .menu-span {
      color: #fff;
    }
  }

  .el-menu-item:hover {
    background-color: #a1e7e0;
    color: #fff;
    border-radius: 25px;
  }

  .claim-container {
    width: 210px;
    margin: 0 auto;
    margin-top: 50px;
    margin-bottom: 20px;
    font-size: 14px;
    line-height: 28px;
    color: #abadb1;
    border: #e4e7ed solid 1px;
    border-radius: 5px;
    padding: 10px;
  }

  .login-btn-wrapper {
    button {
      height: 50px;
      width: 100%;
      border: none;
      outline: none;
      background-color: #2ec4b5;
      color: #fff;
      border-radius: 30px;
      cursor: pointer;
      font-size: 18px;
    }
  }

  .user-info-wrapper {
    margin-top: 20px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    padding-left: 20px;
    cursor: pointer;
    border-radius: 25px;
    transition: all 0.3s;

    &:hover {
      background-color: #a1e7e0;
    }

    &.active {
      background-color: #2ec4b5;

      .username {
        color: #fff;
      }
    }

    .username {
      font-size: 18px;
      color: #333;
    }
  }

  .logout-wrapper {
    margin-top: auto;

    .logout-btn {
      margin-top: 20px;
      height: 50px;
      width: 100%;
      border: none;
      outline: none;
      background-color: #2ec4b5;
      color: #fff;
      border-radius: 30px;
      cursor: pointer;
      font-size: 18px;

      &:hover {
        background-color: #a1e7e0;
        color: #fff;
      }

      span {
        margin-left: 12px;
      }
    }
  }
}
</style>
