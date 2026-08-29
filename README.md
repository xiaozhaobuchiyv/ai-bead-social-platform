# 拼豆（Pindou）分享平台

面向拼豆（Perler Beads）爱好者的图文社区，参考小红书式瀑布流体验。

**核心亮点**：拼小豆 AI（火山方舟大模型）× 拼豆图纸转换算法深度融合 —— 用户在 AI 对话中生成或上传的图片，可一键原地转为拼豆图纸。

全栈项目 · Vue 3 + Express 5 + MySQL + Redis · 企业级分层架构 · 容器化 + CI

---

## ✨ 功能

| 模块 | 说明 |
|------|------|
| 首页瀑布流 | CSS 瀑布流、无限加载、图片懒加载、游标分页、点赞/收藏乐观更新 |
| 视频笔记 | 发布视频（mp4/webm/ogg/mov）、详情内嵌播放器、草稿同步 |
| 发布/草稿 | 多图上传（前端压缩）、话题标签、存草稿 / 发布 |
| 评论 | 子评论折叠、评论点赞、删除后计数实时同步 |
| 关注/通知 | 关注、粉丝、点赞/收藏/评论/关注触发的站内通知与未读角标 |
| 私信 | 会话列表（未读数）、按天分组的聊天窗口 |
| 图纸转换 | 图片一键转拼豆图纸（CIE Lab 色差匹配 + 抖动 + 量化） |
| 拼小豆 AI | 火山方舟对话/文生图/图生图/图片理解（SSE 流式）、会话持久化 |
| 我的图纸 | 图纸库：保存 / 浏览 / 详情重绘 / 删除 / 发布为笔记 |
| 个人中心 | 资料/头像/签名/属地、作品、收藏、点赞、改密 |

## 🧱 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3（`script setup`）、Vue Router 4、Pinia、Element Plus、Vite 5、Axios、Canvas 2D |
| 后端 | Node.js、Express 5、mysql2（连接池）、jsonwebtoken、bcryptjs、multer、jimp、pino |
| 缓存 | **Redis（ioredis）**，未配置时自动降级为内存 LRU |
| AI | 火山方舟（doubao 对话/视觉 + seedream 图像生成），SSE 流式 |
| 工程化 | node:test、ESLint + Prettier、Docker 多阶段构建、docker-compose、PM2 cluster、GitHub Actions CI |
| 数据库 | MySQL 8.0（utf8mb4 / InnoDB / 索引 / 外键） |

## 🏗️ 分层架构

```
routes(薄) → controllers → services → MySQL
中间件横切：auth(JWT) / validate / rateLimiter / requestLogger / errorHandler
公共层：utils(response/errors/cache/logger/pagination) · config(配置中心)
```

- **缓存抽象**：`utils/cache.js` 统一异步接口 `get/set/del/delByPrefix/clear`，支持 **Redis** 与 **内存 LRU** 双驱动，`CACHE_DRIVER` 切换；Redis 异常自动降级为未命中，不影响业务（可用性优先）。
- 缓存用于首页 Feed（匿名第一页，30s TTL）与用户资料（30s TTL），写操作主动失效（`delByPrefix`）。
- 数据库：游标分页（`create_time,id` 稳定排序）、`LEFT JOIN` 聚合评论数消除 N+1、外键与索引。

## 🚀 快速开始

### 本地开发（无 Redis 亦可，默认内存缓存）

```bash
# 1. 数据库（需本地 MySQL）
cd pindou-project/pindou-server
copy .env.example .env      # 修改 JWT_SECRET / DB_PASSWORD / 火山方舟 Key
npm install
npm run db:init             # 初始化表与索引（幂等）

# 2. 后端
npm run dev                 # http://localhost:3000 （API 文档 /api/docs）

# 3. 前端（另开终端）
cd ../../pindou-front
npm install
npm run dev                 # http://localhost:5173 （/api 代理到 3000）
```

### 使用 Redis

```bash
# 在 .env 中启用 Redis（本地可用 docker run 一个 Redis 实例）
CACHE_DRIVER=redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=1
```

### Docker Compose 一键（含 MySQL + Redis）

```bash
docker compose up -d --build
# 前端 http://localhost:8080  |  后端文档 http://localhost:3000/api/docs
```

## ⚙️ 环境变量

后端 `pindou-server/.env`（模板见 `.env.example`）：

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` / `JWT_EXPIRES_IN` | JWT 密钥 / 有效期 |
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL 连接 |
| `CACHE_DRIVER` | 缓存驱动：`redis` / `memory`（未配置 Redis 时默认 memory） |
| `CACHE_TTL_SECONDS` / `CACHE_MAX_ITEMS` | 缓存 TTL / 内存缓存条数 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis 连接（DB 默认 1，独立缓存库） |
| `VOLCANO_ARC_API_KEY` / `VOLCANO_CHAT_MODEL` / `VOLCANO_IMAGE_MODEL` / `VOLCANO_VISION_MODEL` | 火山方舟接入 |
| `CORS_ORIGIN` / `MAX_UPLOAD_SIZE_MB` | CORS 白名单 / 上传上限 |

前端 `pindou-front/.env`（模板见 `.env.example`）：`VITE_API_BASE` 为后端与 `/uploads` 的统一入口。

## 🧪 测试

```bash
cd pindou-project/pindou-server
npm test        # node:test：算法 + 缓存 + API 集成测试
```

## 🗂️ 项目结构

```
pindou/
├── pindou-front/        Vue 3 + Vite（src/api、components、views、stores、utils/pindou.js 图纸算法）
├── pindou-project/
│   └── pindou-server/   Express 5（config、middleware、routes、controllers、services、utils、sql、tests）
├── docker-compose.yml   MySQL + Redis + 后端 + 前端
├── .github/workflows/   GitHub Actions CI
└── README.md
```

## 📄 许可与版本

- 版本：`v1.0.0`（第一版 · 企业级落地）
- 目录中的 `tests/fixtures` 为测试用图片夹具。
