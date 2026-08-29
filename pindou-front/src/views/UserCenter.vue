<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { userApi, noteApi, actionApi, collectionApi, messageApi, followApi } from '@/api';
import NoteDetailCard from '@/components/NoteDetailCard.vue';
import XhsIcon from '@/components/XhsIcon.vue';
import { parseImagesJson, resolveMediaUrl, formatAvatar } from '@/utils/media';

const router = useRouter();

// 用户信息
const userInfo = ref({
  id: '',
  username: '',
  nickname: '',
  avatar: '',
  signature: '',
  create_time: ''
});

// 签名编辑状态
const editingSignature = ref(false);
const signatureInput = ref('');
const signatureInputRef = ref(null);

// 统计数据
const stats = ref({
  works: 0,
  follows: 0,
  fans: 0,
  likes: 0
});

// 我的笔记、收藏、点赞、关注、粉丝
const myNotes = ref([]);
const myCollections = ref([]);
const myLikes = ref([]);
const myFollows = ref([]);
const myFans = ref([]);
const activeTab = ref('notes');
const pageLoading = ref(true);
const contentLoading = ref(true);
const unreadMessageCount = ref(0);

const normalizeBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true';

const mapNoteItem = (item) => {
  const imagesArray = parseImagesJson(item.images);
  const coverImage = imagesArray.length > 0
    ? resolveMediaUrl(imagesArray[0])
    : 'https://images.unsplash.com/photo-1504753793650-d4a2b783c15e?w=400';

  const likes = Number(item.likes ?? 0);
  const collects = Number(item.collects ?? item.collections ?? item.collection_count ?? 0);
  const commentCount = Number(item.comment_count ?? item.comments ?? 0);

  return {
    id: item.id,
    title: item.title,
    description: item.content,
    coverImage,
    videoUrl: resolveMediaUrl(item.video || item.video_url || ''),
    userId: item.user_id || item.userId || item.author_id || item.authorId,
    authorAvatar: formatAvatar(item.avatar || item.authorAvatar),
    authorName: item.nickname || item.authorName || '用户',
    likes,
    collects,
    commentCount,
    liked: normalizeBoolean(item.liked ?? item.is_liked ?? item.like_status ?? item.likeStatus),
    collected: normalizeBoolean(item.collected ?? item.is_collected ?? item.collection_status ?? item.collectionStatus),
    imageCount: imagesArray.length
  };
};

// 视频首帧定格（作为视频笔记的封面）
const holdFirstFrame = (event) => {
  const video = event.target;
  if (!video) return;
  try {
    video.pause();
    video.currentTime = 0.01;
  } catch { /* 忽略 seek 失败 */ }
};

// 详情弹窗
const showDetailModal = ref(false);
const selectedNoteId = ref(null);

// 编辑资料弹窗
const showEditModal = ref(false);
const avatarInput = ref(null);
const editForm = ref({
  nickname: '',
  phone: '',
  signature: '',
  oldPassword: '',
  newPassword: ''
});

// 获取用户信息
const getUserInfo = async () => {
  try {
    const token = localStorage.getItem('token');
    console.log('当前 token:', token ? '存在' : '不存在');

    if (!token) {
      console.error('获取用户信息失败: 未登录');
      return;
    }

    const res = await userApi.getUserInfo();
    console.log('接口响应:', res);

    if (res && res.code === 200) {
      const userData = res.user;
      if (userData) {
        // 处理头像路径，确保显示正确
        userData.avatar = formatAvatar(userData.avatar);
        userInfo.value = userData;
        editForm.value.nickname = userData.nickname || '';
        editForm.value.signature = userData.signature || '';
      } else {
        console.error('获取用户信息失败: 用户数据为空');
      }
    } else if (res && res.code === 401) {
      console.error('获取用户信息失败: 登录已过期');
      localStorage.removeItem('token');
      localStorage.removeItem('userInfo');
      // 触发登录弹窗事件，而不是跳转到登录页面
      window.dispatchEvent(new Event('showLoginModal'));
    } else {
      console.error('获取用户信息失败:', res?.msg || '接口返回异常', '响应数据:', res);
    }
  } catch (error) {
    console.error('获取用户信息失败 - 异常:', error);
  }
};

// 触发头像上传
const triggerAvatarUpload = () => {
  avatarInput.value.click();
};

// 处理头像变更
const handleAvatarChange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await userApi.updateAvatar(formData);
    if (res.code === 200) {
      const updatedAvatar = formatAvatar(res.avatar);
      userInfo.value.avatar = updatedAvatar;

      const cachedUserInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      cachedUserInfo.avatar = updatedAvatar;
      localStorage.setItem('userInfo', JSON.stringify(cachedUserInfo));

      window.dispatchEvent(new Event('userInfoUpdated'));
      ElMessage.success('头像更新成功');
    } else {
      ElMessage.error(res.msg || '头像更新失败');
    }
  } catch (error) {
    console.error('头像上传失败:', error);
    ElMessage.error('头像上传失败');
  }
};

// 开始编辑签名
const startEditSignature = () => {
  signatureInput.value = userInfo.value.signature || '';
  editingSignature.value = true;
  setTimeout(() => {
    signatureInputRef.value?.focus();
  }, 100);
};

