<script setup>
import SideBar from '@/components/SideBar.vue'
import FeedbackDialog from '@/components/FeedbackDialog.vue'
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRouteProgress } from '@/composables/useRouteProgress'

// 顶部路由加载进度条（懒加载 chunk 下载期间给出即时反馈）
const routeLoading = useRouteProgress()

const route = useRoute()
const router = useRouter()
const searchContent = ref('')
const searchHistory = ref([])
const showHistory = ref(false)
const historyStorageKey = 'pindou-search-history'
const feedbackVisible = ref(false)

const showHeader = computed(() => route.meta?.showHeader !== false)
const showSearch = computed(() => route.path === '/')

const searchPlaceholder = computed(() => route.query.q ? `搜索「${route.query.q}」` : '搜索笔记、作者、内容')

const loadSearchHistory = () => {
  try {
    const raw = localStorage.getItem(historyStorageKey)
    const list = raw ? JSON.parse(raw) : []
    searchHistory.value = Array.isArray(list) ? list.filter(Boolean).slice(0, 8) : []
  } catch {
    searchHistory.value = []
  }
}

const saveSearchHistory = (keyword) => {
  const next = [keyword, ...searchHistory.value.filter(item => item !== keyword)].slice(0, 8)
  searchHistory.value = next
  localStorage.setItem(historyStorageKey, JSON.stringify(next))
}

watch(
  () => route.query.q,
  (q) => {
    searchContent.value = (q || '').toString()
  },
  { immediate: true }
)

const handleSearch = () => {
  const keyword = searchContent.value.trim()
  if (keyword) saveSearchHistory(keyword)
  showHistory.value = false
  router.push({
    path: '/',
    query: keyword ? { q: keyword } : {}
  })
}

const handleSelectHistory = (keyword) => {
  searchContent.value = keyword
  handleSearch()
}

const clearHistory = () => {
  searchHistory.value = []
  localStorage.removeItem(historyStorageKey)
}

const handleSearchFocus = () => {
  showHistory.value = true
}

const handleSearchBlur = () => {
  setTimeout(() => {
    showHistory.value = false
  }, 120)
}

onMounted(() => {
  loadSearchHistory()
})

</script>
<template>
  <div class="layout-container">
    <!-- 路由切换进度条（顶部固定，避免懒加载/切换时空白“卡一下”） -->
    <div v-show="routeLoading" class="route-progress" aria-hidden="true">
      <span class="route-progress-bar"></span>
    </div>
    <SideBar />
    <div class="main-content">
      <el-header v-if="showHeader">
        <div v-if="showSearch" class="header-container">
          <div class="search-wrap">
            <div class="search-shell">
              <el-icon class="search-prefix">
                <Search />
              </el-icon>
              <input
                v-model="searchContent"
                :placeholder="searchPlaceholder"
                class="input-container"
                @focus="handleSearchFocus"
                @blur="handleSearchBlur"
                @keyup.enter="handleSearch"
              />
              <button v-if="searchContent" class="clear-btn" type="button" @click="searchContent = ''">×</button>
              <button class="search-btn" type="button" @click="handleSearch">搜索</button>
            </div>

            <transition name="history-fade">
              <div v-if="showHistory && searchHistory.length" class="history-panel">
                <div class="history-header">
                  <span>搜索历史</span>
                  <button type="button" class="history-clear" @click="clearHistory">清空</button>
                </div>
                <div class="history-list">
                  <button
                    v-for="item in searchHistory"
                    :key="item"
                    type="button"
                    class="history-item"
                    @mousedown.prevent="handleSelectHistory(item)"
                  >
                    <span class="history-icon">⏱</span>
                    <span class="history-text">{{ item }}</span>
                  </button>
                </div>
              </div>
            </transition>
          </div>
          <span class="feedback-link" title="意见反馈 / Bug 上报" @click="feedbackVisible = true">Bug反馈</span>
        </div>
      </el-header>
      <el-main class="main-view">
        <router-view v-slot="{ Component, route }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </router-view>
      </el-main>
    </div>
    <FeedbackDialog v-model="feedbackVisible" />
  </div>
</template>

