# 拼豆（Pindou）分享平台

面向拼豆（Perler Beads）爱好者的图文社区，参考小红书式瀑布流体验；同时内置「照片 → 拼豆图纸」生成器与可选 AI 助手「拼小豆」。

全栈项目 · Vue 3 + Express 5 + MySQL 8 + Redis · 分层架构 · Docker 容器化

---

## ✨ 功能

| 模块 | 说明 |
|------|------|
| 登录/注册 | **11 位手机号**作为账号（前后端正则校验），首次登录自动注册；数据库唯一约束防重 |
| 首页瀑布流 | 多列瀑布流、无限加载、图片懒加载、游标分页、点赞/收藏乐观更新 |
| 搜索 | 关键词搜索（标题/内容/分类/作者），服务端 `FULLTEXT(ngram)` + 游标分页 |
| 作品隐藏 | 抖音式「隐藏」：隐藏后他人/游客不可见（详情 404、Feed/搜索/作者页消失），自己仍可在“我的笔记”查看并一键取消（免二次确认） |
| 视频笔记 | 发布视频（mp4/webm/ogg/mov）、详情播放器、草稿/编辑回显 |
| 发布/草稿 | 多图上传（前端压缩）、话题标签、存草稿/发布/编辑 |
| 评论 | 子评论折叠、评论点赞、@提及、删除后计数同步 |
| 关注/通知 | 关注、粉丝、点赞/收藏/评论触发的站内通知与未读角标 |
| 私信 | 会话列表（未读数）、聊天窗口、图片消息 |
| 图纸转换 | 图片一键转拼豆图纸：仅选网格尺寸，统一 **MARD 291 全色**；默认 **CIE Lab ΔE** 感知匹配（可用开关切 RGB 距离）；两种导出样式——**格子纸施工图**（蓝网格+每10格粉色线+全格色号+行列编号）与**纯像素图**（无格线无标注） |
| 图纸库 | 我的图纸：保存/浏览/详情重绘/删除/发布为笔记 |
| 意见反馈 | 顶部最右「Bug反馈」文字入口 → 点击弹窗提交（Bug/建议/其它 + 内容 + 选填联系方式），匿名可提（限流），入库供定期查阅 |
| 拼小豆 AI（可选） | 火山方舟对话/文生图/图生图/图片理解（SSE 流式）、会话持久化 |
| 个人中心 | 资料/头像/签名/属地、作品、收藏、赞过、改密 |

## 🧱 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3（`<script setup>`）、Vue Router 4（懒加载）、Pinia、Element Plus、Vite 5、Axios、Canvas 2D |
| 后端 | Node.js、Express 5、mysql2（连接池）、jsonwebtoken、bcryptjs、multer、jimp、pino |
| 缓存 | Redis（ioredis），未配置自动降级为内存 LRU |
| AI（可选） | 火山方舟 doubao/seedream，SSE 流式 |
| 工程化 | node:test、ESLint + Prettier、Docker Compose、PM2 |
| 数据库 | MySQL 8.0（utf8mb4 / InnoDB / 索引 / 外键 / ngram 全文索引） |

## 🏗️ 分层架构

```
routes(薄) → controllers → services → MySQL
中间件横切：auth(JWT) / validate / rateLimiter / requestLogger / errorHandler
公共层：utils(…) · config(配置中心)
```

- 缓存抽象 `utils/cache.js`：Redis / 内存 LRU 双驱动（`CACHE_DRIVER`），Redis 异常自动降级未命中；用于首页 Feed、用户资料，写操作主动失效。
- 数据库：游标分页（`create_time,id` 稳定排序）、`LEFT JOIN` 聚合评论数消除 N+1、ngram 全文索引、外键与复合索引。

## 🚀 快速开始

### 本地开发（无 Redis 亦可，默认内存缓存）

```bash
# 1. 数据库（需本地 MySQL 8）
cd pindou-server
copy .env.example .env        # 修改 JWT_SECRET / DB_PASSWORD 等
npm install
npm run db:init               # 初始化表与索引（幂等，可反复执行）

# 2. 后端
npm run dev                   # http://localhost:3000（API 文档 /api/docs）

# 3. 前端（另开终端）
cd ../../pindou-front
npm install
npm run dev                   # http://localhost:5173（/api 代理到 3000）
```

