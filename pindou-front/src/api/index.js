import request from '@/utils/request.js'

// 用户相关接口
export const userApi = {
  // 登录（自动注册：用户不存在时自动创建账号）
  login: (data) => {
    return request.post('/users/login', data)
  },

  // 获取用户信息
  getUserInfo: () => {
    return request.get('/users/info')
  },

  // 获取他人信息
  getOtherUserInfo: (userId) => {
    return request.get(`/users/other/${userId}`)
  },

  // 修改个人资料
  updateUserInfo: (data) => {
    return request.post('/users/edit', data)
  },

  // 修改密码
  changePassword: (data) => {
    return request.post('/users/changepwd', data)
  },

  // 上传头像
  updateAvatar: (formData) => {
    return request.post('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  // 修改签名
  updateSignature: (signature) => {
    return request.post('/users/signature', { signature })
  }
}

// 笔记相关接口
export const noteApi = {
  // 获取笔记列表（游标分页：?pageSize=&cursor=）
  getNotesList: (params = {}) => {
    return request.get('/notes/list', { params })
  },

  // 关键词搜索（标题/内容/分类 模糊匹配，游标分页：?q=&pageSize=&cursor=）
  searchNotes: (params = {}) => {
    return request.get('/notes/search', { params })
  },

  // 获取笔记详情
  getNotesDetail: (id) => {
    return request.get(`/notes/detail/${id}`)
  },

  // 发布笔记
  publishNote: (data) => {
    return request.post('/notes/publish', data)
  },

  // 上传视频（返回视频 URL）
  uploadVideo: (formData) => {
    return request.post('/notes/video-upload', formData)
  },

  // 更新笔记
  updateNote: (id, data) => {
    return request.put(`/notes/${id}`, data)
  },

  // 获取我的笔记
  getMyNotes: () => {
    return request.get('/notes/mynote')
  },

  // 获取作者笔记
  getAuthorNotes: (authorId) => {
    return request.get(`/notes/author/${authorId}`)
  },

  // 删除笔记
  deleteNote: (id) => {
    return request.post(`/notes/delete/${id}`)
  },

  // 隐藏笔记（他人不可见，自己仍可见）
  hideNote: (id) => {
    return request.post(`/notes/hide/${id}`)
  },

  // 取消隐藏笔记
  unhideNote: (id) => {
    return request.post(`/notes/unhide/${id}`)
  },

  // 分类浏览
  getNotesByCategory: (cate) => {
    return request.get(`/notes/category/${cate}`)
  }
}

// 意见反馈 / Bug 上报接口
export const feedbackApi = {
  // 提交反馈
  submit: (data) => {
    return request.post('/feedback', data)
  }
}

// 操作相关接口
export const actionApi = {
  // 点赞/收藏切换
  toggleAction: (data) => {
    return request.post('/action/toggle', data)
  }
}

// 评论相关接口
export const commentApi = {
  // 获取评论列表
  getComments: (noteId) => {
    return request.get(`/comment/list/${noteId}`)
  },
  // 添加评论
  addComment: (data) => {
    return request.post('/comment/add', data)
  },
  // 删除评论
  deleteComment: (commentId) => {
    return request.post(`/comment/delete/${commentId}`)
  },
  // 点赞/取消点赞评论
  likeComment: (commentId) => {
    return request.post(`/comment/like/${commentId}`)
  }
}

// 草稿相关接口
export const draftApi = {
  // 获取草稿列表
  getDraftList: () => {
    return request.get('/draft/list')
  },
  // 获取草稿详情
  getDraftDetail: (draftId) => {
    return request.get(`/draft/detail/${draftId}`)
  },
  // 保存草稿
  saveDraft: (data) => {
    return request.post('/draft/save', data)
  },
  // 编辑草稿
  editDraft: (draftId, data) => {
    return request.post(`/draft/edit/${draftId}`, data)
  },
  // 删除草稿
  deleteDraft: (draftId) => {
    return request.post(`/draft/delete/${draftId}`)
  },
  // 发布草稿
  publishDraft: (draftId) => {
    return request.post(`/draft/publish/${draftId}`)
  }
}

// 通知相关接口
export const noticeApi = {
  // 获取通知列表
  getNoticeList: (config = {}) => {
    return request.get('/notice/list', config)
  },
  // 获取未读通知数
  getUnreadCount: (config = {}) => {
    return request.get('/notice/unread/count', config)
  },
  // 标记通知已读
  markAsRead: (noticeId) => {
    return request.post(`/notice/read/${noticeId}`)
  },
  // 标记所有已读
  markAllAsRead: () => {
    return request.post('/notice/readall')
  }
}

// 收藏相关接口
export const collectionApi = {
  // 获取我收藏的笔记
  getCollections: () => {
    return request.get('/action/collections')
  },
  // 获取我点赞的笔记
  getLikes: () => {
    return request.get('/action/likes')
  }
}

// 关注相关接口
export const followApi = {
  // 切换关注
  toggleFollow: (followeeId) => {
    const id = typeof followeeId === 'object'
      ? (followeeId?.followeeId ?? followeeId?.userId)
      : followeeId
    return request.post('/follow/toggle', { followeeId: id })
  },
  // 我的关注
  getMyFollows: () => request.get('/follow/myfollow'),
  // 我的粉丝
  getMyFans: () => request.get('/follow/myfans')
}

// 消息相关接口
export const messageApi = {
  // 获取会话列表
  getConversations: () => {
    return request.get('/messages/conversations')
  },
  // 获取聊天记录
  getChat: (targetId) => {
    return request.get(`/messages/chat/${targetId}`)
  },
  // 发送消息
  sendMessage: (data) => {
    return request.post('/messages/send', data)
  },
  // 上传私信图片
  uploadImage: (formData) => {
    return request.post('/messages/upload-image', formData)
  },
  // 获取未读消息数
  getUnreadCount: (config = {}) => {
    return request.get('/messages/unread/count', config)
  },
  // 清空所有未读消息
  clearUnread: () => {
    return request.post('/messages/unread/clear')
  }
}

// 拼小豆 AI 接口
export const aiApi = {
  // 服务端图纸转换（远程图片 / dataURL）
  convertToPindou: (data) => {
    return request.post('/ai/convert', data)
  },
  // 上传图片
  uploadImage: (formData) => {
    return request.post('/ai/upload-image', formData)
  },
  // 获取历史
  getHistory: (config = {}) => {
    return request.get('/ai/history', config)
  },
  // 同步历史
  syncHistory: (messages) => {
    return request.post('/ai/history/sync', { messages })
  },
  // 清空历史
  clearHistory: () => {
    return request.post('/ai/history/clear')
  }
}

// 拼豆图纸库接口
export const designApi = {
  saveDesign: (data) => request.post('/designs/save', data),
  getDesignList: (params = {}) => request.get('/designs/list', { params }),
  getDesignDetail: (id) => request.get(`/designs/detail/${id}`),
  deleteDesign: (id) => request.delete(`/designs/${id}`),
}
