/**
 * 集中式配置中心
 * 启动时校验必需环境变量，统一提供应用配置出口。
 */
require('dotenv').config()
const fs = require('fs')

const requiredEnv = ['JWT_SECRET']
const missing = requiredEnv.filter((key) => !process.env[key])
if (missing.length > 0) {
  console.error(`[config] 缺少必需环境变量: ${missing.join(', ')}（请复制 .env.example 为 .env 并填写）`)
  if (process.env.NODE_ENV === 'production') {
    process.exit(1)
  }
}

// DB_SSL 解析：默认关闭；require/true 开启（可选 DB_SSL_CA 校验证书）
function buildDbSsl() {
  const mode = String(process.env.DB_SSL || '').toLowerCase()
  if (!mode || mode === '0' || mode === 'false' || mode === 'disable') return undefined
  const caFile = process.env.DB_SSL_CA
  if (caFile && fs.existsSync(caFile)) return { ca: fs.readFileSync(caFile) }
  return { rejectUnauthorized: false }
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  port: parseInt(process.env.PORT, 10) || 3000,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'pindou',
    charset: 'utf8mb4',
    // 连接池企业级配置：上限、空闲回收、超时
    connectionLimit: parseInt(process.env.DB_POOL_SIZE, 10) || 10,
    waitForConnections: true,
    queueLimit: 0,
    // 托管 MySQL（Aiven 等）通常为非 3306 端口并强制 TLS：
    //   DB_SSL=require                —— 开启 TLS（跳过证书校验，通用）
    //   DB_SSL=require + DB_SSL_CA=路径 —— 校验证书（Aiven 建议下载 ca.pem 后填绝对路径）
    ssl: buildDbSsl(),
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  upload: {
    // 图片上传白名单
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxFileSize: parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 10, // MB
  },

  cache: {
    // 驱动：redis / memory。未配置 Redis 时默认 memory（零依赖可运行）
    driver: process.env.CACHE_DRIVER || (process.env.REDIS_URL || process.env.REDIS_HOST ? 'redis' : 'memory'),
    // 内存缓存 TTL（秒）
    ttl: parseInt(process.env.CACHE_TTL_SECONDS, 10) || 60,
    maxItems: parseInt(process.env.CACHE_MAX_ITEMS, 10) || 500,
    // Redis 缓存键命名空间，避免与其他数据混淆
    prefix: process.env.CACHE_PREFIX || 'pindou:',
    redis: {
      url: process.env.REDIS_URL || '',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || '',
      // 使用独立 DB（默认 1），clear 时 flushdb 只清缓存库，不碰业务数据；
      // 托管 Redis（Upstash 等）通常只允许 db=0，请设 REDIS_DB=0 并优先用 rediss:// URL
      db: parseInt(process.env.REDIS_DB, 10) || 1,
      // 以 host/port 方式直连且服务要求 TLS 时设 REDIS_TLS=1（用 rediss:// URL 则无需设置）
      tls: ['1', 'true', 'yes'].includes(String(process.env.REDIS_TLS || '').toLowerCase()),
    },
  },

  ai: {
    apiKey: process.env.VOLCANO_ARC_API_KEY || '',
    baseURL: process.env.VOLCANO_ARC_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    chatModel: process.env.VOLCANO_CHAT_MODEL || '',
    visionModel: process.env.VOLCANO_VISION_MODEL || process.env.VOLCANO_IMAGE_CHAT_MODEL || '',
    imageModel: process.env.VOLCANO_IMAGE_MODEL || '',
    // 白名单（可选）：逗号分隔的用户名或用户ID。空 = 不限制（配了 key 即全员可用）。
    // 非空 = 仅白名单内账号可调用拼小豆；游客/未授权账号即使配了 key 也视为“建设中/内部功能”。
    allowedUsers: String(process.env.AI_ALLOWED_USERS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // 多轮对话携带的上下文消息条数（条数越多 token 成本越高、首 token 越慢；默认取近期一小段即可）
    contextMessages: parseInt(process.env.AI_CONTEXT_MESSAGES, 10) || 12,
    // 外部依赖调用超时
    requestTimeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) || 60000,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
}

module.exports = config