### Docker Compose 一键（MySQL + Redis + 前后端）

```bash
docker compose up -d --build
# 前端 http://localhost:8080  |  后端文档 http://localhost:3000/api/docs
```

## ⚙️ 关键环境变量

- 后端 `pindou-server/.env`（模板见 `.env.example`）：
  - `DB_*` / `JWT_SECRET` / `CACHE_DRIVER`(memory|redis) / `REDIS_*` / `CORS_ORIGIN` / `PUBLIC_BASE_URL` / `MAX_UPLOAD_SIZE_MB`
  - 托管 MySQL（Aiven 等）：补 `DB_PORT`（非 3306）+ `DB_SSL=require`（可加 `DB_SSL_CA=证书路径` 校验证书）
  - 托管 Redis（Upstash 等）：`CACHE_DRIVER=redis` + `REDIS_URL=rediss://…`（自动 TLS）+ `REDIS_DB=0`
  - 拼小豆 AI（**不配置即整站关闭**，前端进入显示“建设中”）：
    - `VOLCANO_ARC_API_KEY`、`VOLCANO_CHAT_MODEL`、`VOLCANO_IMAGE_MODEL`、`VOLCANO_VISION_MODEL`
    - `AI_ALLOWED_USERS`：逗号分隔的**用户名(手机号)或用户ID**，配置后仅白名单账号可用，其余人显示“内部功能”且接口直接 403
- 前端 `pindou-front/.env`（模板见 `.env.example`）：`VITE_API_BASE`

> 公开部署不想开放 AI：保持 `VOLCANO_*` 为空即可，零成本、零调用。

## 🧪 测试

```bash
cd pindou-server
npm test   # node:test：图纸算法 + 缓存 + API 集成（需本地 MySQL）
```

## 🗂️ 项目结构

```
ai-bead-social-platform/
├── pindou-front/        Vue 3 + Vite（api、components、views、stores、composables、utils、public）
├── pindou-server/       Express 5（config、middleware、routes、controllers、services、utils、sql、tests）
├── docker-compose.yml   MySQL + Redis + 后端 + 前端
├── .github/workflows/   GitHub Actions CI
└── DEPLOY.md            部署指南
```

## 🌐 主要接口（前缀 `/api`）

| 模块 | 接口 |
|------|------|
| 用户 | `POST /users/login`（手机号自动注册）、`GET /users/info`、`POST /users/edit`、`POST /users/changepwd` |
| 笔记 | `GET /notes/list`、`GET /notes/search?q=`、`GET /notes/detail/:id`、`POST /notes/publish`、`POST /notes/video-upload`、`POST /notes/hide/:id`、`POST /notes/unhide/:id` |
| 互动 | `POST /action/toggle`、`/action/collections`、`/action/likes` |
| 评论/关注/通知/私信 | `comment/*`、`follow/*`、`notice/*`、`messages/*` |
| AI 状态 | `GET /ai/status`（是否配置、是否对当前用户开放） |
| AI 对话 | `POST /ai/chat`（SSE）、`POST /ai/chat-with-image`（SSE） |
| 图纸 | `POST /ai/convert`、`POST /designs/save`、`GET /designs/list` |
| 反馈 | `POST /feedback` |

完整定义见 Swagger：后端启动后访问 `http://localhost:3000/api/docs`。

## 🔒 安全设计

- 认证：JWT 无状态（`token` 头）、bcrypt(cost=10) 哈希、SQL 层避免返回密码。
- 注入：全部参数化查询；资料更新字段白名单。
- 上传：扩展名 + MIME 白名单、大小上限、随机文件名、按类型分目录（持久卷挂载）。
- SSRF：AI 远程拉图拦截内网/回环地址。
- 限流：全局 / AI / 上传 / 反馈 分级限流。
- 其它：helmet、CORS 白名单、`.env` 不入库、全站静态资源由 Nginx/Docker 卷承载。

## 📄 许可

本项目为私有学习/作品项目（`ISC`）。
