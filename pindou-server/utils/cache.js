/**
 * 缓存抽象层（企业级）
 * -------------------------------------------------
 * 支持两种驱动，通过环境变量 CACHE_DRIVER 切换：
 *   - redis  ：生产环境推荐，跨进程/跨实例共享（ioredis）
 *   - memory ：内存 LRU，单实例 / 开发 / 测试的降级方案
 *
 * 统一==异步==接口，业务层与驱动解耦，便于日后替换：
 *   get(key) / set(key, value, ttlMs?) / del(key) / delByPrefix(prefix) / clear() / close()
 *
 * 核心设计（面试可讲）：
 *   - 读多写少场景（首页 Feed、用户资料）用缓存降低 MySQL 压力
 *   - 短 TTL + 写操作主动失效（delByPrefix），保证最终一致性
 *   - Redis 命令全部 try/catch 兜底：Redis 异常时缓存降级为“未命中/空操作”，
 *     应用不会因缓存故障而不可用（可用性优先于缓存命中率）
 *   - ioredis 使用独立 DB（默认 db=1）与 key 前缀命名空间，避免污染/误删业务数据
 *   - 启动时按配置自动选择驱动；未配置 Redis 时默认 memory，零依赖即可运行
 */
const config = require('../config')
const logger = require('./logger')

// ==================== 内存 LRU 驱动 ====================
class MemoryCache {
  constructor({ ttlSeconds = 60, maxItems = 500 } = {}) {
    this.ttlMs = ttlSeconds * 1000
    this.maxItems = maxItems
    this.map = new Map() // key -> { value, expireAt }
  }

  async get(key) {
    const entry = this.map.get(key)
    if (!entry) return null
    if (Date.now() > entry.expireAt) {
      this.map.delete(key)
      return null
    }
    // LRU：访问即移到 Map 末尾（最久未访问在最前）
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  async set(key, value, ttlMs = this.ttlMs) {
    if (this.map.has(key)) this.map.delete(key)
    if (this.map.size >= this.maxItems) {
      const oldestKey = this.map.keys().next().value
      this.map.delete(oldestKey)
    }
    this.map.set(key, { value, expireAt: Date.now() + ttlMs })
  }

  async del(key) {
    this.map.delete(key)
  }

  async delByPrefix(prefix) {
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) this.map.delete(key)
    }
  }

  async clear() {
    this.map.clear()
  }

  async close() {
    /* 内存缓存无需释放 */
  }
}

// ==================== Redis 驱动 ====================
class RedisCache {
  constructor(client, { prefix = 'pindou:', ttlSeconds = 60 } = {}) {
    this.client = client
    this.prefix = prefix
    this.ttlMs = ttlSeconds * 1000
    this._warned = false
    // 捕获连接/命令异常，避免未处理的 'error' 事件导致进程崩溃
    this.client.on('error', (err) => {
      if (!this._warned) {
        this._warned = true
        logger.warn({ err: err.message }, '[cache] Redis 连接异常（缓存降级为未命中，不影响业务），后续不再重复提示')
      }
    })
    this.client.on('ready', () => {
      if (this._warned) {
        this._warned = false
        logger.info('[cache] Redis 已恢复连接')
      }
    })
  }

  _k(key) {
    return `${this.prefix}${key}`
  }

  async get(key) {
    try {
      const raw = await this.client.get(this._k(key))
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      return null
    }
  }

  async set(key, value, ttlMs = this.ttlMs) {
    try {
      const secs = Math.max(1, Math.round(ttlMs / 1000))
      await this.client.set(this._k(key), JSON.stringify(value), 'EX', secs)
    } catch (e) {
      /* 降级 */
    }
  }

  async del(key) {
    try {
      await this.client.del(this._k(key))
    } catch (e) {
      /* 降级 */
    }
  }

  async delByPrefix(prefix) {
    try {
      const pattern = `${this.prefix}${prefix}*`
      let cursor = '0'
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = next
        if (keys && keys.length) await this.client.del(...keys)
      } while (cursor !== '0')
    } catch (e) {
      /* 降级 */
    }
  }

  async clear() {
    try {
      await this.client.flushdb() // 使用独立 DB，安全清空
    } catch (e) {
      /* 降级 */
    }
  }

  async close() {
    try {
      await this.client.quit()
    } catch (e) {
      this.client.disconnect()
    }
  }
}

// ==================== 驱动工厂 ====================
function memoryOptions() {
  return { ttlSeconds: config.cache.ttl, maxItems: config.cache.maxItems }
}

function createRedisClient() {
  const Redis = require('ioredis')
  const rc = config.cache.redis
  const options = {
    host: rc.host,
    port: rc.port,
    // 快速失败：连接断开时命令立即报错而非排队，交由业务层降级
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 3000),
    lazyConnect: false,
  }
  if (rc.password) options.password = rc.password
  if (!rc.url && rc.tls) options.tls = {}
  if (rc.url) {
    // 支持 REDIS_URL / rediss:// URL 形式（托管 Redis 如 Upstash 用 rediss:// 走 TLS）
    // 使用 URL 时不覆盖 db：托管服务通常只允许 0 号库，由 URL/服务端决定
    return new Redis(rc.url, { ...options, url: undefined })
  }
  // 直连方式（host/port）才指定 db（默认 1，内存/自建 Redis 使用）
  options.db = rc.db
  return new Redis(options)
}

/** 按配置构建缓存实例：redis 失败时降级为 memory */
function createCache() {
  if (config.cache.driver === 'redis') {
    try {
      const client = createRedisClient()
      logger.info('[cache] 使用 Redis 驱动（' + `${config.cache.redis.host}:${config.cache.redis.port}/${config.cache.redis.db}` + '）')
      return new RedisCache(client, { prefix: config.cache.prefix, ttlSeconds: config.cache.ttl })
    } catch (e) {
      logger.warn({ err: e.message }, '[cache] Redis 初始化失败，降级为内存缓存')
    }
  }
  return new MemoryCache(memoryOptions())
}

/** 单例：应用级共享缓存 */
const cache = createCache()

module.exports = { LRUCache: MemoryCache, MemoryCache, RedisCache, cache }