// 保存签名
const saveSignature = async () => {
  try {
    const res = await userApi.updateSignature(signatureInput.value);
    if (res.code === 200) {
      userInfo.value.signature = res.signature;
      editingSignature.value = false;
      ElMessage.success('签名更新成功');
    } else {
      ElMessage.error(res.msg || '签名更新失败');
    }
  } catch (error) {
    console.error('签名更新失败:', error);
    ElMessage.error('签名更新失败');
  }
};

// 取消编辑签名
const cancelEditSignature = () => {
  editingSignature.value = false;
};

const syncNoteStates = () => {
  const statusMap = new Map();

  const register = (note) => {
    if (!note || note.id == null) return;
    const existing = statusMap.get(note.id) || { liked: false, collected: false };
    statusMap.set(note.id, {
      liked: existing.liked || normalizeBoolean(note.liked),
      collected: existing.collected || normalizeBoolean(note.collected)
    });
  };

  [...myNotes.value, ...myCollections.value, ...myLikes.value].forEach(register);

  const applyStatus = (list) => list.map(note => {
    const status = statusMap.get(note.id);
    if (!status) return note;
    return {
      ...note,
      liked: status.liked || normalizeBoolean(note.liked),
      collected: status.collected || normalizeBoolean(note.collected)
    };
  });

  myNotes.value = applyStatus(myNotes.value);
  myCollections.value = applyStatus(myCollections.value);
  myLikes.value = applyStatus(myLikes.value);
};

const refreshStats = () => {
  stats.value.works = myNotes.value.length;
  stats.value.likes = myNotes.value.reduce(
    (sum, note) => sum + Number(note.likes || 0) + Number(note.collects || 0),
    0
  );
};

const getMyNotes = async () => {
  contentLoading.value = true;
  try {
    const res = await noteApi.getMyNotes();
    if (res.code === 200) {
      myNotes.value = res.list.map(item => mapNoteItem(item));
      syncNoteStates();
      refreshStats();
    }
  } catch (error) {
    console.error('获取我的笔记失败:', error);
  } finally {
    contentLoading.value = false;
  }
};

// 获取收藏列表
const getMyCollections = async () => {
  contentLoading.value = true;
  try {
    const res = await collectionApi.getCollections();
    if (res.code === 200) {
      myCollections.value = res.list
        .filter(item => item.id)
        .map(item => ({
          ...mapNoteItem(item),
          collected: true,
          liked: normalizeBoolean(item.liked)
        }));
      const ids = new Set(myCollections.value.map(note => note.id));
      myNotes.value = myNotes.value.map(note => ids.has(note.id) ? { ...note, collected: true } : note);
      myLikes.value = myLikes.value.map(note => ids.has(note.id) ? { ...note, collected: true } : note);
      syncNoteStates();
      refreshStats();
    }
  } catch (error) {
    console.error('获取收藏列表失败:', error);
  } finally {
    contentLoading.value = false;
  }
};

// 获取点赞列表
const getMyLikes = async () => {
  contentLoading.value = true;
  try {
    const res = await collectionApi.getLikes();
    if (res.code === 200) {
      myLikes.value = res.list
        .filter(item => item.id)
        .map(item => ({
          ...mapNoteItem(item),
          liked: true,
          collected: normalizeBoolean(item.collected)
        }));
      const ids = new Set(myLikes.value.map(note => note.id));
      myNotes.value = myNotes.value.map(note => ids.has(note.id) ? { ...note, liked: true } : note);
      myCollections.value = myCollections.value.map(note => ids.has(note.id) ? { ...note, liked: true } : note);
      syncNoteStates();
      refreshStats();
    }
  } catch (error) {
    console.error('获取点赞列表失败:', error);
  } finally {
    contentLoading.value = false;
  }
};

// 打开详情弹窗
const openDetailModal = (noteId) => {
  selectedNoteId.value = noteId;
  showDetailModal.value = true;
};

// 关闭详情弹窗
const closeDetailModal = () => {
  showDetailModal.value = false;
  selectedNoteId.value = null;
};

// 笔记删除后刷新列表
const handleNoteDeleted = () => {
  getMyNotes();
};

// 编辑笔记跳转到发布页面
const handleNoteEdited = () => {
  router.push('/publish');
};

// 获取统计数据
const getStats = async () => {
  try {
    await fetchFollowLists();
    refreshStats();
  } catch (error) {
    console.error('获取统计数据失败:', error);
  }
};

const refreshUnreadMessageCount = async () => {
  try {
    const res = await messageApi.getUnreadCount({ silent: true });
    if (res.code === 200) {
      unreadMessageCount.value = Number(res.count || 0);
    }
  } catch (error) {
    console.error('获取未读消息数失败:', error);
  }
};

// 打开编辑资料弹窗
const openEditModal = () => {
  showEditModal.value = true;
};

// 关闭编辑资料弹窗
const closeEditModal = () => {
  showEditModal.value = false;
  editForm.value = {
    nickname: userInfo.value.nickname || '',
    phone: '',
    signature: userInfo.value.signature || '',
    oldPassword: '',
    newPassword: ''
  };
};

