# 拼豆（Pindou）分享平台

面向拼豆（Perler Beads）爱好者的图文社区，参考小红书式瀑布流体验。

**核心亮点**：拼小豆 AI（火山方舟大模型）× 拼豆图纸转换算法深度融合 —— 用户在 AI 对话中生成或上传的图片，可一键原地转为拼豆图纸。

全栈项目 · Vue 3 + Express 5 + MySQL 8 + Redis · 企业级分层架构 · Docker 容器化 + GitHub Actions CI

---

## ✨ 功能

| 模块 | 说明 |
|------|------|
| 首页瀑布流 | CSS 多列瀑布流、无限加载、图片懒加载、游标分页、点赞/收藏乐观更新 |
| 搜索 | 关键词模糊搜索（标题/内容/分类/作者），服务端 `FULLTEXT(ngram)` 索引 + 游标分页 |
| 视频笔记 | 发布视频（mp4/webm/ogg/mov）、详情内嵌播放器、草稿/编辑回显 |
| 发布/草稿 | 多图上传（前端压缩 + 拼豆水印）、话题标签、存草稿 / 发布 |
| 评论 | 子评论折叠、评论点赞、@ 提及、删除后计数实时同步 |
| 关注/通知 | 关注、粉丝、点赞/收藏/评论/关注触发的站内通知与未读角标 |
| 私信 | 会话列表（未读数）、按天分组的聊天窗口、图片消息 |
| 图纸转换 | 图片一键转拼豆图纸（CIE Lab 色差匹配 + Floyd–Steinberg 抖动 + 291 色量化） |
| 拼小豆 AI | 火山方舟对话/文生图/图生图/图片理解（SSE 流式）、会话持久化 |
| 我的图纸 | 图纸库：保存 / 浏览 / 详情重绘 / 删除 / 发布为笔记 |
| 个人中心 | 资料/头像/签名/属地、作品、收藏、赞过、改密 |

## 🧱 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3（`<script setup>`）、Vue Router 4（懒加载）、Pinia、Element Plus、Vite 5、Axios、Canvas 2D |
| 后端 | Node.js、Express 5、mysql2（连接池）、jsonwebtoken、bcryptjs、multer、jimp、pino |
| 缓存 | **Redis（ioredis）**，未配置时自动降级为内存 LRU |
| AI | 火山方舟（doubao 对话/视觉 + seedream 图像生成），SSE 流式 |
| 工程化 | node:test、ESLint + Prettier、Docker 多阶段构建、docker-compose、PM2 cluster、GitHub Actions CI |
| 数据库 | MySQL 8.0（utf8mb4 / InnoDB / 索引 / 外键 / ngram 全文索引） |

## 🏗️ 分层架构

```
routes(薄) → controllers → services → MySQL
中间件横切：auth(JWT) / validate / rateLimiter / requestLogger / errorHandler
公共层：utils(response/errors/cache/logger/pagination) · config(配置中心)
```

- **缓存抽象**：`utils/cache.js` 统一异步接口 `get/set/del/delByPrefix/clear`，支持 **Redis** 与 **内存 LRU** 双驱动，`CACHE_DRIVER` 切换；Redis 异常自动降级为未命中（可用性优先）。
- 缓存用于首页 Feed（匿名第一页，30s TTL）与用户资料（30s TTL），写操作主动失效（`delByPrefix` / `cache.del`）。
- 数据库：游标分页（`create_time,id` 稳定排序）、`LEFT JOIN` 聚合评论数消除 N+1、FULLTEXT(ngram) 全文索引支撑搜索、外键与复合索引。

## 🚀 快速开始

### 本地开发（无 Redis 亦可，默认内存缓存）

```bash
# 1. 数据库（需本地 MySQL）
cd pindou-server
copy .env.example .env        # 修改 JWT_SECRET / DB_PASSWORD / 火山方舟 Key
npm install
npm run db:init               # 初始化表与索引（幂等）

# 2. 后端
npm run dev                   # http://localhost:3000 （API 文档 /api/docs）

# 3. 前端（另开终端）
cd ../../pindou-front
npm install
npm run dev                   # http://localhost:5173 （/api 代理到 3000）
```

### 使用 Redis

```bash
# 在 pindou-server/.env 中启用 Redis
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

- 后端 `pindou-server/.env`（模板见 `pindou-server/.env.example`）：`JWT_SECRET` / `JWT_EXPIRES_IN`、`DB_*`、`CACHE_DRIVER` / `CACHE_TTL_SECONDS` / `CACHE_MAX_ITEMS`、`REDIS_*`、`VOLCANO_ARC_*`（火山方舟接入）、`CORS_ORIGIN` / `MAX_UPLOAD_SIZE_MB`。
- 前端 `pindou-front/.env`（模板见 `pindou-front/.env.example`）：`VITE_API_BASE` 为后端与 `/uploads` 的统一入口。

## 🧪 测试

```bash
cd pindou-server
npm test        # node:test：算法 + 缓存 + API 集成测试（真实 MySQL 服务容器）
```

## 🗂️ 项目结构

```
ai-bead-social-platform/
├── pindou-front/        Vue 3 + Vite（src/api、components、views、stores、composables、utils）
├── pindou-server/       Express 5（config、middleware、routes、controllers、services、utils、sql、tests）
├── docker-compose.yml   MySQL + Redis + 后端 + 前端
├── .github/workflows/   GitHub Actions CI（后端测试 + 前端构建）
└── DEPLOY.md            生产部署指南
```

## 🌐 主要接口（前缀 `/api`）

| 模块 | 接口 |
|------|------|
| 用户 | `POST /users/login`（自动注册）、`GET /users/info`、`POST /users/avatar`、`POST /users/edit`、`POST /users/changepwd` |
| 笔记 | `GET /notes/list`（游标分页）、`GET /notes/search?q=`、`GET /notes/detail/:id`、`POST /notes/publish`、`POST /notes/video-upload` |
| 互动 | `POST /action/toggle`（点赞/收藏）、`/action/collections`、`/action/likes` |
| 评论 | `GET /comment/list/:noteId`、`POST /comment/add`、`POST /comment/like/:commentId` |
| 关注/通知 | `POST /follow/toggle`、`GET /notice/list`、`GET /notice/unread/count` |
| 私信 | `GET /messages/conversations`、`GET /messages/chat/:targetId`、`POST /messages/send` |
| AI/图纸 | `POST /ai/chat`（SSE）、`POST /ai/convert`、`POST /designs/save`、`GET /designs/list` |

完整定义见 Swagger：后端启动后访问 `http://localhost:3000/api/docs`。

## 🔒 安全设计

- **认证**：JWT 无状态（自定义 `token` 头）、bcrypt(cost=10) 密码哈希、`PUBLIC_FIELDS` SQL 层避免返回密码。
- **注入防护**：全部参数化查询；资料更新字段白名单。
- **上传**：扩展名 + MIME 白名单、单文件大小上限、随机文件名防猜测、按类型分目录。
- **SSRF**：AI 远程拉图拦截内网/回环地址。
- **限流**：全局 / AI / 上传三级限流。
- **其他**：helmet 安全头、CORS 白名单、`.env` 不入库。

## 📄 许可

本项目为私有学习/作品项目（`ISC`）。
