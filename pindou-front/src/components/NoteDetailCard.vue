<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { noteApi, actionApi, commentApi, followApi } from '@/api'
import { resolveMediaUrl, parseImagesJson, formatAvatar as resolveAvatar } from '@/utils/media'
import SkeletonAvatar from '@/components/SkeletonAvatar.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  noteId: {
    type: Number,
    default: null
  },
  noteData: {
    type: Object,
    default: null
  },
  isOwnNote: {
    type: Boolean,
    default: false
  },
  initialCommentId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['close', 'openAuthor', 'deleted', 'edited', 'note-state-change'])

// 笔记详情
const note = ref(null)
const loading = ref(false)
const comments = ref([])
const commentInput = ref('')
const highlightedCommentId = ref(null)
const replyTo = ref(null)
const replyInput = ref('')
const replyTargetName = ref('')
const footerInput = ref(null)
const mentionIds = ref([])
const currentUserId = ref(null)
const followedAuthorIds = ref(new Set())

// 操作状态
const liked = ref(false)
const collected = ref(false)
const likes = ref(0)
const collects = ref(0)
const currentImageIndex = ref(0)

// 获取图片列表
const images = computed(() => {
  if (!note.value || !note.value.images) return []
  return parseImagesJson(note.value.images).map(img => resolveMediaUrl(img))
})

// 视频 URL（视频笔记）
const noteVideoUrl = computed(() => {
  const raw = note.value?.video || note.value?.video_url || note.value?.videoUrl || ''
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/uploads/')) return resolveMediaUrl(raw)
  return raw
})

// 当前用户头像（底部输入框用）
const myAvatar = computed(() => {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return ''
  try {
    const u = JSON.parse(raw)
    return u?.avatar ? formatAvatar(u.avatar) : ''
  } catch {
    return ''
  }
})

// 是否作者本人（评论「作者」标签）
const isCommentMine = (comment) => Number(comment.user_id) === Number(note.value?.user_id)

// 评论总数 = 顶级评论 + 全部子评论（递归统计，含所有层级回复）
const totalCommentCount = computed(() => {
  return comments.value.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)
})