// 保存资料修改
const saveProfile = async () => {
  try {
    const updateData = {};
    let hasProfileChange = false;
    let hasPasswordChange = false;

    if (editForm.value.nickname.trim() && editForm.value.nickname.trim() !== userInfo.value.nickname) {
      updateData.nickname = editForm.value.nickname.trim();
      hasProfileChange = true;
    }
    if (editForm.value.phone.trim()) {
      updateData.mobile = editForm.value.phone.trim();
      hasProfileChange = true;
    }
    if (editForm.value.signature.trim() !== (userInfo.value.signature || '').trim()) {
      updateData.signature = editForm.value.signature.trim();
      hasProfileChange = true;
    }

    if (editForm.value.oldPassword.trim() && editForm.value.newPassword.trim()) {
      hasPasswordChange = true;
    }

    if (hasProfileChange) {
      const res = await userApi.updateUserInfo(updateData);
      if (res.code === 200) {
        if (updateData.nickname) {
          userInfo.value.nickname = updateData.nickname;
        }
        if (updateData.signature !== undefined) {
          userInfo.value.signature = updateData.signature;
        }
        localStorage.setItem('userInfo', JSON.stringify(userInfo.value));
      } else {
        ElMessage.error('资料修改失败: ' + (res.msg || ''));
        return;
      }
    }

    if (hasPasswordChange) {
      const res = await userApi.changePassword({
        oldPassword: editForm.value.oldPassword.trim(),
        newPassword: editForm.value.newPassword.trim()
      });
      if (res.code !== 200) {
        ElMessage.error('密码修改失败: ' + (res.msg || ''));
        return;
      }
    }

    if (hasProfileChange || hasPasswordChange) {
      ElMessage.success('修改成功');
      closeEditModal();
    } else {
      ElMessage.warning('请输入要修改的内容');
    }
  } catch (error) {
    console.error('修改资料失败:', error);
    ElMessage.error('修改失败');
  }
};

// 点赞/取消点赞
const toggleLike = async (item) => {
  try {
    const res = await actionApi.toggleAction({ noteId: item.id, type: 'like' });
    if (res.code === 200) {
      item.liked = !item.liked;
      item.likes += item.liked ? 1 : -1;
      if (!item.liked && activeTab.value === 'likes') {
        myLikes.value = myLikes.value.filter(note => note.id !== item.id);
      }
      syncNoteStates();
      refreshStats();
    }
  } catch (error) {
    console.error('点赞失败:', error);
  }
};

// 收藏/取消收藏
const toggleCollection = async (item) => {
  try {
    const res = await actionApi.toggleAction({ noteId: item.id, type: 'collection' });
    if (res.code === 200) {
      item.collected = !item.collected;
      if (!item.collected && activeTab.value === 'collections') {
        myCollections.value = myCollections.value.filter(note => note.id !== item.id);
      }
      syncNoteStates();
      refreshStats();
    }
  } catch (error) {
    console.error('收藏失败:', error);
  }
};

// 跳转到笔记详情
const goToDetail = (id) => {
  router.push(`/note/${id}`);
};

// 跳转到作者主页（统一：点击作者直接进入其主页，不再弹卡片）
const goToAuthor = (userId) => {
  if (userId) {
    router.push(`/user/${Number(userId)}`);
  }
};

// 跳转到他人详情主页
const goToUserProfile = (userId) => {
  if (userId) {
    router.push(`/user/${Number(userId)}`);
  }
};

const openAuthorCard = (userId) => {
  goToAuthor(userId);
};

const fetchFollowLists = async () => {
  try {
    const [followRes, fansRes] = await Promise.all([
      followApi.getMyFollows(),
      followApi.getMyFans()
    ]);

    if (followRes.code === 200) {
      myFollows.value = (followRes.list || []).map(item => ({
        ...item,
        avatar: formatAvatar(item.avatar)
      }));
      stats.value.follows = Number(followRes.count ?? myFollows.value.length ?? 0);
    }

    if (fansRes.code === 200) {
      myFans.value = (fansRes.list || []).map(item => ({
        ...item,
        avatar: formatAvatar(item.avatar)
      }));
      stats.value.fans = Number(fansRes.count ?? myFans.value.length ?? 0);
    }
  } catch (error) {
    console.error('获取关注/粉丝列表失败:', error);
  }
};

// 格式化数字
const formatNumber = (num) => {
  const value = Number(num ?? 0);
  if (value >= 10000) {
    return (value / 10000).toFixed(1) + 'w';
  } else if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'k';
  }
  return value.toString();
};

const handleRefreshUnreadBadges = () => {
  refreshUnreadMessageCount();
};

onMounted(async () => {
  pageLoading.value = true;
  contentLoading.value = true;
  try {
    await Promise.all([
      getUserInfo(),
      getStats(),
      getMyNotes(),
      getMyCollections(),
      getMyLikes(),
      fetchFollowLists(),
      refreshUnreadMessageCount()
    ]);
  } finally {
    pageLoading.value = false;
  }
  window.addEventListener('refreshUnreadBadges', handleRefreshUnreadBadges);
});

