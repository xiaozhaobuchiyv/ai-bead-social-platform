import axios from 'axios'
import { ElMessage } from 'element-plus'

const showToast = (message, type = 'error') => {
  if (type === 'success') {
    ElMessage({
      message,
      type: 'success',
      customClass: 'global-toast-message',
      duration: 2000,
      center: true,
      plain: false,
    })
    return
  }
  ElMessage({
    message,
    type,
    customClass: 'global-toast-message',
    duration: 2000,
    center: true,
    plain: false,
  })
}

const service = axios.create({
  baseURL: '/api',
  timeout: 120000,
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
  headers: {
    Accept: 'application/json',
  },
})

service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers['token'] = token
    }
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    return config
  },
  (error) => Promise.reject(error)
)

service.interceptors.response.use(
  (response) => {
    const { data, config } = response
    if (data.code === 200) {
      return data
    }

    const silent = config?.silent === true
    if (data.code === 401 && !config.url?.includes('/users/login')) {
      if (!silent) {
        showToast(data.msg || '登录过期，请重新登录', 'error')
      }
      localStorage.removeItem('token')
      localStorage.removeItem('userInfo')
      window.dispatchEvent(new Event('showLoginModal'))
    } else if (data.code !== 401 && !silent) {
      showToast(data.msg || '请求失败', 'error')
    }

    return Promise.reject(data)
  },
  (error) => {
    if (!error?.config?.silent) {
      ElMessage.error(error.message || '网络请求失败')
    }
    return Promise.reject(error)
  }
)

export default service