// 子评论折叠：默认显示前 2 条，其余点「展开 N 条回复」
const MAX_VISIBLE_REPLIES = 2
const expandedReplyRoots = ref(new Set())
const isRepliesExpanded = (rootId) => expandedReplyRoots.value.has(Number(rootId))
const toggleReplies = (rootId) => {
  const id = Number(rootId)
  const next = new Set(expandedReplyRoots.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedReplyRoots.value = next
}
const visibleReplies = (comment) => {
  const replies = comment.replies || []
  if (isRepliesExpanded(comment.id) || replies.length <= MAX_VISIBLE_REPLIES) return replies
  return replies.slice(0, MAX_VISIBLE_REPLIES)
}

// 获取标签列表
const tags = computed(() => {
  if (!note.value || !note.value.content) return []
  const tagRegex = /#(\S+)/g
  const matches = note.value.content.match(tagRegex) || []
  return matches.slice(0, 10)
})

// 处理头像路径
const formatAvatar = (avatar) => resolveAvatar(avatar)

// 检查登录状态
const checkLogin = () => {
  return !!localStorage.getItem('token')
}

// 显示登录卡片
const showLoginCard = () => {
  // 保存当前路径，登录成功后可以跳回来
  localStorage.setItem('redirectAfterLogin', window.location.pathname)
  window.dispatchEvent(new Event('showLoginModal'))
}

// 获取笔记详情
const normalizeBoolean = (value) => value === true || value === 1 || value === '1' || value === 'true'

const applyNoteDetail = (detail) => {
  if (!detail) return

  const detailLiked = normalizeBoolean(detail.liked)
  const detailCollected = normalizeBoolean(detail.collected)
  const propLiked = normalizeBoolean(props.noteData?.liked)
  const propCollected = normalizeBoolean(props.noteData?.collected)

  // 跨笔记加载（打开另一条作品）时整体替换，避免把上一条笔记的
  // video/图片等字段残留合并进来（否则会出现「标题对了但视频还是上一条」）
  const isSameNote =
    detail.id != null && note.value?.id != null && String(detail.id) === String(note.value.id)
  const base = isSameNote ? { ...(note.value || {}) } : {}

  const definedEntries = Object.entries(detail).filter(([, v]) => v !== undefined && v !== null)
  const mergedDetail = {
    ...base,
    ...Object.fromEntries(definedEntries),
    liked: detailLiked || propLiked,
    collected: detailCollected || propCollected
  }

  note.value = mergedDetail
  likes.value = Number(mergedDetail.likes || 0)
  collects.value = Number(mergedDetail.collects ?? mergedDetail.collections ?? 0)
  liked.value = normalizeBoolean(mergedDetail.liked)
  collected.value = normalizeBoolean(mergedDetail.collected)
  currentImageIndex.value = 0
}

const loadFollowedAuthors = async () => {
  if (!checkLogin()) {
    followedAuthorIds.value = new Set()
    return
  }

  try {
    const res = await followApi.getMyFollows()
    followedAuthorIds.value = new Set(
      Array.isArray(res?.list)
        ? res.list.map(item => Number(item.id)).filter(Boolean)
        : []
    )
  } catch {
    followedAuthorIds.value = new Set()
  }
}

const fetchNoteDetail = async (id) => {
  if (!id) {
    return
  }

  loading.value = true
  try {
    const token = localStorage.getItem('token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        currentUserId.value = payload.id
      } catch {
        currentUserId.value = null
      }
    }

    if (props.noteData && Number(props.noteData.id) === Number(id)) {
      applyNoteDetail(props.noteData)
    }

    const res = await noteApi.getNotesDetail(id)

    if (res.code === 200) {
      applyNoteDetail(res.detail)

      // 获取评论列表
      await fetchComments(id)
    }
  } catch (error) {
    console.error('fetchNoteDetail: 获取笔记详情失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取评论列表
const fetchComments = async (noteId) => {
  try {
    const res = await commentApi.getComments(noteId)
    if (res.code === 200) {
      const byId = new Map()
      const roots = []
      res.list.forEach(item => {
        const comment = {
          ...item,
          avatar: formatAvatar(item.avatar),
          user_id: item.user_id || item.userId || item.author_id || item.authorId,
          reply_to_name: item.reply_nickname || item.reply_to_name || '',
          canDelete: item.canDelete,
          replies: []
        }
        byId.set(comment.id, comment)
      })
      byId.forEach((comment) => {
        if (comment.reply_to && byId.has(comment.reply_to)) {
          byId.get(comment.reply_to).replies.push(comment)
        } else {
          roots.push(comment)
        }
      })
      // 拍平嵌套回复：所有层级的回复统一归并到根评论下（小红书式平铺），按时间排序
      const flattenReplies = (root) => {
        const flat = []
        const walk = (node) => {
          (node.replies || []).forEach((r) => {
            flat.push(r)
            walk(r)
          })
        }
        walk(root)
        flat.sort((a, b) => new Date(a.create_time) - new Date(b.create_time))
        root.replies = flat
      }
      roots.forEach(flattenReplies)
      comments.value = roots
      highlightedCommentId.value = props.initialCommentId ? Number(props.initialCommentId) : null
    }
  } catch (error) {
    console.error('获取评论失败:', error)
  }
}

const getCommentDisplayName = (comment) => comment.nickname || comment.username || '用户'
const getReplyPreviewText = () => {
  if (!replyTo.value) return ''
  const rootComment = comments.value.find(item => item.id === replyTo.value)
  const target = rootComment || comments.value.flatMap(item => item.replies || []).find(reply => reply.id === replyTo.value)
  if (!target) return ''
  const contentText = (target.content || '').trim()
  const briefContent = contentText.length > 28 ? `${contentText.slice(0, 28)}...` : contentText
  return briefContent
}
const commentInputValue = computed({
  get: () => (replyTo.value ? replyInput.value : commentInput.value),
  set: (val) => {
    if (replyTo.value) {
      replyInput.value = val
    } else {
      commentInput.value = val
    }
  }
})

// 评论输入框聚焦状态（点击后显示 @ / 表情 / 发送 / 取消）
const commentFocused = ref(false)
const onCommentFocus = () => { commentFocused.value = true }
const onCommentBlur = () => {
  // 延迟收起，避免点击工具栏时先失焦
  setTimeout(() => { commentFocused.value = false }, 150)
}

// 互相关注用户（@ 可选）
const atPickerVisible = ref(false)
const atUsers = ref([])
const openAtPicker = async () => {
  commentFocused.value = true
  atPickerVisible.value = !atPickerVisible.value
  if (atUsers.value.length) return
  try {
    const [followsRes, fansRes] = await Promise.all([
      followApi.getMyFollows(),
      followApi.getMyFans(),
    ])
    const following = new Set((followsRes.list || []).map((u) => Number(u.id ?? u.followee_id ?? u.user_id)))
    const fansIds = new Set((fansRes.list || []).map((u) => Number(u.id ?? u.follower_id ?? u.user_id)))
    // 互相关注 = 我关注 且 对方也关注我
    const mutual = (followsRes.list || []).filter((u) => {
      const id = Number(u.id ?? u.followee_id ?? u.user_id)
      return fansIds.has(id)
    })
    atUsers.value = mutual.length ? mutual : (followsRes.list || [])
  } catch (error) {
    console.error('获取可@用户失败:', error)
  }
}
const selectAtUser = (user) => {
  const name = user.nickname || user.username || '用户'
  insertCommentTool(`@${name} `)
  const uid = Number(user.id ?? user.followee_id ?? user.followeeId ?? user.user_id)
  if (uid && !mentionIds.value.includes(uid)) mentionIds.value.push(uid)
  atPickerVisible.value = false
}

// 插入 @ / 表情
const insertCommentTool = (symbol) => {
  if (replyTo.value) {
    replyInput.value += symbol
  } else {
    commentInput.value += symbol
  }
}

// 取消工具栏：取消回复 / 清空输入
const cancelCommentTool = () => {
  atPickerVisible.value = false
  if (replyTo.value) {
    cancelReply()
  } else {
    commentInput.value = ''
  }
}

// 评论点赞（前后端联调：乐观切换 + 调后端持久化）
const likeComment = async (comment) => {
  if (!checkLogin()) {
    showLoginCard()
    return
  }
  const previousLiked = !!comment.liked
  const previousCount = Number(comment.like_count || 0)
  comment.liked = !previousLiked
  comment.like_count = Math.max(0, previousCount + (comment.liked ? 1 : -1))
  try {
    const res = await commentApi.likeComment(comment.id)
    if (res.code === 200) {
      comment.liked = !!res.liked
      comment.like_count = Number(res.like_count ?? comment.like_count)
    } else {
      comment.liked = previousLiked
      comment.like_count = previousCount
    }
  } catch (error) {
    comment.liked = previousLiked
    comment.like_count = previousCount
    console.error('评论点赞失败:', error)
  }
}
const submitCurrentInput = async () => {
  if (replyTo.value) {
    await submitReply()
  } else {
    await submitComment()
  }
}
const canDeleteComment = (comment) => Boolean(comment?.canDelete || comment?.user_id === currentUserId.value)

// 点赞
const toggleLike = async () => {
  if (!checkLogin()) {
    showLoginCard()
    return
  }

  const previousLiked = liked.value
  const previousLikes = likes.value
  liked.value = !previousLiked
  likes.value = Math.max(0, previousLikes + (liked.value ? 1 : -1))
  if (note.value) {
    note.value.liked = liked.value
    note.value.likes = likes.value
  }

  try {
    const res = await actionApi.toggleAction({ noteId: note.value.id, type: 'like' })
    if (res.code === 200) {
      if (typeof res.isActive !== 'undefined') {
        liked.value = !!res.isActive
        likes.value = Number(res.count ?? likes.value)
      }
      if (note.value) {
        note.value.liked = liked.value
        note.value.likes = likes.value
      }
      emit('note-state-change', {
        id: note.value.id,
        liked: liked.value,
        likes: likes.value,
        images: note.value?.images,
        title: note.value?.title,
        content: note.value?.content,
        avatar: note.value?.avatar,
        nickname: note.value?.nickname,
        user_id: note.value?.user_id,
        category: note.value?.category,
        create_time: note.value?.create_time,
        coverImage: note.value?.coverImage,
        description: note.value?.description,
        authorName: note.value?.authorName,
        authorAvatar: note.value?.authorAvatar,
        followed: note.value?.followed,
        collects: note.value?.collects,
        collected: note.value?.collected
      })
    } else {
      liked.value = previousLiked
      likes.value = previousLikes
      if (note.value) {
        note.value.liked = liked.value
        note.value.likes = likes.value
      }
      console.error('点赞失败:', res.msg)
    }
  } catch (error) {
    liked.value = previousLiked
    likes.value = previousLikes
    if (note.value) {
      note.value.liked = liked.value
      note.value.likes = likes.value
    }
    console.error('点赞失败:', error)
  }
}

// 收藏
const toggleCollection = async () => {
  if (!checkLogin()) {
    showLoginCard()
    return
  }

  const previousCollected = collected.value
  const previousCollects = collects.value
  collected.value = !previousCollected
  collects.value = Math.max(0, previousCollects + (collected.value ? 1 : -1))
  if (note.value) {
    note.value.collected = collected.value
    note.value.collects = collects.value
  }

  try {
    const res = await actionApi.toggleAction({ noteId: note.value.id, type: 'collect' })
    if (res.code === 200) {
      if (typeof res.isActive !== 'undefined') {
        collected.value = !!res.isActive
      }
      if (typeof res.count !== 'undefined') {
        collects.value = Number(res.count)
      }
      if (note.value) {
        note.value.collected = collected.value
        note.value.collects = collects.value
      }
      emit('note-state-change', {
        id: note.value.id,
        collected: collected.value,
        collects: collects.value,
        images: note.value?.images,
        title: note.value?.title,
        content: note.value?.content,
        avatar: note.value?.avatar,
        nickname: note.value?.nickname,
        user_id: note.value?.user_id,
        category: note.value?.category,
        create_time: note.value?.create_time,
        coverImage: note.value?.coverImage,
        description: note.value?.description,
        authorName: note.value?.authorName,
        authorAvatar: note.value?.authorAvatar,
        followed: note.value?.followed,
      })
    } else {
      collected.value = previousCollected
      collects.value = previousCollects
      if (note.value) {
        note.value.collected = collected.value
        note.value.collects = collects.value
      }
      console.error('收藏失败:', res.msg)
    }
  } catch (error) {
    collected.value = previousCollected
    collects.value = previousCollects
    if (note.value) {
      note.value.collected = collected.value
      note.value.collects = collects.value
    }
    console.error('收藏失败:', error)
  }
}

// 删除笔记
const deleteNote = async () => {
  try {
    await ElMessageBox.confirm('确定删除这条笔记吗？', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  
  try {
    const res = await noteApi.deleteNote(note.value.id)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      emit('deleted')
      close()
    } else {
      ElMessage.error(res.msg || '删除失败')
    }
  } catch (error) {
    console.error('删除失败:', error)
    ElMessage.error('删除失败')
  }
}

// 编辑笔记
const editNote = () => {
  const noteData = {
    id: note.value.id,
    title: note.value.title,
    content: note.value.content,
    images: note.value.images,
    category: note.value.category,
    isPublished: true,
    // 视频笔记编辑时也要带上 video，否则 PublishView 的 fillDraftForm
    // 读不到视频，导致视频预览不渲染
    video: note.value?.video || note.value?.video_url || note.value?.videoUrl || '',
    videoUrl: note.value?.video || note.value?.video_url || note.value?.videoUrl || ''
  }
  localStorage.setItem('editingNote', JSON.stringify(noteData))
  emit('edited')
  close()
}

// 是否处于隐藏状态（1=仅自己可见）
const isNoteHidden = () => normalizeBoolean(note.value?.is_hidden)

// 隐藏 / 取消隐藏（抖音式：他人不可见，自己仍可在“我的笔记”查看并取消；点击即生效，无需二次确认）
const toggleHidden = async () => {
  if (!note.value) return
  const willHide = !isNoteHidden()
  try {
    const res = willHide ? await noteApi.hideNote(note.value.id) : await noteApi.unhideNote(note.value.id)
    if (res.code === 200) {
      note.value.is_hidden = willHide ? 1 : 0
      ElMessage.success(willHide ? '已隐藏，仅自己可见' : '已取消隐藏，所有人可见')
    } else {
      ElMessage.error(res.msg || (willHide ? '隐藏失败' : '取消隐藏失败'))
    }
  } catch (error) {
    console.error('切换隐藏状态失败:', error)
    ElMessage.error('操作失败，请稍后重试')
  }
}

// 评论
const submitComment = async () => {
  if (!commentInput.value.trim()) return
  if (!checkLogin()) {
    showLoginCard()
    return
  }

  try {
    const res = await commentApi.addComment({
      noteId: note.value.id,
      content: commentInput.value.trim(),
      mentionIds: mentionIds.value
    })
    if (res.code === 200) {
      commentInput.value = ''
      mentionIds.value = []
      await fetchComments(note.value.id)
      emit('note-state-change', { id: note.value.id, comment_count: totalCommentCount.value })
    }
  } catch (error) {
    console.error('评论失败:', error)
  }
}

// 回复评论
const submitReply = async () => {
  if (!replyInput.value.trim()) return
  if (!checkLogin()) {
    showLoginCard()
    return
  }

  try {
    const res = await commentApi.addComment({
      noteId: note.value.id,
      content: replyInput.value.trim(),
      replyTo: replyTo.value || null,
      mentionIds: mentionIds.value
    })
    if (res.code === 200) {
      replyInput.value = ''
      replyTo.value = null
      replyTargetName.value = ''
      mentionIds.value = []
      await fetchComments(note.value.id)
      emit('note-state-change', { id: note.value.id, comment_count: totalCommentCount.value })
    }
  } catch (error) {
    console.error('回复失败:', error)
  }
}

// 显示回复输入框
const findRootCommentId = (comment) => {
  if (!comment?.id) return null
  if (!comment.reply_to) return comment.id
  const parent = comments.value.find(root =>
    root.id === comment.reply_to || (root.replies || []).some(reply => reply.id === comment.reply_to)
  )
  return parent?.id || comment.reply_to || comment.id
}

const showReplyInput = (comment) => {
  if (!comment?.id) return
  replyTo.value = findRootCommentId(comment)
  replyTargetName.value = getCommentDisplayName(comment)
  replyInput.value = ''
  // 点击回复后自动聚焦输入框，让底部展开为「输入框 + 工具栏」的回复态（隐藏头像/点赞等）
  commentFocused.value = true
  nextTick(() => footerInput.value?.focus())
}

// 取消回复
const cancelReply = () => {
  replyTo.value = null
  replyTargetName.value = ''
  replyInput.value = ''
  mentionIds.value = []
}

// 重置评论/回复/@ 状态（切换作品或关闭弹窗时调用，避免状态串到下一个作品）
const resetCommentState = () => {
  commentInput.value = ''
  replyInput.value = ''
  replyTo.value = null
  replyTargetName.value = ''
  atPickerVisible.value = false
  commentFocused.value = false
  atUsers.value = []
  mentionIds.value = []
  highlightedCommentId.value = null
}

// 关闭
const deleteComment = async (commentId) => {
  try {
    await ElMessageBox.confirm('确定删除这条评论吗？', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    const res = await commentApi.deleteComment(commentId)
    if (res.code === 200) {
      ElMessage.success('删除成功')
      replyTo.value = null
      replyTargetName.value = ''
      replyInput.value = ''
      await fetchComments(note.value.id)
      emit('note-state-change', { id: note.value.id, comment_count: totalCommentCount.value })
    } else {
      ElMessage.error(res.msg || '删除失败')
    }
  } catch (error) {
    console.error('删除评论失败:', error)
    ElMessage.error('删除失败')
  }
}

const close = () => {
  emit('close')
}

const scrollToComment = (commentId) => {
  if (!commentId) return
  highlightedCommentId.value = Number(commentId)
  window.setTimeout(() => {
    const el = document.querySelector(`[data-comment-id="${commentId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 120)
}

// 跳转到作者主页（统一：点击作者头像直接进入其主页）
const goToAuthor = (userId) => {
  if (userId) {
    router.push(`/user/${Number(userId)}`)
  }
}

const isAuthorFollowed = computed(() => {
  const authorId = Number(note.value?.user_id)
  if (!authorId) return false
  return followedAuthorIds.value.has(authorId)
})

const openAuthorFromAvatar = (userId) => {
  close()
  goToAuthor(userId)
}

 // 格式化数字
const formatNumber = (num) => {
  const value = Number(num ?? 0)
  if (value >= 10000) {
    return (value / 10000).toFixed(1) + 'w'
  } else if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'k'
  }
  return value.toString()
}

// 格式化时间
const formatTime = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`

  return `${date.getMonth() + 1}月${date.getDate()}日`
}

// 图片右键菜单（保存/下载）
const contextMenu = ref({ visible: false, x: 0, y: 0 })
const showImageMenu = (e) => {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY }
}
const hideImageMenu = () => { contextMenu.value.visible = false }

// 下载当前图片（跨域时以 blob 方式取回再下载）
const downloadCurrentImage = async () => {
  const url = images.value[currentImageIndex.value]
  hideImageMenu()
  if (!url) return
  try {
    const res = await fetch(url, { mode: 'cors' })
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = `pindou-${note.value?.id || 'image'}-${currentImageIndex.value + 1}.jpg`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objUrl)
  } catch (error) {
    console.error('保存图片失败:', error)
    window.open(url, '_blank')
  }
}

// 监听 noteId / show 变化：打开新作品或关闭弹窗时重置评论/回复/@ 状态
watch(() => [props.noteId, props.show], async ([newId, newShow]) => {
  if (!newShow) {
    resetCommentState()
    return
  }
  if (newId && newShow) {
    resetCommentState()
    // 打开新作品时立即清掉上一个作品的残留与加载态，
    // 避免先渲染上一条的视频/图片，等新详情回来后再展示
    note.value = null
    loading.value = true
    await loadFollowedAuthors()
    fetchNoteDetail(newId)
  }
}, { immediate: false })

watch(() => props.noteData, (newData) => {
  if (newData && props.show) {
    applyNoteDetail(newData)
  }
}, { deep: true })

watch(() => [props.show, props.initialCommentId], ([isShow, initialCommentId]) => {
  if (isShow && initialCommentId) {
    highlightedCommentId.value = Number(initialCommentId)
    window.setTimeout(() => scrollToComment(initialCommentId), 200)
  }
})
</script>

<template>
  <div v-if="show" class="detail-modal-overlay" @click.self="emit('close')">
    <div class="detail-modal">
      <!-- 关闭按钮 -->
      <button class="close-btn" @click="emit('close')">×</button>
      
      <!-- 加载状态 -->
      <div v-if="loading" class="modal-loading">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>

      <template v-else-if="note">
        <div class="detail-content">
          <!-- 左侧图片/视频区域 -->
          <div class="detail-left">
            <div class="image-container">
              <!-- 视频笔记：播放器（:key 强制在切换作品时重建视频元素，避免仍播上一条） -->
              <video
                v-if="noteVideoUrl"
                :key="note.id"
                :src="noteVideoUrl"
                controls
                autoplay
                playsinline
                preload="metadata"
                v-video-volume
                class="modal-video"
              ></video>
              <!-- 图片笔记：轮播 -->
              <template v-else>
                <img 
                  :src="images[currentImageIndex] || 'https://images.unsplash.com/photo-1504753793650-d4a2b783c15e?w=400'" 
                  :alt="note.title" 
                  class="modal-image"
                  @contextmenu.prevent="showImageMenu($event)"
                />
                <!-- 图片总数（右上角） -->
                <div v-if="images.length > 1" class="image-indicator">
                  <span>{{ currentImageIndex + 1 }}/{{ images.length }}</span>
                </div>
                <!-- 图片导航（mousemove 才显示） -->
                <button 
                  v-if="images.length > 1" 
                  class="nav-btn prev-btn" 
                  @click="currentImageIndex = Math.max(0, currentImageIndex - 1)"
                >‹</button>
                <button 
                  v-if="images.length > 1" 
                  class="nav-btn next-btn" 
                  @click="currentImageIndex = Math.min(images.length - 1, currentImageIndex + 1)"
                >›</button>
              </template>
            </div>
          </div>

          <!-- 右侧内容区域 -->
          <div class="detail-right">
            <!-- 作者信息 -->
            <div class="author-section">
              <img :src="formatAvatar(note.avatar)" :alt="note.nickname" class="author-avatar" @click="openAuthorFromAvatar(note.user_id)" />
              <div class="author-info">
                <span class="author-name">{{ note.nickname || '用户' }}</span>
                <span class="author-time">{{ formatTime(note.create_time) }}<template v-if="note.region"> · {{ note.region }}</template></span>
                <span v-if="isAuthorFollowed" class="follow-badge">已关注</span>
                <span v-if="isOwnNote && isNoteHidden()" class="hidden-badge">已隐藏 · 仅自己可见</span>
              </div>
              <!-- 自己的笔记：隐藏/编辑/删除 -->
              <template v-if="isOwnNote">
                <button class="own-action hide" :class="{ 'hidden-state': isNoteHidden() }" @click="toggleHidden">{{ isNoteHidden() ? '取消隐藏' : '隐藏' }}</button>
                <button class="own-action edit" @click="editNote">编辑</button>
                <button class="own-action delete" @click="deleteNote">删除</button>
              </template>
            </div>

            <!-- 内容区域 -->
            <div class="content-section">
              <h1 v-if="note.title" class="content-title">{{ note.title }}</h1>
              <p class="content-text">{{ note.content }}</p>
              <div class="tags-section">
                <span v-for="tag in tags" :key="tag" class="tag-item">{{ tag }}</span>
              </div>
            </div>

            <!-- 评论列表 -->
            <div class="comments-section">
              <div class="comments-header">
                <span class="comments-title">共 {{ totalCommentCount }} 条评论</span>
              </div>

              <div v-if="comments.length === 0" class="empty-comments">
                <p>还没有评论，快来抢沙发~</p>
              </div>

              <div v-else class="comment-list">
                <div v-for="comment in comments" :key="comment.id" class="comment-thread">
                  <div
                    class="comment-item"
                    :data-comment-id="comment.id"
                    :class="{ 'is-me': comment.user_id === currentUserId, highlighted: Number(highlightedCommentId) === Number(comment.id) }"
                  >
                    <SkeletonAvatar :src="comment.avatar || ''" :name="getCommentDisplayName(comment)" :size="36" @click="openAuthorFromAvatar(comment.user_id || comment.userId)" />
                    <div class="comment-content">
                      <div class="comment-topline">
                        <span class="comment-author">{{ getCommentDisplayName(comment) }}</span>
                        <span v-if="isCommentMine(comment)" class="author-badge">作者</span>
                        <span v-if="comment.user_id === currentUserId" class="author-badge me">我</span>
                        <span class="comment-time">{{ formatTime(comment.create_time) }}</span>
                      </div>

                      <div class="voice-bubble" v-if="comment.voice_url || comment.audio_url">
                        <el-icon class="voice-icon"><VideoPlay /></el-icon>
                        <span class="voice-duration">{{ comment.voice_duration || comment.audio_duration || 10 }}"</span>
                      </div>

                      <p class="comment-text">{{ comment.content }}</p>
                      <div class="comment-actions">
                        <button class="comment-action like" :class="{ liked: comment.liked }" @click.stop="likeComment(comment)">
                          <span class="like-heart"><svg viewBox="0 0 24 24" width="15" height="15" :fill="comment.liked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20.3C7.4 17.7 3.5 14.4 3.5 10.2c0-2.6 2-4.6 4.6-4.6 1.5 0 2.9.8 3.9 2.1 1-1.3 2.4-2.1 3.9-2.1 2.6 0 4.6 2 4.6 4.6 0 4.2-3.9 7.5-8.5 10.1z"/></svg></span>
                          {{ comment.like_count || 0 }}
                        </button>
                        <button class="comment-action reply" @click="showReplyInput(comment)">
                          <el-icon><ChatDotRound /></el-icon>
                          {{ comment.replies?.length || 0 }}
                        </button>
                        <button v-if="canDeleteComment(comment)" class="comment-action danger" @click="deleteComment(comment.id)">删除</button>
                      </div>
                    </div>
                  </div>

                  <!-- 子评论（默认折叠，展开查看全部） -->
                  <div v-if="comment.replies && comment.replies.length" class="reply-list">
                    <div
                      v-for="reply in visibleReplies(comment)"
                      :key="reply.id"
                      class="reply-item"
                      :class="{ 'is-me': reply.user_id === currentUserId }"
                    >
                      <SkeletonAvatar :src="reply.avatar || ''" :name="getCommentDisplayName(reply)" :size="28" @click="openAuthorFromAvatar(reply.user_id || reply.userId)" />
                      <div class="reply-body">
                        <div class="reply-meta">
                          <span class="reply-author">{{ getCommentDisplayName(reply) }}</span>
                          <span v-if="reply.user_id === currentUserId" class="author-badge small">我</span>
                          <span class="reply-time">{{ formatTime(reply.create_time) }}</span>
                          <button class="comment-action" @click="showReplyInput(reply)">回复</button>
                          <button v-if="canDeleteComment(reply)" class="reply-delete-btn" @click="deleteComment(reply.id)">删除</button>
                        </div>
                        <div class="voice-bubble reply-voice-bubble" v-if="reply.voice_url || reply.audio_url">
                          <el-icon class="voice-icon"><VideoPlay /></el-icon>
                          <span class="voice-duration">{{ reply.voice_duration || reply.audio_duration || 10 }}"</span>
                        </div>
                        <p class="reply-text">
                          <span v-if="reply.reply_to_name || comment.nickname" class="reply-to">回复 {{ reply.reply_to_name || comment.nickname || '用户' }}：</span>{{ reply.content }}
                        </p>
                      </div>
                    </div>
                    <!-- 展开/收起子评论 -->
                    <button
                      v-if="comment.replies.length > MAX_VISIBLE_REPLIES"
                      class="toggle-replies-btn"
                      @click="toggleReplies(comment.id)"
                    >
                      {{ isRepliesExpanded(comment.id) ? '收起回复' : `展开 ${comment.replies.length} 条回复` }}
                    </button>
                  </div>

                </div>
              </div>
            </div>

            <!-- 底部操作条（小红书式：头像 + 输入框 + 点赞/收藏/评论/转发 总数） -->
            <div class="detail-footer" :class="{ focused: commentFocused }">
              <img :src="myAvatar" class="footer-avatar" alt="" />
              <div class="footer-input-wrap">
                <div v-if="replyTo" class="reply-preview">
                  <span class="rp-label">回复 {{ replyTargetName || '用户' }}</span>
                  <span class="rp-text">{{ getReplyPreviewText() }}</span>
                </div>
                <div class="footer-input-row">
                  <input
                    ref="footerInput"
                    v-model="commentInputValue"
                    type="text"
                    :placeholder="replyTo ? `回复 ${replyTargetName || '用户'} ...` : '说点什么...'"
                    class="footer-input"
                    @focus="onCommentFocus"
                    @blur="onCommentBlur"
                    @keyup.enter="submitCurrentInput"
                  />
                </div>
                <!-- 聚焦后工具栏：@ / 表情 靠左，发送 / 取消 靠右 -->
                <div v-if="commentFocused" class="footer-toolbar">
                  <div class="toolbar-left">
                    <button class="f-tool" type="button" @mousedown.prevent="openAtPicker">@</button>
                    <button class="f-tool" type="button" @mousedown.prevent="insertCommentTool('😊')">
                      <svg class="smile-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01"/><path d="M15 9.5h.01"/></svg>
                    </button>
                  </div>
                  <div class="toolbar-right">
                    <button class="footer-send" @click="submitCurrentInput">发送</button>
                    <button class="footer-cancel" @click="cancelCommentTool">取消</button>
                  </div>
                </div>
                <!-- @ 用户选择弹层 -->
                <div v-if="atPickerVisible && atUsers.length" class="at-picker">
                  <div v-for="user in atUsers" :key="user.id ?? user.user_id" class="at-item" @mousedown.prevent="selectAtUser(user)">
                    <img :src="formatAvatar(user.avatar)" alt="" class="at-avatar" />
                    <span class="at-name">{{ user.nickname || user.username || '用户' }}</span>
                  </div>
                </div>
              </div>
              <div class="footer-actions">
                <span class="action-item like-item" @click="toggleLike">
                  <svg class="act-icon" :class="{ filled: liked, liked }" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20.3C7.4 17.7 3.5 14.4 3.5 10.2c0-2.6 2-4.6 4.6-4.6 1.5 0 2.9.8 3.9 2.1 1-1.3 2.4-2.1 3.9-2.1 2.6 0 4.6 2 4.6 4.6 0 4.2-3.9 7.5-8.5 10.1z"/>
                  </svg>
                  <span class="action-label">{{ formatNumber(likes) }}</span>
                </span>
                <span class="action-item collect-item" @click="toggleCollection">
                  <svg class="act-icon" :class="{ filled: collected, collected }" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
                    <path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>
                  </svg>
                  <span class="action-label">{{ formatNumber(collects) }}</span>
                </span>
                <span class="action-item comment-item">
                  <svg class="act-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 11.5a8.5 8.5 0 0 1-12.9 7.3L4 20l1.3-4.1A8.5 8.5 0 1 1 21 11.5z"/>
                  </svg>
                  <span class="action-label">{{ totalCommentCount }}</span>
                </span>
                <span class="action-item share-item">
                  <svg class="act-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 18 18 6"/>
                    <path d="M9 6h9v9"/>
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 图片右键菜单：保存图片 -->
      <div v-if="contextMenu.visible" class="image-ctx-backdrop" @click="hideImageMenu" @contextmenu.prevent="hideImageMenu"></div>
      <div v-if="contextMenu.visible" class="image-ctx" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
        <div class="ctx-item" @click="downloadCurrentImage">
          <el-icon><Download /></el-icon>
          <span>保存图片</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.detail-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

/* 图片右键菜单 */
.image-ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
}

.image-ctx {
  position: fixed;
  z-index: 2001;
  min-width: 150px;
  padding: 6px;
  background: #fff;
  border: 1px solid #eceef1;
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);

  .ctx-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 14px;
    color: #333;
    cursor: pointer;

    .el-icon {
      color: #333;
    }

    &:hover {
      background: #f5f6f8;
    }
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.detail-modal {
  width: 90%;
  max-width: 1000px;
  height: 85vh;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  animation: slideUp 0.3s ease;
  display: flex;
  flex-direction: column;
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(20px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}

.close-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
}

.detail-right {
  padding-right: 16px;
}

.modal-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #f0f0f0;
  border-top-color: #2ec4b5;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.detail-content {
  display: flex;
  height: 100%;
  min-height: 0;
  flex: 1;
}

.detail-left {
  width: 58%;
  background: #fafafa;
  display: flex;
  flex-direction: column;
}

.image-container {
  position: relative;
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

/* 图片：以高度或宽度为标准定格（contain 完整显示，较大维度铺满容器） */
.modal-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fff;
}

/* 视频笔记播放器（黑底，原生控制条） */
.modal-video {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  background: #000;
  display: block;
}

/* 图片总数（右上角） */
.image-indicator {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
}

/* 导航箭头：鼠标移入图片才显示 */
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0;

  &:hover {
    background: rgba(0, 0, 0, 0.55);
  }
}

.image-container:hover .nav-btn {
  opacity: 1;
}

.prev-btn {
  left: 16px;
}

.next-btn {
  right: 16px;
}

.thumbnails {
  display: flex;
  padding: 12px;
  gap: 8px;
  overflow-x: auto;
}

.thumbnail-item {
  width: 60px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.2s;

  &.active {
    opacity: 1;
    border: 2px solid #2ec4b5;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.detail-right {
  width: 42%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow-y: auto;
  min-height: 0;
}

.author-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.author-avatar,
.comment-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.1);
  }
}

.author-info {
  flex: 1;
  min-width: 0;
}

.author-name {
  display: block;
  font-weight: 600;
  color: #333;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.follow-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-top: 2px;
  font-size: 10px;
  color: #2ec4b5;
  background: rgba(46, 196, 181, 0.12);
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 600;
}

.hidden-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-top: 2px;
  font-size: 10px;
  color: #b58500;
  background: rgba(181, 133, 0, 0.12);
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 600;
}

