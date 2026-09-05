# Zeabur 部署指南（Aiven MySQL + Upstash Redis）

> 前提：GitHub 仓库 `ai-bead-social-platform` 已同步最新代码；已注册 Zeabur / Aiven / Upstash。

## 0. 总体架构

```
浏览器 → Zeabur 前端(nginx 网关, 公网域名)
            ├─ /api、/uploads → 后端(Zeabur, 公网或内网域名)
后端 → Aiven MySQL（远程, 端口非 3306, TLS）
     → Upstash Redis（rediss://, 只允许 db 0）
上传文件 → 后端持久卷（Zeabur Volume, /app/public/uploads）
```

## 1. 创建外部资源

### Aiven MySQL
1. Services → Create service → MySQL → 选 Region/Plan（免费 plan 即可）→ 创建。
2. 打开服务 → Overview：记下 `Host`、`Port`（非 3306）、`User`、`Password`。
3. **创建数据库** `pindou`（或把默认库改名）；Service Settings → 可下载 `CA Certificate (ca.pem)`（可选，用于校验证书）。

### Upstash Redis
1. Console → Create database → Region 选离 Zeabur 近的 → 创建。
2. 复制 **Redis Protocol URL**（`rediss://default:xxx@host:6379`）备用（Upstash 只允许 db 0，勿改库号）。

## 2. Zeabur 导入仓库并建 2 个服务

1. Zeabur → New Project（Region 任选）→ 连接 GitHub → 选 `ai-bead-social-platform`。
2. 加服务时用 **Root Directory** 分别指向两个子目录（每个子目录自带 Dockerfile）：
   - **后端**：`pindou-server`
   - **前端网关**：`pindou-front`
3. 给两个服务各绑一个**公网域名**（Zeabur 自动分配 `*.zeabur.app`，也可绑定自定义域名）：
   - 后端域名记为 `https://<backend>.zeabur.app`
   - 前端域名记为 `https://<front>.zeabur.app`（用户访问这个）

## 3. 后端环境变量（Zeabur 服务 Variables 里填）

| 变量 | 值 |
|------|----|
| `PORT` | 留空即可（Zeabur 注入），代码默认 3000 |
| `DB_HOST` / `DB_PORT` | Aiven Host / Port（非 3306） |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Aiven 值（DB_NAME=pindou） |
| `DB_SSL` | `require`（或 `require` + 挂 `ca.pem` 到容器并设 `DB_SSL_CA=/app/ca.pem`） |
| `CACHE_DRIVER` | `redis` |
| `REDIS_URL` | Upstash 的 `rediss://…` 连接串 |
| `REDIS_DB` | `0` |
| `JWT_SECRET` | 任意随机长串 |
| `PUBLIC_BASE_URL` | 后端公网域名 `https://<backend>.zeabur.app` |
| `CORS_ORIGIN` | `*` 或前端域名 `https://<front>.zeabur.app` |
| 拼小豆 AI | 公开部署留空（自动关闭）；自用再加 `VOLCANO_ARC_API_KEY` 等 + `AI_ALLOWED_USERS=你的手机号` |

### 上传目录持久卷（重要）
Zeabur 文件系统是临时的，必须给**后端服务挂 Volume**：
- 挂载路径：`/app/public/uploads`（容器工作目录是 `/app`）
- 否则部署/重启后笔记图片 404。

### 初始化数据库（一次性）
后端服务里打开 Zeabur 的 **Terminal/Console**，执行：
```bash
npm run db:init
```
> 若 Aiven 账号无权 `CREATE DATABASE`：先在 Aiven 建好 `pindou` 库，再手动导入 `pindou-server/sql/schema.sql`（把文件头 `CREATE DATABASE IF NOT EXISTS pindou;` 与 `USE pindou;` 两行去掉后，在 pindou 库内执行，或整份用有权限账号导入）。

## 4. 前端网关环境变量/构建参数

前端容器是 nginx 网关：启动时用 `BACKEND_UPSTREAM` 注入后端地址。

| 变量 | 值 |
|------|----|
| `BACKEND_UPSTREAM`（运行环境变量） | 后端地址，**含 scheme、无尾斜杠**：`https://<backend>.zeabur.app` |
| `VITE_API_BASE`（构建参数 Build Args） | 前端公网域名（同源走网关）：`https://<front>.zeabur.app` |

说明：nginx 会把本域 `/api/*` 与 `/uploads/*` 转发到后端；图片 URL 也基于同域 `/uploads/...`，因此无需改任何前端代码。

## 5. 部署后自检

1. 浏览器打开 `https://<front>.zeabur.app` → 首页能出内容、无 404 图；
2. `https://<backend>.zeabur.app/api/health` → `{"code":200,"status":"ok",…}`；
3. 用手机号注册登录 → 发一条带图笔记 → 首页可见；
4. 顶部最右“Bug反馈”弹窗提交一条 → `SELECT * FROM feedbacks;` 能看到；
5. 拼小豆：未配 key 显示“建设中”；配 key+白名单后仅你的号可用，别人 403；
6. 重启一次后端后再看图片仍正常（验证 Volume 生效）。

## 6. 常见问题

- **后端日志 `ER_ACCESS_DENIED`/连接超时**：检查 Aiven Host/Port/用户/TLS（`DB_SSL=require`）。
- **Redis 报 db 越权**：确认 `REDIS_URL` 用 `rediss://`、`REDIS_DB=0`。
- **图片 404**：uploads 没挂 Volume，或 `VITE_API_BASE` 不是前端域名。
- **全站接口 403/跨域**：确认 `CORS_ORIGIN` 与网关 `BACKEND_UPSTREAM` 配置。
