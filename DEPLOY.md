# 部署指南（Docker Compose · Linux 云服务器）

本指南把一个**拼豆分享平台**以 Docker Compose 部署到 Linux 云服务器（ECS/VPS），
内置 **MySQL + Redis + 后端 + 前端(Nginx)**，对外只暴露一个端口即可访问。

> 当前阶段：**无域名，用「服务器公网 IP + 端口」访问**；暂不启用 AI（火山方舟 Key 留空即可）。
> 有域名后按文末 [加域名与 HTTPS](#加域名与-httpscaddy) 一节升级。

---

## 一、硬件/前置要求

- 一台 Linux 云服务器（推荐 **Ubuntu 22.04/24.04**，1C2G 起步，建议 2C4G）
- 有**公网 IP**、SSH 可登录（端口 22）
- 服务器可访问外网（拉取 Docker 镜像）

## 二、安装 Docker 与 Compose

SSH 登录服务器后执行（Ubuntu）：

```bash
# 1. 更新源并安装依赖
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl

# 2. 官方 Docker 安装脚本（装 Docker Engine 与 Compose 插件）
curl -fsSL https://get.docker.com | sudo sh

# 3. 让当前用户免 sudo 用 docker
sudo usermod -aG docker $USER
newgrp docker

# 4. 验证
docker --version
docker compose version
```

## 三、克隆项目

```bash
# 用 HTTPS 克隆（或换成你的 git 地址）
git clone https://github.com/xiaozhaobuchiyv/ai-bead-social-platform.git
cd ai-bead-social-platform
```

## 四、配置环境变量 `.env`

在**项目根目录**创建一个 `.env`（docker compose 会自动读取）：

```bash
cp .env.example .env
nano .env
```

至少要改这三项（`.env.example` 里有注释）：

```
DB_PASSWORD=<设置一个强密码>                # MySQL root 密码
JWT_SECRET=<32位以上随机长字符串>            # JWT 密钥
PUBLIC_BASE_URL=http://<服务器公网IP>:8080  # 对外访问地址（无域名用 IP）
```

> ⚠️ 关键：`PUBLIC_BASE_URL` 影响前端镜像里的 `VITE_API_BASE`（图片上传/访问地址）。
> 一定改成**别人能访问到的地址**，否则图片显示不出来。
> 火山方舟 AI 相关变量**留空**即可（不影响其他功能）。

## 五、一键启动

```bash
docker compose up -d --build
```

首次会拉取镜像并构建（几分钟）。启动后：

- **前端**：`http://<服务器公网IP>:8080`
- **后端文档**：`http://<服务器公网IP>:3000/api/docs`（可选访问）

首次启动时 MySQL 会自动执行 `sql/schema.sql` 建库建表（幂等）。
**第一个注册的账号即全新用户**（数据库为空）。

查看日志 / 状态：

```bash
docker compose ps
docker compose logs -f pindou-server
```

## 六、安全组 / 防火墙：只开放必要的端口

在你的云控制台「安全组」和服务器防火墙里**只放行**：

| 端口 | 用途 | 是否公开 |
|------|------|---------|
| `22` | SSH | 仅你 |
| `8080` | 前端（对外入口） | **公开** |
| `3000` | 后端 API 文档 | 建议**不对外**（API 已被 8080 的 nginx 代理） |
| `3306` | MySQL | **千万不要对外** |
| `6379` | Redis | **千万不要对外** |

```bash
# Ubuntu firewall（如启用）
sudo ufw allow 22/tcp
sudo ufw allow 8080/tcp
sudo ufw enable
```

> 后端 `/api` 与 `/uploads` 已由前端 Nginx 反代，**无需**开放 3000/3306/6379。

## 七、升级 / 重启 / 重置

```bash
# 重启
docker compose restart

# 更新代码后重新构建并重启
git pull
docker compose up -d --build

# 清空数据库（重新初始化，会丢数据）
docker compose down -v        # -v 会删除数据卷，请谨慎
docker compose up -d --build
```

## 八、常见问题

- **`JWT_SECRET`/`DB_PASSWORD` 未改**：生产环境务必改强，否则有安全风险。
- **图片不显示**：多半是 `PUBLIC_BASE_URL` 没改成公网地址，重新构建前端镜像即可。
- **启动报缺少环境变量**：确认根目录 `.env` 存在且填了 `JWT_SECRET`。
- **AI 聊天报错**：火山方舟 Key 未配或没有 AI Key，属正常，`AI 相关变量留空`即关闭该功能。

---

## 加域名与 HTTPS（Caddy）

有域名后，用 **Caddy** 最省事（自动申请/续期 HTTPS 证书）。
把域名 A 记录解析到服务器公网 IP，然后：

1. 在 `.env` 里把 `PUBLIC_BASE_URL` 改成 `https://your-domain.com`，`CORS_ORIGIN` 改成同地址。
2. 用 Caddy 反代到前端 8080：

```caddyfile
your-domain.com {
    reverse_proxy localhost:8080
}
```

3. `docker run -d --name caddy -p 80:80 -p 443:443 -v $PWD/Caddyfile:/etc/caddy/Caddyfile caddy:2`
   然后访问 `https://your-domain.com`。

（说明：仅用 IP 时无法申请免费 HTTPS 证书，需绑定域名。）