onBeforeUnmount(() => {
  window.removeEventListener('refreshUnreadBadges', handleRefreshUnreadBadges);
});

watch(activeTab, () => {
  if (activeTab.value === 'notes') {
    getMyNotes();
  } else if (activeTab.value === 'collections') {
    getMyCollections();
  } else if (activeTab.value === 'likes') {
    getMyLikes();
  }
});

watch(myNotes, () => {
  refreshStats();
}, { immediate: true });

</script>

<template>
  <div class="user-center">
    <!-- 加载状态 -->
    <div v-if="pageLoading" class="page-loading">
      <div class="loading-spinner"></div>
      <span>加载中...</span>
    </div>

    <template v-else>
      <!-- 顶部用户信息区域 -->
      <div class="profile-header">
        <div class="profile-info">
          <div class="avatar-wrapper">
            <img :src="userInfo?.avatar || 'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'"
              alt="头像" class="avatar" />
            <div class="avatar-edit-tag" @click="triggerAvatarUpload">
              <el-icon :size="13"><Camera /></el-icon>
              <span>更换</span>
            </div>
            <input type="file" ref="avatarInput" style="display: none" accept="image/*" @change="handleAvatarChange" />
          </div>

          <div class="user-detail">
            <h1 class="nickname">{{ userInfo?.nickname || userInfo?.username || '用户' }}</h1>
            <p class="pindou-id">品豆号: {{ userInfo?.id ? (10000000 + parseInt(userInfo.id)) : '-' }}</p>
            
            <!-- 签名显示/编辑区域 -->
            <div class="bio-wrapper" v-if="!editingSignature" @click="startEditSignature">
              <p class="bio">{{ userInfo?.signature || '分享生活点滴，记录美好时光' }}</p>
              <el-icon class="edit-icon" :size="14"><EditPen /></el-icon>
            </div>
            
            <!-- 签名编辑输入框 -->
            <div class="bio-edit-wrapper" v-else>
              <input 
                ref="signatureInputRef"
                v-model="signatureInput" 
                type="text" 
                placeholder="请输入个性签名" 
                class="bio-input" 
                maxlength="50"
                @keydown.enter="saveSignature"
                @keydown.escape="cancelEditSignature"
              />
              <div class="bio-edit-actions">
                <button class="bio-btn-save" @click="saveSignature">保存</button>
                <button class="bio-btn-cancel" @click="cancelEditSignature">取消</button>
              </div>
            </div>
          </div>

          <button class="edit-profile-btn" @click="openEditModal">编辑资料</button>
        </div>

        <div class="stats-row">
          <div class="stat-item">
            <span class="stat-value">{{ formatNumber(stats.works) }}</span>
            <span class="stat-label">作品</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{{ formatNumber(stats.follows) }}</span>
            <span class="stat-label">关注</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{{ formatNumber(stats.fans) }}</span>
            <span class="stat-label">粉丝</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{{ formatNumber(stats.likes) }}</span>
            <span class="stat-label">获赞与收藏</span>
          </div>
        </div>
      </div>

      <!-- 标签切换 -->
      <div class="tab-bar">
        <div class="tab-item" :class="{ active: activeTab === 'notes' }" @click="activeTab = 'notes'">
          <span>笔记</span>
        </div>
        <div class="tab-item" :class="{ active: activeTab === 'collections' }" @click="activeTab = 'collections'">
          <span>收藏</span>
        </div>
        <div class="tab-item tab-item-message" :class="{ active: activeTab === 'likes' }" @click="activeTab = 'likes'">
          <span>赞过</span>
          <div v-if="unreadMessageCount > 0" class="tab-badge">{{ unreadMessageCount }}</div>
        </div>
        <div class="tab-item" :class="{ active: activeTab === 'follows' }" @click="activeTab = 'follows'">
          <span>关注</span>
        </div>
        <div class="tab-item" :class="{ active: activeTab === 'fans' }" @click="activeTab = 'fans'">
          <span>粉丝</span>
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="content-area">
        <transition name="content-switch" mode="out-in">
          <div :key="activeTab" class="content-switch-panel">
            <!-- 笔记列表 -->
            <div v-if="activeTab === 'notes'" class="notes-grid">
              <div v-if="contentLoading" class="loading">
                <div class="loading-spinner"></div>
                <span>加载中...</span>
              </div>

              <div v-else-if="myNotes.length === 0" class="empty-state">
                <el-icon class="empty-icon" :size="56"><Document /></el-icon>
                <p>你还没有发布任何内容哦</p>
                <button class="publish-btn" @click="router.push('/publish')">去发布</button>
              </div>

              <div v-else class="notes-waterfall">
                <div class="note-card" v-for="note in myNotes" :key="note.id" @click="openDetailModal(note.id)">
                  <div class="item-image-wrapper">
                    <video v-if="note.videoUrl" :src="note.videoUrl" class="item-image video-cover" muted playsinline preload="metadata" @loadeddata="holdFirstFrame"></video>
                    <img v-else :src="note.coverImage" :alt="note.title" class="item-image" loading="lazy" />
                    <span v-if="note.videoUrl" class="video-badge"><svg class="play-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
                    <span v-if="!note.videoUrl && note.imageCount > 1" class="image-count-badge">{{ note.imageCount }}</span>
                  </div>
                  <div class="item-content">
                    <p class="item-desc">{{ note.description }}</p>
                    <div class="item-footer">
                      <div class="author-row" @click.stop="goToAuthor(note.userId)">
                        <img :src="note.authorAvatar" :alt="note.authorName" class="author-avatar" @click.stop="goToAuthor(note.userId)" />
                        <div class="author-meta"><span class="author-name">{{ note.authorName }}</span></div>
                      </div>
                      <div class="action-row">
                        <span class="footer-like" :class="{ liked: note.liked }" @click.stop="toggleLike(note)"><XhsIcon name="like" :filled="note.liked" :class="{ liked: note.liked }" /> {{ formatNumber(note.likes) }}</span>
                        <span class="footer-comment" @click.stop="openDetailModal(note.id)"><XhsIcon name="comment" /> {{ formatNumber(note.commentCount || 0) }}</span>
                        <span class="footer-collect" :class="{ collected: note.collected }" @click.stop="toggleCollection(note)"><XhsIcon name="collect" :filled="note.collected" :class="{ collected: note.collected }" /> {{ formatNumber(note.collects || 0) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 收藏列表 -->
            <div v-if="activeTab === 'collections'" class="notes-grid">
              <div v-if="contentLoading" class="loading">
                <div class="loading-spinner"></div>
                <span>加载中...</span>
              </div>

              <div v-else-if="myCollections.length === 0" class="empty-state">
                <el-icon class="empty-icon" :size="56"><Star /></el-icon>
                <p>还没有收藏任何内容</p>
              </div>

              <div v-else class="notes-waterfall">
                <div class="note-card" v-for="note in myCollections" :key="note.id" @click="openDetailModal(note.id)">
                  <div class="item-image-wrapper">
                    <video v-if="note.videoUrl" :src="note.videoUrl" class="item-image video-cover" muted playsinline preload="metadata" @loadeddata="holdFirstFrame"></video>
                    <img v-else :src="note.coverImage" :alt="note.title" class="item-image" loading="lazy" />
                    <span v-if="note.videoUrl" class="video-badge"><svg class="play-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
                    <span v-if="!note.videoUrl && note.imageCount > 1" class="image-count-badge">{{ note.imageCount }}</span>
                  </div>
                  <div class="item-content">
                    <p class="item-desc">{{ note.description }}</p>
                    <div class="item-footer">
                      <div class="author-row" @click.stop="goToAuthor(note.userId)">
                        <img :src="note.authorAvatar" :alt="note.authorName" class="author-avatar" @click.stop="goToAuthor(note.userId)" />
                        <div class="author-meta"><span class="author-name">{{ note.authorName }}</span></div>
                      </div>
                      <div class="action-row">
                        <span class="footer-like" :class="{ liked: note.liked }" @click.stop="toggleLike(note)"><XhsIcon name="like" :filled="note.liked" :class="{ liked: note.liked }" /> {{ formatNumber(note.likes) }}</span>
                        <span class="footer-comment" @click.stop="openDetailModal(note.id)"><XhsIcon name="comment" /> {{ formatNumber(note.commentCount || 0) }}</span>
                        <span class="footer-collect collected" @click.stop="toggleCollection(note)"><XhsIcon name="collect" :filled="true" class="collected" /> {{ formatNumber(note.collects || 0) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 赞过列表 -->
            <div v-if="activeTab === 'likes'" class="notes-grid">
              <div v-if="contentLoading" class="loading">
                <div class="loading-spinner"></div>
                <span>加载中...</span>
              </div>

              <div v-else-if="myLikes.length === 0" class="empty-state">
                <el-icon class="empty-icon" :size="56"><StarFilled /></el-icon>
                <p>还没有点赞任何内容</p>
              </div>

              <div v-else class="notes-waterfall">
                <div class="note-card" v-for="note in myLikes" :key="note.id" @click="openDetailModal(note.id)">
                  <div class="item-image-wrapper">
                    <video v-if="note.videoUrl" :src="note.videoUrl" class="item-image video-cover" muted playsinline preload="metadata" @loadeddata="holdFirstFrame"></video>
                    <img v-else :src="note.coverImage" :alt="note.title" class="item-image" loading="lazy" />
                    <span v-if="note.videoUrl" class="video-badge"><svg class="play-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
                    <span v-if="!note.videoUrl && note.imageCount > 1" class="image-count-badge">{{ note.imageCount }}</span>
                  </div>
                  <div class="item-content">
                    <p class="item-desc">{{ note.description }}</p>
                    <div class="item-footer">
                      <div class="author-row" @click.stop="goToAuthor(note.userId)">
                        <img :src="note.authorAvatar" :alt="note.authorName" class="author-avatar" @click.stop="goToAuthor(note.userId)" />
                        <div class="author-meta"><span class="author-name">{{ note.authorName }}</span></div>
                      </div>
                      <div class="action-row">
                        <span class="footer-like liked" @click.stop="toggleLike(note)"><XhsIcon name="like" :filled="true" class="liked" /> {{ formatNumber(note.likes) }}</span>
                        <span class="footer-comment" @click.stop="openDetailModal(note.id)"><XhsIcon name="comment" /> {{ formatNumber(note.commentCount || 0) }}</span>
                        <span class="footer-collect" :class="{ collected: note.collected }" @click.stop="toggleCollection(note)"><XhsIcon name="collect" :filled="note.collected" :class="{ collected: note.collected }" /> {{ formatNumber(note.collects || 0) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 关注列表 -->
            <div v-if="activeTab === 'follows'" class="follow-list-panel">
              <div class="section-topline">
                <h3>我的关注</h3>
                <span>{{ myFollows.length }} 人</span>
              </div>
              <div v-if="contentLoading" class="loading">
                <div class="loading-spinner"></div>
                <span>加载中...</span>
              </div>
              <div v-else-if="myFollows.length === 0" class="empty-state">
                <el-icon class="empty-icon" :size="56"><User /></el-icon>
                <p>还没有关注任何人</p>
              </div>
              <div v-else class="user-list-grid">
                <div class="user-list-card" v-for="user in myFollows" :key="user.id" @click="goToUserProfile(user.id)">
                  <img :src="formatAvatar(user.avatar)" :alt="user.nickname" class="user-list-avatar" />
                  <div class="user-list-info">
                    <div class="user-list-name">{{ user.nickname || user.username || '用户' }}</div>
                    <div class="user-list-signature">{{ user.signature || '暂无签名' }}</div>
                  </div>
                  <span class="user-list-arrow">›</span>
                </div>
              </div>
            </div>

            <!-- 粉丝列表 -->
            <div v-if="activeTab === 'fans'" class="follow-list-panel">
              <div class="section-topline">
                <h3>我的粉丝</h3>
                <span>{{ myFans.length }} 人</span>
              </div>
              <div v-if="contentLoading" class="loading">
                <div class="loading-spinner"></div>
                <span>加载中...</span>
              </div>
              <div v-else-if="myFans.length === 0" class="empty-state">
                <el-icon class="empty-icon" :size="56"><UserFilled /></el-icon>
                <p>还没有粉丝</p>
              </div>
              <div v-else class="user-list-grid">
                <div class="user-list-card" v-for="user in myFans" :key="user.id" @click="goToUserProfile(user.id)">
                  <img :src="formatAvatar(user.avatar)" :alt="user.nickname" class="user-list-avatar" />
                  <div class="user-list-info">
                    <div class="user-list-name">{{ user.nickname || user.username || '用户' }}</div>
                    <div class="user-list-signature">{{ user.signature || '暂无签名' }}</div>
                  </div>
                  <div class="user-list-arrow">›</div>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </template>

    <!-- 详情弹窗 -->
    <NoteDetailCard
      :show="showDetailModal"
      :note-id="selectedNoteId"
      :is-own-note="true"
      @close="closeDetailModal"
      @deleted="handleNoteDeleted"
      @edited="handleNoteEdited"
    />

    <!-- 编辑资料弹窗 -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="closeEditModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>编辑个人资料</h2>
          <button class="close-btn" @click="closeEditModal">×</button>
        </div>

        <div class="modal-body">
          <div class="form-item">
            <label>昵称</label>
            <input v-model="editForm.nickname" type="text" placeholder="请输入昵称" class="form-input" />
          </div>

          <div class="form-item">
            <label>手机号</label>
            <input v-model="editForm.phone" type="tel" placeholder="请输入手机号" class="form-input" />
          </div>

          <div class="form-item">
            <label>当前密码</label>
            <input v-model="editForm.oldPassword" type="password" placeholder="请输入当前密码" class="form-input" />
          </div>

          <div class="form-item">
            <label>新密码</label>
            <input v-model="editForm.newPassword" type="password" placeholder="请输入新密码" class="form-input" />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-cancel" @click="closeEditModal">取消</button>
          <button class="btn-save" @click="saveProfile">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.user-center {
  min-height: 100vh;
  background: #f7f8fa;
}

.page-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: #7d8796;
}

.page-loading .loading-spinner,
.loading-spinner {
  width: 44px;
  height: 44px;
  border: 4px solid rgba(46, 196, 181, 0.12);
  border-top-color: #2ec4b5;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  margin-bottom: 16px;
}

.profile-header {
  background: #fff;
  border-bottom: 1px solid #f0f1f3;
  padding: 36px 24px 28px;
  margin-bottom: 20px;
}

.profile-info,
.stats-row {
  max-width: 1400px;
  margin-left: auto;
  margin-right: auto;
}

.profile-info {
  display: flex;
  align-items: center;
  gap: 28px;
  position: relative;
}

.edit-profile-btn {
  position: absolute;
  top: 0;
  right: 0;
  background: #fff;
  color: #2ec4b5;
  border: 1px solid rgba(46, 196, 181, 0.4);
  padding: 9px 20px;
  border-radius: 999px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #eefbf8;
  }
}

.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 3px solid #f0f1f3;
  object-fit: cover;
}

.avatar-edit-tag {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.48);
  color: #fff;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
  backdrop-filter: blur(8px);

  &:hover {
    background: rgba(0, 0, 0, 0.66);
    transform: scale(1.05);
  }
}

.user-detail {
  flex: 1;
  color: #111;
  padding-top: 0;
}

.nickname {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  color: #111;
}

.pindou-id {
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 12px;
}

.bio-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 14px;
  margin-left: -14px;
  border-radius: 999px;
  transition: all 0.2s ease;

  &:hover {
    background-color: #f7f8fa;
  }
}

.bio {
  font-size: 15px;
  margin-bottom: 0;
  line-height: 1.6;
  color: #475569;
}

.edit-icon {
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.bio-wrapper:hover .edit-icon {
  opacity: 0.85;
}

.bio-edit-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 620px;
}

.bio-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #e4e6e9;
  border-radius: 999px;
  background: #f5f6f7;
  color: #111;
  font-size: 15px;
  outline: none;

  &::placeholder {
    color: #b0b8c4;
  }

  &:focus {
    border-color: rgba(46, 196, 181, 0.5);
    background: #fff;
  }
}

