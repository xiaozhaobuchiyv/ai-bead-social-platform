/**
 * 用户路由（薄层）
 * 鉴权统一走 middleware/auth.js，业务在 service 层
 */
const express = require('express')
const router = express.Router()
const controller = require('../controllers/userController')
const { requireAuth, optionalAuth } = require('../middleware/auth')
const validate = require('../middleware/validate')

/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: 登录（用户不存在自动注册）
 *     tags: [用户]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: 登录成功，返回 token 与用户信息 }
 */
router.post('/login', validate({ username: 'required', password: 'required' }), controller.login)

// 个人信息（需登录）
router.get('/info', requireAuth, controller.getInfo)

// 他人信息（可选登录，展示关注状态）
router.get('/other/:id', optionalAuth, controller.getOther)

// 修改资料
router.post('/edit', requireAuth, controller.edit)

// 修改密码
router.post('/changepwd', requireAuth, controller.changePwd)

// 修改签名
router.post('/signature', requireAuth, controller.signature)

// 头像上传
router.post('/avatar', requireAuth, controller.avatar)

module.exports = router
