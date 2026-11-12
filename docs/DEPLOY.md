# JukeboxRoom 部署文档

## 🤖 AI 一键部署（推荐）

把下面这段提示词复制给任意 AI 编程助手（ZCode / Claude Code / Cursor 等），并授予服务器操作权限，即可自动完成部署：

```text
请帮我在这台服务器上部署 JukeboxRoom 多人在线点歌系统（Node.js ≥ 20）：

1. 安装 Node.js 20（没有的话用 nvm 或系统包管理器安装）
2. 克隆仓库：git clone https://github.com/yuchen0x1/JukeboxRoom.git 并进入目录
3. 安装网页服务依赖：npm run install:web（根目录、server、client；桌面版依赖仅在构建桌面版时安装）
4. 创建 server/.env，内容包含：
   NODE_ENV=production
   CLIENT_ID_SECRET=<随机生成一段至少 32 个字符的密钥>
   AUTH_JWT_SECRET=<再随机生成一段不同的至少 32 个字符的密钥>
   METING_API_URL=https://api.injahow.cn/meting
   METING_SEARCH_API_URL=https://api.i-meto.com/meting/api
   （如绑定域名对外服务，再补 CLIENT_URL=https://你的域名 和 TRUST_PROXY=1）
5. 构建前端：进入 client 目录执行 npm run build
6. 启动服务：进入 server 目录用 pm2（npm i -g pm2 && pm2 start index.js --name jukeboxroom）或 systemd 常驻运行 node index.js，默认端口 4000
7. 自检：curl http://127.0.0.1:4000/api/health 应返回 ok
8. 最后告诉我访问地址（http://服务器IP:4000）、如何修改端口、如何更新版本（git pull 后重新 build + pm2 restart）

遇到报错请自行排查修复后再继续，不要中途停下来问我。
```

部署完成后：访问 `http://服务器IP:4000` 进入房间大厅 → 🔑「音源登录」扫码/授权登录各平台 → 房主登录后全房即可点播 VIP 音源。

Windows 桌面版的「音乐平台账号」设置还提供咪咕音乐（实验性）手机号+短信验证码登录。手机号和验证码不会写入磁盘，只有登录令牌会加密保存在本机；该功能依赖非官方社区接口，不属于咪咕官方合作接入，接口变化可能导致登录或播放暂时不可用。

## Docker 部署（最简）

仓库根目录自带 `Dockerfile` 与 `docker-compose.yml`：

```bash
git clone https://github.com/yuchen0x1/JukeboxRoom.git
cd JukeboxRoom
# 编辑 docker-compose.yml：把 CLIENT_ID_SECRET 和 AUTH_JWT_SECRET 换成不同的长随机串
docker compose up -d --build
```

- 访问 `http://服务器IP:4000`
- 房间数据持久化在宿主机 `./data` 目录
- 可选 Redis：取消 compose 中 redis 段注释并配置 `REDIS_URL=redis://redis:6379`

## 前置依赖

### 1. Meting-API（必填）

网易云 / QQ音乐播放、歌词、封面、歌单搜索与导入均依赖 Meting-API。