.bio-edit-actions {
  display: flex;
  gap: 8px;
}

.bio-btn-save,
.bio-btn-cancel {
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.bio-btn-save {
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  border: none;
  color: #fff;

  &:hover {
    opacity: 0.9;
  }
}

.bio-btn-cancel {
  background: #f2f3f5;
  border: 1px solid #e4e6e9;
  color: #64748b;

  &:hover {
    background: #eceef1;
  }
}

.stats-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 26px;
  padding: 16px 0 0;
  border-top: 1px solid #f0f1f3;
}

.stat-item {
  flex: 1;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #111;
}

.stat-label {
  font-size: 13px;
  color: #94a3b8;
}

.stat-divider {
  width: 1px;
  height: 30px;
  background: #eef0f2;
}

.tab-bar {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  margin: 0 auto;
  max-width: 1400px;
  border-bottom: 1px solid #f0f1f3;
  box-sizing: border-box;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 0;
  font-size: 15px;
  color: #667085;
  cursor: pointer;
  padding: 14px 16px;
  position: relative;
  transition: color 0.2s ease;

  &.active {
    color: #111;
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      width: 28px;
      height: 3px;
      background: #2ec4b5;
      border-radius: 3px;
    }
  }

  &:hover:not(.active) {
    color: #2ec4b5;
  }
}