<style scoped lang="scss">
.layout-container {
  display: flex;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  margin-left: 210px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.el-header {
  display: flex;
  position: relative;
  z-index: 50;
  height: 80px;
  align-items: center;
  justify-content: center;  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);
  border-bottom: 1px solid rgba(228, 231, 237, 0.9);
  backdrop-filter: blur(12px);

  .header-container {
    width: min(720px, calc(100vw - 320px));
    overflow: visible;
  }

  .search-wrap {
    position: relative;
  }

  /* 顶部最右：纯文字反馈入口（无按钮背景，点击弹窗） */
  .feedback-link {
    position: absolute;
    right: 28px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 13px;
    color: #0f766e;
    text-decoration: none;
    cursor: pointer;
    padding: 6px 8px;
    transition: color 0.18s ease;

    &:hover {
      color: #2ec4b5;
    }
  }

  .search-shell {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px 0 14px;
    border: 1px solid rgba(46, 196, 181, 0.18);
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(245, 255, 253, 0.96) 100%);
    box-shadow: 0 8px 24px rgba(26, 35, 126, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8);
    transition: all 0.22s ease;

    &:focus-within {
      border-color: rgba(46, 196, 181, 0.45);
      box-shadow: 0 10px 30px rgba(46, 196, 181, 0.14), 0 0 0 4px rgba(46, 196, 181, 0.08);
      transform: translateY(-1px);
    }
  }

  .search-prefix {
    color: #2ec4b5;
    font-size: 18px;
    flex-shrink: 0;
  }

  .input-container {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    outline: none;
    background-color: transparent;
    font-size: 14px;
    color: #1f2937;

    &::placeholder {
      color: #9aa4b2;
    }
  }

  .clear-btn,
  .search-btn {
    border: none;
    outline: none;
    cursor: pointer;
    flex-shrink: 0;
  }

  .clear-btn {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgba(148, 163, 184, 0.12);
    color: #64748b;
    font-size: 18px;
    line-height: 26px;
    padding: 0;
    transition: all 0.18s ease;

    &:hover {
      background: rgba(148, 163, 184, 0.2);
      color: #334155;
    }
  }

  .search-btn {
    height: 34px;
    padding: 0 16px;
    border-radius: 999px;
    background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 1px;
    box-shadow: 0 6px 16px rgba(46, 196, 181, 0.24);
    transition: all 0.18s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(46, 196, 181, 0.3);
    }
  }

  .history-panel {
    position: absolute;
    top: calc(100% + 10px);
    left: 0;
    right: 0;
    padding: 12px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(226, 232, 240, 0.95);
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
    backdrop-filter: blur(14px);
    z-index: 1000;
  }

  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 13px;
    color: #475569;
    font-weight: 600;
  }

  .history-clear {
    border: none;
    background: transparent;
    color: #2ec4b5;
    cursor: pointer;
    font-size: 12px;
    padding: 0;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: none;
    background: #f8fafc;
    border-radius: 12px;
    padding: 10px 12px;
    cursor: pointer;
    text-align: left;
    transition: all 0.18s ease;

    &:hover {
      background: #eefbf8;
      transform: translateY(-1px);
    }
  }

  .history-icon {
    font-size: 14px;
    color: #94a3b8;
    flex-shrink: 0;
  }

  .history-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #334155;
    font-size: 13px;
  }
}

@media (max-width: 900px) {
  .el-header {
    .header-container {
      width: calc(100vw - 280px);
    }

    .search-shell {
      height: 44px;
    }

    .search-btn {
      padding: 0 12px;
    }
  }
}

@media (max-width: 700px) {
  .el-header {
    .header-container {
      width: calc(100vw - 120px);
    }

    .feedback-link {
      right: 16px;
      font-size: 12px;
    }

    .history-panel {
      left: 50%;
      right: auto;
      width: min(100vw - 120px, 420px);
      transform: translateX(-50%);
    }
  }
}

.main-view {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.history-fade-enter-active,
.history-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.history-fade-enter-from,
.history-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.16s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

/* —— 顶部路由加载进度条 —— */
.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 2000;
  overflow: hidden;
  pointer-events: none;
  background: rgba(46, 196, 181, 0.08);

  .route-progress-bar {
    display: block;
    height: 100%;
    width: 38%;
    background: linear-gradient(90deg, #2ec4b5 0%, #1f9e92 100%);
    box-shadow: 0 0 10px rgba(46, 196, 181, 0.45);
    animation: route-progress-slide 0.9s ease-in-out infinite;
  }
}

@keyframes route-progress-slide {
  0% {
    transform: translateX(-110%);
  }
  50% {
    transform: translateX(120%);
  }
  100% {
    transform: translateX(280%);
  }
}
</style>