接口项目：[qq01-hub/Meting-API](https://github.com/qq01-hub/Meting-API)

```bash
docker pull w3126197382/meting-api:latest
docker run -d --name meting -p 3000:3000 w3126197382/meting-api:latest
```

建议在 Meting 管理后台（`/admin`，默认 `admin` / `admin123`）配置网易云渠道 Cookie。

### 2. 迟言 API Key（可选）

用于酷狗音乐搜索/播放、**队列为空随机推荐**（wyrp）。不配置时网易云与 QQ音乐仍可用。

在 [迟言 API](https://cyapi.top/) 注册获取 `CYAPI_KEY`。

### 3. Redis（推荐）

配置后启用房间歌单、播放进度、点歌热榜、个人收藏持久化；未配置则仅内存，重启后丢失。

---

## 环境变量

在 `server/.env` 中配置（参考 `server/.env.example`）：

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `PORT` | | 服务端口，默认 `4000` |
| `NODE_ENV` | 生产推荐 | 设为 `production` |
| `CLIENT_URL` | 生产必填 | 允许的前端 Origin，多个用英文逗号分隔 |
| `CLIENT_ID_SECRET` | 生产必填 | 至少 32 个字符且不能是占位符；浏览器会话签名密钥，**重启后不要变化** |
| `AUTH_JWT_SECRET` | 生产必填 | 至少 32 个字符且不能是占位符；平台账号 JWT 签名密钥，**重启后不要变化** |
| `AUTH_ACCESS_TTL` | 可选 | 访问令牌有效期（毫秒，默认 24 小时） |
| `AUTH_REFRESH_TTL` | 可选 | 刷新令牌有效期（毫秒，默认 30 天；刷新令牌轮换且只能使用一次） |
| `MAX_CONCURRENT_SOCKETS_PER_IP` | 可选 | 单 IP 同时在线 Socket 数上限（进程内，默认 50） |
| `TRUST_PROXY` | 视部署而定 | 设为 `1` 时才信任 Nginx 的 `X-Forwarded-For` / `X-Real-IP` |
| `UPDATE_CHANNEL` | 固定 | `github`；当前在线更新只使用 GitHub 官方源 |
| `UPDATE_REPOSITORY` | `yuchen0x1/JukeboxRoom` | 在线更新检查读取的 GitHub 仓库（`owner/repo`） |
| `UPDATE_GITHUB_TOKEN` | 可选 | GitHub 只读令牌；更新检查走认证请求，避免匿名 API 限流；不要提交到仓库 |
| `GITEE_ACCESS_TOKEN` | 已废弃 | 旧版 Gitee 令牌配置，已不再读取 |
| `OPENMUSIC_DATA_DIR` | 可选 | JSON 存储目录；默认 `server/data`，生产建议放到独立数据盘并纳入备份 |
| `LIBRARY_WATCH_ENABLED` | 可选 | 设为 `1` 后监听 `MUSIC_LIBRARY_PATHS` 的新增、修改和删除；默认关闭 |
| `MUSIC_LIBRARY_PATHS` | 使用本地曲库时 | 多个目录用英文分号分隔；监听和扫描最多递归 5 层 |
| `MEDIA_HEALTH_FAILURE_THRESHOLD` / `MEDIA_HEALTH_FAILURE_WINDOW_MS` / `MEDIA_HEALTH_COOLDOWN_MS` | 可选 | 音乐源失败次数、统计窗口和熔断冷却时间 |
| `METING_API_URL` | 必填 | Meting-API 地址 |
| `METING_SEARCH_API_URL` | 推荐 | 搜索备用 Meting 源（主源不支持 type=search 时自动切换） |
| `METING_API_AUTH` | 推荐 | Meting 的 `auth` 令牌 |
| `CYAPI_KEY` | 可选 | 迟言 API Key（酷狗 + 随机推荐） |
| `CYAPI_BASE` | 可选 | 迟言 API 根地址，默认 `https://cyapi.top/API` |
| `REDIS_URL` | 可选 | Redis 连接串 |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` 等 | 可选 | 与 `REDIS_URL` 二选一 |

> 非生产环境如果未配置这两个变量，服务端会生成随机回退值并持久化到被忽略的 `server/data/.secrets.json`。生产环境不会读取或生成回退值，缺失、过短或明显占位符都会阻止启动。

### 生产最小配置（仅网易云）

```env
PORT=4000
NODE_ENV=production
CLIENT_URL=https://music.example.com
CLIENT_ID_SECRET=换成一段至少32字符的随机字符串
AUTH_JWT_SECRET=换成另一段不同的至少32字符随机字符串
METING_API_URL=http://127.0.0.1:3000
METING_API_AUTH=你的meting_token
```

### 全平台完整配置

```env
PORT=4000
NODE_ENV=production
CLIENT_URL=https://your-domain.com
CLIENT_ID_SECRET=换成一段至少32字符的随机字符串
AUTH_JWT_SECRET=换成另一段不同的至少32字符随机字符串
METING_API_URL=http://127.0.0.1:3000
METING_API_AUTH=你的meting_token
CYAPI_KEY=你的迟言apikey
REDIS_URL=redis://127.0.0.1:6379/0
```

---

## 部署方式

### Node 直接托管

生产环境由 **同一 Node 进程** 托管 API、WebSocket 与 `client/dist` 静态资源。

### SEO

页面 `canonical`、Open Graph 等标签在浏览器端按**当前访问域名**自动写入；`/sitemap.xml` 与 `/robots.txt` 由 Node 服务动态生成（优先 `CLIENT_URL`），无需单独配置前端环境变量。

```bash
npm run install:web
npm run build
cp server/.env.example server/.env
# 编辑 server/.env

npm start
```

打包命令：

| 命令 | 说明 |
|------|------|
| `npm run build` | 构建前端 → `client/dist` |
| `npm run package:build` | 组装 `release/openmusic-build.zip` |

### 宝塔 / PM2

详细步骤见 [deploy/DEPLOY-BAOTA.md](../deploy/DEPLOY-BAOTA.md)。

**请保持单实例运行**（房间状态在进程内存中，多实例会导致同步异常）。

---

## Nginx 反向代理

**必须**为 `/socket.io` 配置 WebSocket 升级，否则实时同步失效：

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
}
```

完整示例：[deploy/nginx.conf.example](../deploy/nginx.conf.example)

> 限流、IP 归属地等功能依赖反代正确转发 `X-Forwarded-For` / `X-Real-IP`。

---

## HTTP API 速查

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/health/live` | 进程存活检查 |
| `GET` | `/api/health/ready` | 服务就绪检查 |
| `GET` | `/api/update` | 获取当前/最新版本和 Release 资产 |
| `GET` | `/api/music/health` | 获取三类音乐源的健康、失败和熔断状态 |
| `GET` | `/api/rooms` | 房间列表 |
| `POST` | `/api/rooms` | 创建房间 |
| `GET` | `/api/music/hot` | 点歌热榜 |
| `GET` | `/api/music/toplist/netease` | 热歌榜 |
| `POST` | `/api/music/playlist/import` | 导入歌单 |
| `GET` | `/api/media-proxy?url=` | HTTP 媒体同源代理 |

WebSocket 连接：`/socket.io`（与 HTTP 同端口）

主要事件：`join_room`、`add_song`、`toggle_play`、`seek`、`send_chat`、`toggle_chat_reaction`、`room_update`、`playback_state`、`chat_message`