.tab-item-message {
  position: relative;
}

.tab-badge {
  position: absolute;
  top: -10px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #ff4757;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(255, 71, 87, 0.32);
  pointer-events: none;
}

.content-area {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px 12px 32px;
  min-height: 420px;
}

.content-switch-panel {
  will-change: transform, opacity;
}

.content-switch-enter-active,
.content-switch-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.content-switch-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.content-switch-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.section-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 14px;
  color: #667085;
  padding: 0 4px;

  h3 {
    margin: 0;
    font-size: 16px;
    color: #243042;
  }

  span {
    font-size: 13px;
  }
}

.notes-grid {
  min-height: 400px;
}

.follow-list-panel {
  min-height: 400px;
}

.user-list-grid {
  display: grid;
  gap: 12px;
}

.user-list-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #f0f1f3;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    background: #fafbfc;
  }
}

.user-list-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.user-list-info {
  flex: 1;
  min-width: 0;
}

.user-list-name {
  font-size: 15px;
  font-weight: 600;
  color: #243042;
  margin-bottom: 4px;
}

.user-list-signature {
  font-size: 13px;
  color: #7d8796;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-list-arrow {
  color: #c3cad5;
  font-size: 22px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px;
  color: #7d8796;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 88px 0;
  color: #97a3b4;
}

