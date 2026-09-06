/**
 * 用户认证 Store（Pinia）
 * 统一管理登录态：token / userInfo / 登录弹窗
 * 与 localStorage 保持同步，兼容既有组件的事件通知机制
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { userApi } from '@/api'
import { formatAvatar } from '@/utils/media'

const TOKEN_KEY = 'token'
const USER_KEY = 'userInfo'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const userInfo = ref(null)
  const showLoginModal = ref(false)

  try {
    userInfo.value = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    userInfo.value = null
  }

  /** 从 localStorage 同步真实登录态。
   * 登录卡片（LoginCard→SideBar）走的是“直接写 localStorage + login-success 事件”的路径，
   * 不会更新本 store 的 token/userInfo；若不同步，store.isLoggedIn 永远为 false，
   * 手机端（顶部登录按钮/底部导航/路由守卫都读 store）登录成功后仍会反复弹出登录框。 */
  const syncFromStorage = () => {
    token.value = localStorage.getItem(TOKEN_KEY) || ''
    try {
      userInfo.value = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    } catch {
      userInfo.value = null
    }
  }

  // 登录成功 / 资料更新 / 退出后，把 localStorage 里的真实登录态同步进 store
  // （store 为单例，随页面一起销毁，无需手动移除监听）
  if (typeof window !== 'undefined') {
    window.addEventListener('loginSuccess', syncFromStorage)
    window.addEventListener('userInfoUpdated', syncFromStorage)
    window.addEventListener('logoutSuccess', syncFromStorage)
  }

  const isLoggedIn = computed(() => Boolean(token.value && userInfo.value))

  /** 登录/自动注册 */
  async function login(payload) {
    const res = await userApi.login(payload)
    if (res.code !== 200) throw new Error(res.msg || '登录失败')
    token.value = res.token
    userInfo.value = { ...res.user, avatar: formatAvatar(res.user?.avatar) }
    localStorage.setItem(TOKEN_KEY, res.token)
    localStorage.setItem(USER_KEY, JSON.stringify(userInfo.value))
    showLoginModal.value = false
    window.dispatchEvent(new Event('loginSuccess'))
    window.dispatchEvent(new Event('userInfoUpdated'))
    return res
  }

  /** 刷新本地资料 */
  function setUserInfo(user) {
    userInfo.value = { ...user, avatar: formatAvatar(user?.avatar) }
    localStorage.setItem(USER_KEY, JSON.stringify(userInfo.value))
    window.dispatchEvent(new Event('userInfoUpdated'))
  }

  /** 退出登录 */
  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    window.dispatchEvent(new Event('logoutSuccess'))
  }

  function openLogin() {
    showLoginModal.value = true
  }

  function closeLogin() {
    showLoginModal.value = false
  }

  /** 需要登录的操作：未登录则弹窗并返回 false */
  function requireLogin() {
    if (!isLoggedIn.value) {
      openLogin()
      return false
    }
    return true
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    showLoginModal,
    login,
    logout,
    setUserInfo,
    openLogin,
    closeLogin,
    requireLogin,
  }
})
