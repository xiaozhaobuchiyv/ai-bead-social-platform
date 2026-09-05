/**
 * API 集成测试（node:test + 内置 fetch，零额外依赖）
 * 前置条件：本地 MySQL pindou 库已初始化（npm run db:init）
 * 运行：npm test
 */
const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const app = require('../app')

let server
let baseUrl

// 测试用户：使用 11 位手机号（系统账号限制为手机号）
const TEST_USER = `139${String(Date.now()).slice(-8)}`

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}/api`
})

after(async () => {
  // 强制关闭 keep-alive 连接，避免 server.close 挂起
  server.closeAllConnections?.()
  await new Promise((resolve) => server.close(resolve))
  try {
    await require('../config/db').end()
  } catch {
    /* 连接池可能未建立 */
  }
  // node:test 结束后立即退出（MySQL 连接池/undici keep-alive 会阻塞事件循环）
  process.exit(0)
})

const req = (url, opts = {}) =>
  fetch(`${baseUrl}${url}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })

const body = async (res) => {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

describe('用户模块', () => {
  test('登录（自动注册）返回 token 与用户信息', async () => {
    const res = await req('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER, password: '123456' }),
    })
    assert.equal(res.status, 200)
    const data = await body(res)
    assert.equal(data.code, 200)
    assert.ok(data.token)
    assert.equal(data.user.username, TEST_USER)
  })

  test('登录参数校验：缺少用户名返回 400', async () => {
    const res = await req('/users/login', { method: 'POST', body: JSON.stringify({}) })
    assert.equal(res.status, 400)
  })

  test('未登录访问 /users/info 返回 401', async () => {
    const res = await req('/users/info')
    assert.equal(res.status, 401)
  })

  test('带 token 获取个人信息', async () => {
    const login = await body(await req('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER, password: '123456' }),
    }))
    const res = await req('/users/info', { headers: { token: login.token } })
    const data = await body(res)
    assert.equal(data.code, 200)
    assert.equal(data.user.username, TEST_USER)
  })

  test('修改资料与密码', async () => {
    const login = await body(await req('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER, password: '123456' }),
    }))
    const headers = { token: login.token }
    const edit = await body(await req('/users/edit', {
      method: 'POST', headers, body: JSON.stringify({ signature: '企业级改造测试' }),
    }))
    assert.equal(edit.code, 200)

    const pwd = await body(await req('/users/changepwd', {
      method: 'POST', headers, body: JSON.stringify({ oldPassword: '123456', newPassword: '654321' }),
    }))
    assert.equal(pwd.code, 200)
  })
})

describe('笔记模块', () => {
  test('首页 Feed 游标分页：无重复、有下一页标记', async () => {
    const page1 = await body(await req('/notes/list?pageSize=3'))
    assert.equal(page1.code, 200)
    assert.ok(Array.isArray(page1.list))

    const ids1 = new Set(page1.list.map((n) => n.id))
    if (page1.hasMore && page1.nextCursor) {
      const page2 = await body(await req(`/notes/list?pageSize=3&cursor=${page1.nextCursor}`))
      const ids2 = page2.list.map((n) => n.id)
      const dup = ids2.filter((id) => ids1.has(id))
      assert.equal(dup.length, 0, '分页不应出现重复笔记')
    }
  })

  test('笔记详情返回评论数与作者信息', async () => {
    const feed = await body(await req('/notes/list?pageSize=1'))
    if (!feed.list.length) return // 空库跳过
    const detail = await body(await req(`/notes/detail/${feed.list[0].id}`))
    assert.equal(detail.code, 200)
    assert.ok('comment_count' in detail.detail, '详情应包含 comment_count')
    assert.ok(detail.detail.user_id, '详情应包含作者 user_id')
  })
})

describe('图纸模块', () => {
  test('服务端图纸转换（dataURL）', async () => {
    const b64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'cat.jpg')).toString('base64')
    const res = await req('/ai/convert', {
      method: 'POST',
      body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${b64}`, gridSize: 16, maxColors: 0 }),
    })
    const data = await body(res)
    assert.equal(data.code, 200)
    assert.ok(data.data.pattern.pixels.length > 0)
    assert.ok(data.data.previewImage.startsWith('/uploads/patterns/'))
  })

  test('SSRF 防护：拒绝内网地址', async () => {
    const res = await req('/ai/convert', {
      method: 'POST',
      body: JSON.stringify({ imageUrl: 'http://127.0.0.1:3306/x.png' }),
    })
    assert.equal(res.status, 500)
    const data = await body(res)
    assert.match(data.msg, /内网|不允许/)
  })

  test('图纸保存 → 列表 → 删除 全链路', async () => {
    const login = await body(await req('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER, password: '654321' }),
    }))
    const headers = { token: login.token }

    const save = await body(await req('/designs/save', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sourceImage: 'test.jpg',
        gridWidth: 16,
        gridHeight: 16,
        gridSize: 16,
        maxColors: 0,
        pixels: Array.from({ length: 256 }, (_, i) => `A${(i % 20) + 1}`).join(','),
        palette: [{ code: 'A1', name: 'A1', color: '#FAF4C8' }],
        totalPixels: 256,
        colorCount: 1,
        similarity: 88,
        estimatedTime: '1小时',
        previewImage: '/uploads/patterns/test.png',
      }),
    }))
    assert.equal(save.code, 200)
    assert.ok(save.data.id)

    const list = await body(await req('/designs/list?pageSize=10', { headers }))
    assert.equal(list.code, 200)
    assert.ok(list.data.list.some((d) => d.id === save.data.id))

    const del = await body(await req(`/designs/${save.data.id}`, { method: 'DELETE', headers }))
    assert.equal(del.code, 200)
  })
})

describe('通用行为', () => {
  test('404 返回统一错误格式', async () => {
    const res = await req('/not-exist')
    assert.equal(res.status, 404)
    const data = await body(res)
    assert.equal(data.code, 404)
  })

  test('健康检查', async () => {
    const res = await req('/health')
    const data = await body(res)
    assert.equal(data.code, 200)
    assert.equal(data.status, 'ok')
  })
})

describe('视频笔记', () => {
  test('发布带视频的笔记，列表与详情返回 video 字段', async () => {
    const login = await body(await req('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USER, password: '654321' }),
    }))
    const headers = { token: login.token }

    const publish = await body(await req('/notes/publish', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: '视频笔记测试',
        content: '这是一条视频笔记',
        video: '/uploads/videos/test-demo.mp4',
      }),
    }))
    assert.equal(publish.code, 200)
    assert.ok(publish.data.id)

    const detail = await body(await req(`/notes/detail/${publish.data.id}`))
    assert.equal(detail.code, 200)
    assert.equal(detail.detail.video, '/uploads/videos/test-demo.mp4')

    // 清理测试笔记
    await req(`/notes/delete/${publish.data.id}`, { method: 'POST', headers })
  })
})