.empty-icon {
  font-size: 60px;
  margin-bottom: 20px;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.08));
}

.empty-state p {
  font-size: 16px;
  margin-bottom: 24px;
}

.publish-btn {
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  color: #fff;
  border: none;
  padding: 12px 30px;
  border-radius: 999px;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 10px 20px rgba(46, 196, 181, 0.2);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 24px rgba(46, 196, 181, 0.28);
  }
}

/* 统一五列：用 Grid 固定 5 列，避免 CSS columns 因内容/宽度变化而出现 3~5 列不一致 */
.notes-waterfall {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px 14px;
}

@media (max-width: 768px) {
  .notes-waterfall { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 520px) {
  .notes-waterfall { grid-template-columns: repeat(2, 1fr); }
}

.note-card {
  margin-bottom: 0;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
  transition: all 0.22s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.1);
  }
}

/* —— 作品卡片（与首页瀑布流一致：竖版封面 + 标题 + 作者 + 点赞/评论/收藏） —— */
.item-image-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: linear-gradient(180deg, #f8fbfc, #eef5f7);

  .item-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* 视频封面：定格首帧，不拦截点击 */
  .item-image.video-cover {
    object-fit: cover;
    background: #f3f4f6;
    pointer-events: none;
  }
}

/* 视频角标（右上角小圆徽标） */
.video-badge {
  position: absolute;
  right: 10px;
  top: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  backdrop-filter: blur(4px);
  z-index: 2;

  .play-icon {
    font-size: 10px;
    display: block;
  }
}