.author-time {
  display: block;
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.follow-btn {
  padding: 6px 20px;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a69a 100%);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(46, 196, 181, 0.4);
  }
}

.content-section {
  padding: 16px 0;
}

.content-title {
  font-size: 20px;
  font-weight: 700;
  color: #111;
  line-height: 1.5;
  margin: 0 0 12px 0;
}

.content-text {
  font-size: 15px;
  color: #333;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

.tags-section {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.tag-item {
  font-size: 13px;
  color: #2ec4b5;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.comments-section {
  flex: 1;
  padding: 16px 0;
  overflow-y: auto;
}

.comments-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.comments-title {
  font-size: 14px;
  font-weight: 400;
  color: #9aa5b1;
}

.comments-count {
  min-width: 28px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #f2f5f7;
  color: #6b7684;
  font-size: 12px;
  text-align: center;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.comment-thread {
  display: flex;
  flex-direction: column;
}

.comment-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 14px;
  transition: background 0.2s ease, box-shadow 0.2s ease;

  &.highlighted {
    background: rgba(46, 196, 181, 0.1);
    box-shadow: 0 0 0 1px rgba(46, 196, 181, 0.18) inset;
  }
}

.comment-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  cursor: pointer;
}

/* 子评论头像更小 */
.reply-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  cursor: pointer;
}

