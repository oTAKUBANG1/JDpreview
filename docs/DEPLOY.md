# 部署说明（v1.0 封版）

目标：一台香港轻量（2C2G 足够）+ 一个域名，小圈子用。国内服务器需 ICP 备案，香港不需要；但域名要实名。

## 1. 服务器准备

```bash
# Ubuntu 22.04 / Debian 12
sudo apt update && sudo apt install -y docker.io docker-compose-v2 caddy git
sudo systemctl enable --now docker
```

## 2. 拉代码并起容器

```bash
git clone https://github.com/oTAKUBANG1/JDpreview.git
cd JDpreview
docker compose up -d --build
docker compose ps        # 等 health 变 healthy
curl -s http://127.0.0.1:3080/api/health
```

首次构建会装依赖并下载语言包（约 25MB 静态资源），需要出网。构建完镜像里不留 node_modules。

数据存在 `./data/jdpool.sqlite`，删容器不丢；**备份就备份这个文件**。

## 3. 域名 + HTTPS

DNS A 记录指向服务器 IP，然后：

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # 改域名、改 basic_auth 哈希
sudo systemctl reload caddy
```

生成口令哈希：

```bash
docker run --rm caddy:2 caddy hash-password --plaintext '你的密码'
```

Caddy 会自动申请证书。确认 80/443 在防火墙放行，且 3080 只绑在 127.0.0.1（compose 里已限制）。

## 4. 日常运维

| 操作 | 命令 |
|---|---|
| 看日志 | `docker compose logs -f app` |
| 重启 | `docker compose restart app` |
| 升级 | `git pull && docker compose up -d --build` |
| 回滚代码 | `git checkout <上一个commit> && docker compose up -d --build` |
| 备份数据 | `cp data/jdpool.sqlite backups/jdpool-$(date +%F).sqlite` |
| 清理岗位池 | `sqlite3 data/jdpool.sqlite "delete from jds where last_seen < date('now','-30 day')"` |

## 5. 安全清单

- [x] 应用默认只监听 127.0.0.1，容器里由 `HOST=0.0.0.0` 放开，但宿主机端口只绑本机
- [x] Caddy 基础认证，没有账号就别公开地址
- [x] `request_body` 限制 2MB
- [x] 响应加 `Cache-Control: no-store`，简历页面不被中间层缓存
- [x] 岗位池入库前脱敏（手机号/邮箱/微信/证件号）
- [ ] 还没做：访问限流、日志脱敏（当前日志只有启动行）、ICP 备案（仅大陆服务器需要）

## 6. 常见问题

**容器起来但宿主机访问不到**：检查 `HOST` 环境变量，应用默认 127.0.0.1，容器内必须 0.0.0.0。

**证书申请失败**：域名没解析到这台机器，或 80 端口被占用/未放行。

**内存不足**：OCR 在浏览器端跑，服务器压力很小；2C2G 足够。构建阶段 `npm ci` 才吃内存，可加 swap。

**想换数据库**：`JD_DB` 环境变量指向别的路径即可；换成 Postgres 需要改 `src/store.js`，当前没必要。