.item-content {
  padding: 12px;
}

.item-desc {
  font-size: 14px;
  color: #333;
  line-height: 1.5;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 1;
}

.author-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
  flex-shrink: 0;
}

.author-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.author-name {
  font-size: 12px;
  color: #333;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.footer-like,
.footer-comment,
.footer-collect {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #333;
  cursor: pointer;

  .xhs-icon {
    display: block;
    color: #333;
  }
}

.footer-like {
  &:hover,
  &:hover .xhs-icon {
    color: #ff2442;
  }

  &.liked,
  &.liked .xhs-icon {
    color: #ff2442;
  }
}

.footer-collect {
  &:hover,
  &:hover .xhs-icon {
    color: #ffd700;
  }

  &.collected,
  &.collected .xhs-icon {
    color: #ffd700;
  }
}

.footer-comment {
  &:hover {
    color: #333;
  }
}

.image-count-badge {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  backdrop-filter: blur(4px);
}

.note-image-wrapper {
  position: relative;
  width: 100%;
  padding-top: 100%;
  overflow: hidden;
  background: linear-gradient(180deg, #f8fbfc, #eef5f7);
}

.note-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-count {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.58);
  color: #fff;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 999px;
}

.note-info {
  padding: 14px 14px 16px;
}

.note-title {
  font-size: 14px;
  color: #243042;
  line-height: 1.58;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 12px;
  min-height: 44px;
}

.author-link-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin: 0 0 12px;
  border-radius: 999px;
  background: #f6fafb;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(46, 196, 181, 0.08);
  }
}

.author-avatar-link {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.8);
}

.author-link-name {
  font-size: 12px;
  color: #52606d;
}

.note-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  font-size: 12px;
  color: #8492a6;
}

.like-stat,
.collect-stat,
.comment-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 999px;
  background: #f7f9fb;
  transition: all 0.2s ease;
}

.like-stat {
  cursor: pointer;
  color: #7f8c9a;

  &.liked {
    color: #ff2442;
    background: rgba(255, 36, 66, 0.08);

    .heart {
      color: #ff2442;
    }
  }

  &:hover {
    color: #ff2442;
    background: rgba(255, 36, 66, 0.08);
  }

  .heart {
    font-size: 14px;
    color: #9aa5b1;
    transition: color 0.2s ease;
  }
}

.comment-stat {
  color: #7f8c9a;
}

.collect-stat {
  cursor: pointer;
  color: #7f8c9a;

  &.collected {
    color: #ffd700;
    background: rgba(255, 215, 0, 0.12);
  }

  &:hover {
    color: #ffd700;
    background: rgba(255, 215, 0, 0.12);
  }
}

.empty-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: #999;
}

.empty-tab .empty-icon {
  font-size: 60px;
  margin-bottom: 20px;
}

.empty-tab p {
  font-size: 16px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.56);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(6px);
}

.modal-content {
  background: #fff;
  border-radius: 18px;
  width: 400px;
  max-width: 92%;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f0f0f0;
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #243042;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #f5f7fa;
  border-radius: 50%;
  font-size: 20px;
  color: #8b97a7;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #e8edf3;
    color: #5b6573;
  }
}

.modal-body {
  padding: 24px;
}

.form-item {
  margin-bottom: 20px;
}

.form-item label {
  display: block;
  font-size: 14px;
  color: #5b6573;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e5eaf0;
  border-radius: 12px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus {
    outline: none;
    border-color: #2ec4b5;
    box-shadow: 0 0 0 4px rgba(46, 196, 181, 0.12);
  }

  &::placeholder {
    color: #c0c7d1;
  }
}

.form-textarea {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e5eaf0;
  border-radius: 12px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  resize: none;

  &:focus {
    outline: none;
    border-color: #2ec4b5;
    box-shadow: 0 0 0 4px rgba(46, 196, 181, 0.12);
  }

  &::placeholder {
    color: #c0c7d1;
  }
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #f0f0f0;
}

.btn-cancel,
.btn-save {
  flex: 1;
  padding: 12px;
  border-radius: 12px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel {
  border: 1px solid #e5eaf0;
  color: #5b6573;
  background: #fff;

  &:hover {
    background: #f7f9fb;
  }
}

.btn-save {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(46, 196, 181, 0.28);
  }
}

@media (max-width: 768px) {
  .profile-info {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .edit-profile-btn {
    position: static;
    margin-top: 8px;
  }

  .stats-row {
    flex-wrap: wrap;
  }

  .stat-item {
    flex: none;
    width: 25%;
    margin-bottom: 10px;
  }

  .tab-bar {
    gap: 10px;
    justify-content: space-between;
  }
}

@media (max-width: 480px) {
  .avatar {
    width: 100px;
    height: 100px;
  }

  .nickname {
    font-size: 22px;
  }

  .stats-row {
    padding: 10px;
  }

  .stat-value {
    font-size: 18px;
  }

  .tab-item {
    padding: 10px 14px;
    font-size: 14px;
  }
}
</style>