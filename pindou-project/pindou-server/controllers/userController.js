/**
 * 用户控制器（HTTP 层）
 */
const userService = require('../services/userService')
const asyncHandler = require('../utils/asyncHandler')
const { ok, fail } = require('../utils/response')
const { getIpRegion } = require('../services/ipUtil')
const { avatarUpload } = require('../utils/upload')

// 登录（自动注册）
// 保持旧版扁平响应 { code, token, user }，兼容现有前端
const login = asyncHandler(async (req, res) => {
  const region = await getIpRegion(null, req)
  const { token, user, isNew } = await userService.login(req.body.username, req.body.password, region)
  res.json({ code: 200, token, user, msg: isNew ? '自动注册成功' : '登录成功' })
})

// 个人信息（header token 或 body token 兼容旧版）
const getInfo = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.user.id)
  res.json({ code: 200, user: profile })
})

// 他人信息
const getOther = asyncHandler(async (req, res) => {
  const result = await userService.getOtherProfile(req.params.id, req.user?.id || null)
  res.json({ code: 200, ...result })
})

// 修改资料
const edit = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.body)
  res.json({ code: 200, msg: '资料修改成功', user })
})

// 修改密码
const changePwd = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword)
  ok(res, null, '密码修改成功')
})

// 修改签名（旧版接口，转发到资料修改）
const signature = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, { signature: req.body.signature })
  res.json({ code: 200, signature: user.signature, msg: '签名更新成功' })
})

// 头像上传
const avatar = (req, res, next) => {
  avatarUpload.single('avatar')(req, res, async (err) => {
    if (err) return fail(res, 400, err.message)
    try {
      if (!req.file) return fail(res, 400, '请选择图片文件')
      const avatarUrl = await userService.updateAvatar(req.user.id, req.file.filename)
      res.json({ code: 200, avatar: avatarUrl, msg: '头像更新成功' })
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { login, getInfo, getOther, edit, changePwd, signature, avatar }
