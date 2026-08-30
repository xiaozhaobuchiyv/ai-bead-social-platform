/**
 * 缓存单元测试：MemoryCache（LRU+TTL）与 RedisCache（ioredis 命令接线）
 * 说明：RedisCache 用 mock 客户端验证命令逻辑，无需真实 Redis 即可运行。
 * 运行：npm test
 */
const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { MemoryCache, RedisCache } = require('../utils/cache')

/** 极简 ioredis 客户端 mock：get/set/del/scan/flushdb/quit/on */
function fakeRedisClient() {
  const store = new Map()
  return {
    store,
    on() {},
    async get(k) { return store.has(k) ? store.get(k) : null },
    async set(k, v) { store.set(k, v); return 'OK' },
    async del(...keys) { let n = 0; keys.forEach((k) => { if (store.delete(k)) n++ }); return n },
    async scan(cursor, _match, pattern, _count, _n) {
      const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
      const keys = [...store.keys()].filter((k) => re.test(k))
      return ['0', keys]
    },
    async flushdb() { store.clear(); return 'OK' },
    async quit() {},
  }
}

describe('缓存抽象层', () => {
  test('MemoryCache：get/set/过期/LRU/前缀失效', async () => {
    const c = new MemoryCache({ ttlSeconds: 60, maxItems: 3 })
    await c.set('a', 1)
    await c.set('b', 2)
    assert.equal(await c.get('a'), 1)
    assert.equal(await c.get('missing'), null)

    // TTL 过期
    await c.set('short', 'v', 1)
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(await c.get('short'), null)

    // 前缀失效
    await c.set('feed:v1:10', { x: 1 })
    await c.set('feed:v1:20', { x: 2 })
    await c.set('user:profile:1', { y: 1 })
    await c.delByPrefix('feed:v1:')
    assert.equal(await c.get('feed:v1:10'), null)
    assert.equal(await c.get('feed:v1:20'), null)
    assert.ok(await c.get('user:profile:1'))
  })

  test('MemoryCache：容量超限淘汰最久未访问(LRU)', async () => {
    const c = new MemoryCache({ ttlSeconds: 60, maxItems: 2 })
    await c.set('k1', 1)
    await c.set('k2', 2)
    await c.get('k1')          // k1 最近使用
    await c.set('k3', 3)       // 超限，淘汰最久未使用 k2
    assert.equal(await c.get('k1'), 1)
    assert.equal(await c.get('k2'), null)
    assert.equal(await c.get('k3'), 3)
  })

  test('RedisCache：get/set JSON 往返 + TTL(EX 秒) + 前缀扫描删除', async () => {
    const client = fakeRedisClient()
    const c = new RedisCache(client, { prefix: 'pindou:', ttlSeconds: 60 })

    await c.set('foo', { a: 1 })
    assert.deepEqual(await c.get('foo'), { a: 1 })
    // 存入的是 JSON 字符串，且带命名空间前缀
    assert.equal(client.store.get('pindou:foo'), JSON.stringify({ a: 1 }))

    // del
    await c.del('foo')
    assert.equal(await c.get('foo'), null)

    // 前缀删除（scan + del）
    await c.set('feed:v1:10', { x: 1 })
    await c.set('feed:v1:20', { x: 2 })
    await c.set('user:profile:5', { y: 5 })
    await c.delByPrefix('feed:v1:')
    assert.equal(client.store.has('pindou:feed:v1:10'), false)
    assert.equal(client.store.has('pindou:feed:v1:20'), false)
    assert.equal(client.store.has('pindou:user:profile:5'), true)

    // clear
    await c.clear()
    assert.equal(client.store.size, 0)
  })
})
