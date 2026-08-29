<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { userApi } from '@/api/index.js'
import { formatAvatar } from '@/utils/media'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['close', 'login-success'])
const form = reactive({
  username: '',
  password: ''
})
const checked = ref(false)
const loading = ref(false)

// 弹窗提示状态
const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref('error') // error, warning, success

const showToastMessage = (msg, type = 'error') => {
  toastMessage.value = msg
  toastType.value = type
  showToast.value = true
  ElMessage({
    message: msg,
    type,
    customClass: 'global-toast-message',
    duration: 2000,
    center: true,
  })
  setTimeout(() => {
    showToast.value = false
  }, 2000)
}

// 提交登录
const submitForm = async () => {
  // 校验空值
  if (!form.username) {
    showToastMessage('请输入账号')
    return
  }
  if (!form.password) {
    showToastMessage('请输入密码')
    return
  }
  // 校验协议勾选
  if (!checked.value) {
    showToastMessage('请先同意用户协议', 'warning')
    return
  }

  // 发起登录请求
  loading.value = true
  try {
    const res = await userApi.login({
      username: form.username,
      password: form.password
    })

    const user = {
      ...res.user,
      avatar: formatAvatar(res.user?.avatar)
    }

    localStorage.setItem('token', res.token)
    localStorage.setItem('userInfo', JSON.stringify(user))
    showToastMessage('登录成功', 'success')

    setTimeout(() => {
      emit('login-success', user)
      emit('close')
    }, 100)
  } catch (error) {
    showToastMessage(error?.msg || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="card-container" v-if="show" @click.self="emit('close')">
    <!-- 中间弹窗提示 -->
    <transition name="toast">
      <div v-if="showToast" class="toast-message" :class="toastType">
        {{ toastMessage }}
      </div>
    </transition>

    <div class="card-box">
      <div class="card-left" style="width: 50%;">
        <div class="left-content">
          <span class="tag">登录后推荐更懂你的笔记</span>
          <div class="logo">pindou</div>
          <div class="qrcode-box">
            <div class="qrcode"></div>
          </div>
          <p class="tip">可用 pindou 或 微信 扫码</p>
        </div>
      </div>
      <div class="card-right" style="width: 50%;">
        <div class="close-btn" @click="emit('close')"><el-icon :size="16"><Close /></el-icon></div>
        <h2 class="title">账号登录</h2>
        <el-form :model="form" class="login-form">
          <el-form-item>
            <el-input v-model="form.username" placeholder="输入账号" class="login-input" size="large" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.password" type="password" placeholder="输入密码" class="login-input" size="large"
              show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" class="login-btn" @click="submitForm" :loading="loading">登录</el-button>
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="checked" class="agree-checkbox">
              我已阅读并同意
              <a href="#" class="link">《用户协议》</a>
              和
              <a href="#" class="link">《隐私政策》</a>
            </el-checkbox>
          </el-form-item>
        </el-form>
        <p class="new-user">新用户可直接登录</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.card-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  pointer-events: auto;

  // 中间弹窗提示样式
  .toast-message {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 12px;
    color: #fff;
    z-index: 10000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    white-space: nowrap;
    background: rgba(80, 80, 80, 0.9);
  }

  // 弹窗动画
  .toast-enter-active,
  .toast-leave-active {
    transition: all 0.3s ease;
  }

  .toast-enter-from,
  .toast-leave-to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.9);
  }

  .card-box {
    display: flex;
    width: 800px;
    height: 500px;
    background-color: #fff;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  }

  .card-left {
    background: linear-gradient(135deg, #2ec4b5 0%, #26a69a 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;

    .left-content {
      text-align: center;
      color: #fff;

      .tag {
        display: inline-block;
        padding: 8px 24px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 30px;
        font-size: 14px;
        margin-bottom: 30px;
      }

      .logo {
        font-size: 36px;
        font-weight: bold;
        margin-bottom: 30px;
        color: #fff;
      }

      .qrcode-box {
        background: #fff;
        padding: 20px;
        border-radius: 10px;
        display: inline-block;
        margin-bottom: 20px;

        .qrcode {
          width: 120px;
          height: 120px;
          background: #f5f5f5;
          border-radius: 8px;
        }
      }

      .tip {
        font-size: 14px;
        opacity: 0.9;
      }
    }
  }

  .card-right {
    display: flex;
    flex-direction: column;
    padding: 40px;
    box-sizing: border-box;
    position: relative;

    .close-btn {
      position: absolute;
      top: 20px;
      right: 20px;
      width: 32px;
      height: 32px;
      line-height: 30px;
      text-align: center;
      font-size: 24px;
      color: #999;
      cursor: pointer;
      border-radius: 50%;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        background: #f5f5f5;
        color: #666;
      }
    }

    .title {
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 30px;
      color: #333;
    }

    .login-form {
      width: 100%;
    }

    .login-input {
      width: 100%;
      border-radius: 30px;

      :deep(.el-input__wrapper) {
        border-radius: 30px;
        background: #f8f9fa;
        border: none;
        box-shadow: none;
      }

      :deep(.el-input__wrapper.is-focus) {
        border: none;
        box-shadow: none;
        outline: none;
      }

      :deep(.el-input__inner) {
        background: transparent;
      }
    }

    .login-btn {
      width: 100%;
      height: 48px;
      background: linear-gradient(135deg, #2ec4b5 0%, #26a69a 100%);
      border: none;
      border-radius: 24px;
      color: #fff;
      font-size: 16px;
      font-weight: 500;
      margin-top: 8px;
      margin-bottom: 20px;
      transition: all 0.3s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 15px rgba(46, 196, 181, 0.4);
      }
    }

    .agree-checkbox {
      font-size: 12px;
      color: #999;
      margin-bottom: 20px;

      :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
        background-color: #2ec4b5;
        border-color: #2ec4b5;
      }

      .link {
        color: #2ec4b5;
        text-decoration: none;
        margin: 0 4px;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    .new-user {
      text-align: center;
      font-size: 12px;
      color: #999;
      margin-top: auto;
    }
  }
}
</style>
