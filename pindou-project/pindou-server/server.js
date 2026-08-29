/**
 * 服务启动入口
 * - 加载 app 并监听端口
 * - 优雅退出：SIGTERM/SIGINT 时关闭 HTTP 服务与数据库连接池
 */
const app = require("./app");
const config = require("./config");
const logger = require("./utils/logger");
const pool = require("./config/db");
const { cache } = require("./utils/cache");

const server = app.listen(config.port, () => {
  logger.info(`拼豆后端启动成功 http://localhost:${config.port}（环境: ${config.env}）`);
  logger.info(`API 文档: http://localhost:${config.port}/api/docs`);
});

const shutdown = async (signal) => {
  logger.info(`收到 ${signal}，开始优雅退出...`);
  server.close(async () => {
    try {
      await Promise.allSettled([pool.end(), cache.close()]);
      logger.info("数据库连接池与缓存已关闭");
    } catch (e) {
      logger.error({ err: e }, "关闭连接池/缓存失败");
    }
    process.exit(0);
  });
  // 兜底：10 秒内未退出则强制结束
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled Rejection");
});