.comment-content {
  flex: 1;
  min-width: 0;
}

.comment-topline {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #a1a7b3;
  margin-bottom: 6px;
}

.comment-author,
.reply-author {
  font-size: 14px;
  font-weight: 400;
  color: #333;
  letter-spacing: 0.2px;
}

.author-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: #edf7ff;
  color: #3d7eff;
  font-size: 11px;
}

.author-badge.small {
  padding: 1px 6px;
}

.comment-time,
.reply-time {
  font-size: 12px;
  color: #b0b6c1;
}

.more-btn,
.comment-action,
.reply-delete-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: #8c96a5;
}

.more-btn:hover,
.comment-action:hover {
  color: #333;
}

.comment-actions {
  display: flex;
  gap: 18px;
  margin-top: 10px;
  align-items: center;

  .comment-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: #86909c;

    .el-icon {
      font-size: 15px;
    }

    &:hover {
      color: #333;
    }
  }

  .comment-action.like,
  .comment-action.reply {
    font-weight: 500;
  }

  .comment-action.like:hover,
  .comment-action.like:hover .like-heart {
    color: #ff2442;
  }

  .comment-action.like.liked,
  .comment-action.like.liked .like-heart {
    color: #ff2442;
  }

  .comment-action.reply {
    .el-icon {
      font-size: 16px;
    }
  }
}

