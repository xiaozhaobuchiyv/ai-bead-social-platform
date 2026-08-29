import { ref } from 'vue'
import { noticeApi, messageApi } from '@/api'

export const unreadNoticeCount = ref(0)
export const unreadMessageCount = ref(0)

export async function refreshUnreadBadges() {
  const token = localStorage.getItem('token')
  if (!token) {
    unreadNoticeCount.value = 0
    unreadMessageCount.value = 0
    return
  }

  const silentRequest = { silent: true }

  try {
    const [noticeRes, messageRes] = await Promise.all([
      noticeApi.getUnreadCount(silentRequest).catch(() => ({ count: 0 })),
      messageApi.getUnreadCount(silentRequest).catch(() => ({ count: 0 })),
    ])
    unreadNoticeCount.value = Number(noticeRes?.count ?? 0)
    unreadMessageCount.value = Number(messageRes?.count ?? 0)
  } catch {
    unreadNoticeCount.value = 0
    unreadMessageCount.value = 0
  }
}

export function setupUnreadBadgeListeners() {
  const onRefresh = () => refreshUnreadBadges()
  window.addEventListener('loginSuccess', onRefresh)
  window.addEventListener('refreshUnreadBadges', onRefresh)
  return () => {
    window.removeEventListener('loginSuccess', onRefresh)
    window.removeEventListener('refreshUnreadBadges', onRefresh)
  }
}
