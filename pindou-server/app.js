/**
 * Express 应用装配（不含 listen，便于测试与进程管理）
 * 中间件顺序：安全 → 日志 → 压缩 → CORS → 解析 → 限流 → 静态 → 路由 → 404 → 错误
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const config = require("./config");
const requestLogger = require("./middleware/requestLogger");
const { globalLimiter } = require("./middleware/rateLimiter");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");

const app = express();

// ---------- 安全与通用中间件 ----------
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(requestLogger);
app.use(compression());
app.use(
  cors({
    origin: config.cors.origin === "*" ? true : config.cors.origin,
    credentials: true,
  })
);
app.use(express.json({ limit: "100mb" }));
// multer 处理 multipart/form-data，无需 urlencoded

// ---------- 全局限流 ----------
app.use(globalLimiter);

// ---------- 静态资源 ----------
app.use(express.static(path.join(__dirname, "public")));

// ---------- 健康检查（供负载均衡/容器探针） ----------
app.get("/api/health", (req, res) => {
  res.json({ code: 200, status: "ok", uptime: process.uptime(), ts: Date.now() });
});

// ---------- Swagger API 文档 ----------
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "拼豆分享平台 API",
      version: "2.0.0",
      description: "仿小红书拼豆社区 · 全栈 + AI 应用（拼小豆 × 图纸转换）",
    },
    servers: [{ url: `http://localhost:${config.port}/api` }],
    components: {
      securitySchemes: {
        TokenAuth: { type: "apiKey", in: "header", name: "token" },
      },
    },
    security: [{ TokenAuth: [] }],
  },
  apis: [path.join(__dirname, "routes/*.js")],
});
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: "拼豆 API 文档" }));

// ---------- 业务路由 ----------
app.use("/api/users", require("./routes/users"));
app.use("/api/notes", require("./routes/notes"));
app.use("/api/feedback", require("./routes/feedback"));
app.use("/api/action", require("./routes/action"));
app.use("/api/comment", require("./routes/comment"));
app.use("/api/follow", require("./routes/follow"));
app.use("/api/draft", require("./routes/draft"));
app.use("/api/notice", require("./routes/notices"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/designs", require("./routes/designs"));

app.get("/", (req, res) => {
  res.send("拼豆分享平台后端运行正常！接口前缀为 /api/，文档见 /api/docs");
});

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).json({ code: 404, msg: `接口不存在: ${req.method} ${req.originalUrl}` });
});

// ---------- 全局错误处理（必须在最后） ----------
app.use(errorHandler);

// 避免 pino 重复打印 EADDRINUSE 等启动错误
app.on("error", (err) => logger.error({ err }, "Server error"));

module.exports = app;