/* 展开/收起子评论 */
.toggle-replies-btn {
  border: none;
  background: transparent;
  color: #2ec4b5;
  font-size: 13px;
  cursor: pointer;
  padding: 6px 0 2px;
  text-align: left;
  margin-left: 50px;

  &:hover {
    opacity: 0.85;
  }
}

.comment-action.danger,
.reply-delete-btn {
  color: #ff7b7b;
}

.voice-bubble {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
  max-width: 220px;
  padding: 12px 16px;
  margin-bottom: 10px;
  background: #f1f3f5;
  border-radius: 0 14px 14px 14px;
  color: #2f3640;
}

.reply-voice-bubble {
  margin-top: 4px;
}

.voice-icon {
  font-size: 18px;
  line-height: 1;
}

.voice-duration {
  font-size: 14px;
  font-weight: 500;
}

.comment-text {
  font-size: 14px;
  color: #333;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.reply-list {
  margin-top: 10px;
  margin-left: 52px;
  padding-left: 14px;
  border-left: 2px solid #e8edf2;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reply-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.reply-item.is-me .reply-body,
.comment-item.is-me .comment-content {
  background: rgba(46, 196, 181, 0.05);
  border-radius: 16px;
}

.comment-content {
  flex: 1;
  min-width: 0;
}

.reply-body {
  flex: 1;
  min-width: 0;
}

.reply-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.reply-text {
  font-size: 13px;
  color: #333;
  line-height: 1.7;
  word-break: break-word;
}

.reply-to {
  color: #8c96a5;
}

.comment-input-section.replying {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reply-preview {
  width: 100%;
  padding-left: 4px;
  font-size: 13px;
  color: #8c96a5;
  line-height: 1.5;
  word-break: break-word;
}

.comment-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.comment-input {
  flex: 1;
  min-width: 0;
  padding: 12px 16px;
  border: 1px solid #e8e8e8;
  border-radius: 24px;
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: #2ec4b5;
  }
}

.send-btn,
.cancel-reply-btn {
  flex-shrink: 0;
  padding: 12px 18px;
  border-radius: 22px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.send-btn {
  background: linear-gradient(135deg, #2ec4b5 0%, #26a69a 100%);
  color: #fff;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(46, 196, 181, 0.4);
  }
}

.cancel-reply-btn {
  background: #fff;
  border: 1px solid #d8dee6;
  color: #5f6b7a;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

  &:hover {
    background: #f7f9fb;
    border-color: #cfd7e2;
    color: #334155;
    box-shadow: 0 2px 6px rgba(51, 65, 85, 0.08);
  }

  &:active {
    transform: translateY(1px);
  }
}

.empty-comments {
  text-align: center;
  padding: 32px 0;
  color: #999;
  background: #fafafa;
  border-radius: 14px;
}

.action-bar {
  display: flex;
  gap: 24px;
  padding: 16px 0;
  border-top: 1px solid #f0f0f0;
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.1);
  }

  &.edit-btn:hover {
    color: #2ec4b5;
  }

  &.delete-btn:hover {
    color: #ff6b6b;
  }
}

