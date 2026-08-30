/**
 * 结构化日志（pino）
 * 生产环境输出 JSON，开发环境输出美化格式，便于排查与采集。
 */
const pino = require('pino')

const config = require('../config')

const logger = pino({
  level: process.env.LOG_LEVEL || (config.isProd ? 'info' : 'debug'),
  // 生产输出纯 JSON，开发输出可读格式
  transport: config.isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
})

module.exports = logger
