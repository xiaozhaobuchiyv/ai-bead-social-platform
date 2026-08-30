/**
 * 请求日志中间件（pino-http）
 * - 注入 request id（X-Request-Id），串联排查链路
 * - 记录方法/路径/状态码/耗时
 */
const { randomUUID } = require('crypto')
const pinoHttp = require('pino-http')
const logger = require('../utils/logger')

const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  autoLogging: {
    ignore: (req) => req.url === '/api/health' || req.url === '/', // 健康检查不刷日志
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  // 控制台可读格式
  transport: process.env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
  },
})

module.exports = requestLogger