.action-icon {
  font-size: 24px;
  color: #666;

  &.liked {
    color: #ff4757;
  }

  &.collected {
    color: #ffd700;
  }
}

.action-icon.collected {
  color: #ffd700;
}

.action-label {
  font-size: 12px;
  color: #999;
}

.comment-input-section {
  display: flex;
  gap: 12px;
  padding-top: 16px;
}

.comment-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #e8e8e8;
  border-radius: 24px;
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: #2ec4b5;
  }
}

/* 聚焦态工具栏 @ / 表情 */
.input-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f2f3f5;
    color: #2ec4b5;
  }
}

.send-btn {
  padding: 12px 24px;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a69a 100%);
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(46, 196, 181, 0.4);
  }
}

/* 底部操作条（小红书式：头像 + 输入框 + 四项总数） */
.detail-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid #f0f1f3;
  background: #fff;
  flex-shrink: 0;

  /* 聚焦输入时：隐藏头像与点赞/收藏/评论/分享，输入框占满整行 */
  &.focused {
    .footer-avatar {
      display: none;
    }

    .footer-actions {
      display: none;
    }

    .footer-input-wrap {
      width: 100%;
      flex: 1 1 100%;
    }

    .footer-input-row {
      min-height: 52px;
    }
  }
}

.footer-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.footer-input-wrap {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.footer-input-row {
  display: flex;
  align-items: center;
  background: #f5f6f7;
  border-radius: 999px;
  padding: 5px 14px;
  min-height: 38px;
}

.footer-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  padding: 0;
}

/* 聚焦后工具栏：@ / 表情 靠左，发送 / 取消 靠右 */
.footer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
}

/* 工具栏 @ / 表情 */
.f-tool {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #111;
  font-size: 17px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover { background: #eceef1; color: #111; }
}

.footer-send {
  flex-shrink: 0;
  height: 34px;
  padding: 0 20px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #2ec4b5 0%, #26a89d 100%);
  color: #fff;
  font-size: 14px;
  cursor: pointer;

  &:hover { opacity: 0.9; }
}

.footer-cancel {
  flex-shrink: 0;
  height: 34px;
  padding: 0 16px;
  border: 1px solid #eceef1;
  border-radius: 999px;
  background: #fff;
  color: #333;
  font-size: 14px;
  cursor: pointer;

  &:hover { background: #f5f6f7; }
}

/* 回复提示（图3） */
.reply-preview {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  font-size: 13px;
  color: #7d8796;

  .rp-label { color: #555; font-weight: 600; }
  .rp-text { color: #a1a7b3; }
}

/* @ 用户选择弹层 */
.at-picker {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 6px;
  background: #fff;
  border: 1px solid #f0f1f3;
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08);
  max-height: 240px;
  overflow-y: auto;
  z-index: 10;
  padding: 8px;
}

.at-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;

  &:hover { background: #f7f8fa; }
}

.at-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
}

.at-name {
  font-size: 14px;
  color: #333;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;

  .action-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    color: #111;
    cursor: pointer;
  }

  .action-label {
    font-size: 13px;
    font-weight: 500;
    color: #111;
    line-height: 1;
  }

  .act-icon {
    display: block;
    color: #111;
    transition: color 0.2s, transform 0.2s;

    &.filled {
      fill: currentColor;
    }

    &.liked {
      color: #ff2442;
    }

    &.collected {
      color: #ffd700;
    }
  }

  .action-item.like-item:hover .act-icon {
    color: #ff2442;
  }

  .action-item.collect-item:hover .act-icon {
    color: #ffd700;
  }
}

/* 作者区编辑/删除 */
.own-action {
  border: none;
  background: transparent;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;

  &:hover { color: #2ec4b5; }
  &.delete:hover { color: #ff6b6b; }
  &.hide:hover { color: #b58500; }
  &.hide.hidden-state { color: #b58500; font-weight: 600; }
}

/* 评论「作者」标签 */
.author-badge.me {
  background: #eefbf8;
  color: #0f766e;
}

@media (max-width: 768px) {
  .detail-content {
    flex-direction: column;
  }

  .detail-left {
    width: 100%;
    height: 40%;
  }

  .detail-right {
    width: 100%;
    height: 60%;
    padding: 16px;
  }

  .reply-list {
    margin-left: 14px;
  }

  .comment-input-row {
    flex-direction: column;
    align-items: stretch;
  }

  .send-btn,
  .cancel-reply-btn {
    width: 100%;
  }

  .comment-input-section {
    flex-direction: column;
  }

  .send-btn {
    width: 100%;
  }
}
</style>