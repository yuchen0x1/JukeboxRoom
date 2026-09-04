# OpenMusic · 多人实时在线点歌系统

一群人聚在一起听歌，最怕的就是"放什么"争不出结果。这个项目把选歌权交还给房间里的每一个人：大家各自搜歌、点歌、排队列，播放进度、歌词、聊天全部实时同步。

OpenMusic 由 Node.js 服务端和 React Web 客户端组成，可直接私有部署。用户创建或加入音乐房间后，共享播放队列、播放进度和歌词，并在房间内聊天；服务端同时负责音乐源适配、媒体代理、房间管理、可选持久化和管理类接口。

典型场景：私人聚会、线上陪伴听歌、小型直播点歌、办公室/宿舍共享歌单、TV 大屏展示。项目处于正常维护与持续更新中。

代码托管在 Gitee，克隆方式：

```bash
git clone https://gitee.com/yuchen0x1/zaixian-diange-fang.git
```

## 快速上手

### 运行环境

- Node.js 20 或更高版本，建议使用当前 LTS 版本；
- npm；
- Docker / Docker Compose（可选，仅用于运行仓库提供的 Meting-API Compose 配置）；
- Redis（生产环境推荐；开发环境可以不配置）；
- 如需构建移动端：Android Studio / Android SDK 或 Xcode，以及 Capacitor 所需的本地工具链。

### 第一步：安装依赖

在项目根目录执行：

```bash
npm run install:all
```

该命令会依次安装根目录、`server` 和 `client` 的依赖。

### 第二步：准备 Meting-API

网易云和 QQ 的播放、歌词、封面、歌单搜索与导入都依赖 Meting-API。仓库自带一个自托管示例：

```bash
docker compose -f deploy/docker-compose.meting.yml up -d
```

这份 Compose 配置把容器的 3000 端口映射到宿主机的 **3300** 端口，所以服务端可以填 `http://127.0.0.1:3300`。注意：服务端默认拒绝访问本地主机、私有地址和保留地址，本机自托管 Meting 时必须额外设置 `ALLOW_PRIVATE_UPSTREAMS=1`；生产环境优先使用可校验证书的 HTTPS 上游。需要配置平台 Cookie 时，按 `deploy/docker-compose.meting.yml` 中的注释补充环境变量。

### 第三步：写好服务端配置

Linux / macOS：

```bash
cp server/.env.example server/.env
```

Windows PowerShell：

```powershell
Copy-Item server/.env.example server/.env
```

开发环境最小配置示例：

```env
PORT=4000
CLIENT_URL=http://localhost:5173
CLIENT_ID_SECRET=change-this-development-secret
AUTH_JWT_SECRET=change-this-development-jwt-secret
METING_API_URL=http://127.0.0.1:3300
ALLOW_PRIVATE_UPSTREAMS=1
METING_API_AUTH=
```

### 第四步：启动开发环境

```bash
npm run dev
```

- 服务端：`http://localhost:4000`
- Vite 前端：通常为 `http://localhost:5173`

打开前端地址，即可创建房间、搜索歌曲并把歌加入队列。

## 功能一览

**房间与社交**

- 房间大厅、6 位房间号、在线人数、房间密码、分享链接、退出与重连；
- 房间内聊天：文本、QQ 表情、本地/微信表情包入口、消息回复、@ 提及、消息点评，以及可选的七牛云图片上传。

**播放与音乐**

- 基于 Socket.IO 的实时同步播放：同步播放状态、队列和进度，支持断线重连与进度校准；
- 音乐搜索与播放：网易云（红点）、QQ（绿点）和可选的酷狗/迟言 API（蓝点）；
- 歌单与收藏：歌单搜索、外部歌单导入、网易云热榜、个人收藏、JSON 导入/导出；
- 歌词滚动与逐字高亮、播放质量选择、封面背景、Mini Player、媒体代理。

**房主管理**

- 房间改名、锁定、公告、全员禁言、踢人、成员等级、贵宾/管理员角色、点歌规则和 FM 模式。

**视觉与展示**

- 视觉模式：默认背景、唱片、封面、星河、声波地形、沉浸模式和纯净模式；
- TV 大屏：访问 `/tv/:roomId` 使用大屏播放界面。

**服务端扩展能力**

- 本地曲库支持音频内嵌标签和文件名回退；可选跨平台目录监听，新增、修改和删除文件会自动刷新索引。

- 认证、管理员、曲库扫描与本地流、AutoDJ、共享歌单、任务中心、审计日志、SEO 文件和可选 Prometheus 指标。

**移动端**

- Capacitor Android/iOS 远程 URL 模式，在 App 内 WebView 打开线上站点。

> 说明：认证、管理员、曲库、AutoDJ、任务和共享歌单 API 已存在于服务端，但当前客户端主要提供首页、房间页和 TV 页；这些管理能力不代表已经提供对应的前端后台页面。

## 技术选型

- **服务端**：Node.js、Express、Socket.IO
- **客户端**：React、Vite、TypeScript、Zustand、Tailwind CSS
- **3D/视觉**：Three.js、@react-three/fiber、MediaPipe Tasks Vision
- **移动端**：Capacitor Android / iOS
- **音乐服务**：Meting-API；迟言 API（可选）
- **持久化**：Redis（可选）；未配置时使用本地 JSON/内存存储
- **对象存储**：七牛云 OSS（可选，用于聊天图片）

## 服务端环境变量

所有服务端配置均从 `server/.env` 读取。生产环境应设置 `NODE_ENV=production`，并使用稳定且足够长的随机密钥。以下按用途分组列出。

**基础与安全**

- `PORT`：服务端口，默认 `4000`。
- `NODE_ENV`：生产环境设置为 `production`。
- `CLIENT_URL`（生产必填）：允许的前端 Origin；多个地址用英文逗号分隔，不要带末尾斜杠。
- `CLIENT_ID_SECRET`（生产必填）：浏览器会话 ID 签名密钥，重启后不要变化。
- `AUTH_JWT_SECRET`（生产必填）：平台账号 JWT 签名密钥，重启后不要变化。
- `TRUST_PROXY`：Nginx 正确覆盖转发头时设为 `1`，用于获取真实客户端 IP。
- `AUTH_ACCESS_TTL`：认证访问令牌有效期（毫秒）。

**音乐源**

- `METING_API_URL`（推荐）：Meting-API 地址；公网优先使用 HTTPS，仓库 Compose 示例为 `http://127.0.0.1:3300`。
- `ALLOW_PRIVATE_UPSTREAMS`（本地 Meting 必填）：设为 `1` 时允许服务端访问配置的私有地址 Meting 上游；不要用于用户可控 URL。
- `METING_API_AUTH`（推荐）：Meting-API 的鉴权令牌。
- `CYAPI_BASE`：迟言 API 根地址，默认 `https://cyapi.top/API`。
- `CYAPI_KEY`：启用蓝点（酷狗）搜索/播放和随机推荐。
- `VMY_LRC_URL`：歌词备用接口，默认 `https://api.52vmy.cn/api/music/lrc`。

**Redis 持久化**

- `REDIS_URL`：Redis 连接串；与下面的分项配置二选一。
- `REDIS_HOST` / `REDIS_PORT`：Redis 主机和端口。
- `REDIS_USERNAME` / `REDIS_PASSWORD` / `REDIS_DB`：Redis 认证信息和数据库编号。

**七牛云（聊天图片上传）**

- `QINIU_ACCESS_KEY` / `QINIU_SECRET_KEY`：七牛云上传凭据。
- `QINIU_BUCKET` / `QINIU_DOMAIN` / `QINIU_ZONE`：存储桶、访问域名和区域（如 `z0`）。

**其他可选**

- `APIHZ_IMG_ID` / `APIHZ_IMG_KEY`：接口盒子聊天表情包搜索凭据。旧变量名 `APIHZ_ID` / `APIHZ_KEY` 仍可作为兼容别名。
- `METRICS_ENABLED`：设为 `1` 开启 `/metrics`。
- `METRICS_TOKEN`：`/metrics` 访问令牌。生产环境不要开放无保护指标。
- `MUSIC_LIBRARY_PATHS`：本地曲库目录，多个路径用分号分隔；用于曲库扫描和本地流。
- `LIBRARY_WATCH_ENABLED`：设为 `1` 后监听本地曲库变化，默认关闭。
- `MEDIA_HEALTH_FAILURE_THRESHOLD` / `MEDIA_HEALTH_FAILURE_WINDOW_MS` / `MEDIA_HEALTH_COOLDOWN_MS`：音乐源失败熔断参数。
- `GET /api/music/health`：查看网易云、QQ、酷狗音源的健康状态、失败次数和冷却时间。
- `AUTODJ_ENABLED` / `AUTODJ_ACTIVE_HOURS`：AutoDJ 开关和活动时间段（如 `9-23`）。
- `AUTODJ_AVOID_SAME_SONG` / `AUTODJ_AVOID_SAME_ARTIST` / `AUTODJ_LOW_WATER`：AutoDJ 去重窗口和队列低水位。
- `TASK_AUDIT_RETENTION_DAYS` / `TASK_RUNS_KEEP`：任务审计保留天数和任务运行记录数量上限。

## 日常使用

### 网页端房间

1. 打开首页点击"创建房间"，可填写房间名和密码。
2. 把 6 位房间号或分享链接发给其他成员。
3. 搜索歌曲或歌单，点击歌曲加入播放队列。
4. 在聊天室发送文本、表情或图片，也可以回复、@ 提及和点评消息。
5. 房主在房间设置中调整点歌限制、公告、视觉背景、成员权限、音质和 FM 模式。
6. 需要大屏展示时，访问 `https://你的域名/tv/房间号`。

### 手机 App（Capacitor 壳）

先在 `client/.env.capacitor` 中设置线上 HTTPS 地址（参考 `client/.env.capacitor.example`），再在根目录执行：

Android：

```bash
npm run cap:sync:android
npm run cap:open:android
```

iOS：

```bash
npm run cap:sync:ios
npm run cap:open:ios
```

也可以一步到位：

```bash
npm run cap:run:android
npm run cap:run:ios
```

远程 URL 模式下，App 内 WebView 直接打开线上站点；前端更新后通常只需重新部署 Web 站点。

## 接口速查

常用 HTTP 接口按模块分组如下，完整路由以 `server/index.js` 及各服务端路由模块为准。

- **健康检查**：`GET /api/health` 综合健康状态；`GET /api/health/live` 存活检查；`GET /api/health/ready` 就绪检查。
- **版本更新**：`GET /api/update` 仅读取 Gitee 国内最新稳定版本；API 受限时降级读取 Gitee Release 页面，并返回版本号、更新说明及桌面/Android/iOS 资产。
- **房间**：`GET / POST /api/rooms` 房间列表 / 创建房间；`GET /api/rooms/:id` 获取房间公开信息。
- **音乐**：`GET /api/music/sources` 当前可用音乐源；`GET /api/music/health` 音乐源健康状态；`GET /api/music/hot` 点歌热榜；`GET /api/music/toplist/netease` 网易云热歌榜；`GET /api/music/netease/playlists/search` 网易云歌单搜索；`POST /api/music/playlist/import` 导入歌单。
- **媒体与聊天**：`GET /api/media-proxy?url=...` 同源媒体代理；`GET /api/chat/sticker-search` 表情包搜索（需配置对应凭据）；`POST /api/chat/upload-token` 获取聊天图片上传令牌（需配置七牛云）。
- **扩展模块**：`GET / POST /api/auth/...` 用户认证；`GET / POST /api/admin/...` 管理员接口（需管理员角色）；`GET / POST /api/library/...` 曲库接口（需授权）；`GET / POST /api/autodj/...` AutoDJ 接口（需授权）；`GET / POST /api/playlists/...` 共享歌单接口（需登录和授权）。

WebSocket 与 HTTP 使用同一端口，连接路径为 `/socket.io`。常用事件包括 `join_room`、`add_song`、`toggle_play`、`seek`、`send_chat`、`toggle_chat_reaction`、`room_update`、`playback_state` 和 `chat_message`。

快速验证服务是否正常：

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/music/sources
```

导入歌单示例（把 URL 换成目标平台的真实歌单链接）：

```bash
curl -X POST http://localhost:4000/api/music/playlist/import \
  -H "Content-Type: application/json" \
  -d '{"platform":"netease","input":"https://music.163.com/playlist?id=123456"}'
```

## 常用 npm 脚本

- `npm run install:all` — 安装根目录、服务端和客户端依赖。
- `npm run dev` — 同时启动服务端和前端开发服务器。
- `npm run dev:server` — 仅启动服务端开发模式。
- `npm run dev:client` — 仅启动前端开发模式。
- `npm run build` — 执行客户端 TypeScript 检查并构建 `client/dist`。
- `npm run check` — 运行服务端/客户端测试、生产构建和依赖审计。
- `npm run check:health` — 检查已启动服务的存活、就绪和更新接口。
- `npm run start` — 启动生产服务端；服务端会托管 `client/dist`。
- `npm run cap:sync:android` / `npm run cap:sync:ios` — 同步 Capacitor 原生项目。
- `npm run cap:open:android` / `npm run cap:open:ios` — 在 Android Studio / Xcode 中打开项目。
- `npm run cap:run:android` / `npm run cap:run:ios` — 同步并运行移动端项目。
- `npm run cap:build:apk` — 构建 Android debug APK。

### 测试

服务端测试使用 Node 内置测试运行器：

```bash
npm test --prefix server
```

客户端使用 Vitest，根目录提供统一检查入口：

```bash
npm test
npm run check
npm run check:health
```

`check:health` 默认检查 `http://127.0.0.1:4000` 的存活、就绪和更新接口；可用 `OPENMUSIC_URL` 指向已启动实例，或用 `OPENMUSIC_SKIP_UPDATE=1` 跳过外部更新源检查。

服务端未配置 Redis 时会使用 JSON 文件保存账号、收藏、歌单和审计等数据，默认目录是 `server/data`。生产环境可设置 `OPENMUSIC_DATA_DIR` 指向独立的数据盘；升级或备份时只覆盖代码目录，不要删除该数据目录。

本地曲库扫描会优先读取音频内嵌标签，失败时回退文件名；设置 `LIBRARY_WATCH_ENABLED=1` 后，新增、修改和删除文件会通过跨平台监听器自动刷新索引。

## 上线部署

### 单 Node 进程

生产环境由同一个 Node 进程提供 API、WebSocket 和 `client/dist` 静态资源：

```bash
npm run install:all
npm run build
cp server/.env.example server/.env
# 编辑 server/.env 后执行
npm run start
```

生产部署细节、SEO、PM2 和 Nginx 配置见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。宝塔部署见 [`deploy/DEPLOY-BAOTA.md`](deploy/DEPLOY-BAOTA.md)。

### Nginx 反向代理

必须为 `/socket.io/` 配置 WebSocket 升级，否则房间无法实时同步。可直接参考 [`deploy/nginx.conf.example`](deploy/nginx.conf.example)。使用反向代理时，按实际情况设置 `TRUST_PROXY=1`。

### Redis 与实例数

未配置 Redis 时，房间等状态主要保存在进程内存或本地 JSON 存储中，重启可能丢失。生产环境建议启用 Redis；在没有共享状态方案前请保持单实例运行，避免多个进程之间的房间状态不一致。

### 关于 Docker

仓库仅提供 Meting-API 的 Docker Compose 示例，不包含 OpenMusic 主服务的 Dockerfile 或完整应用 Compose 部署文件。主服务请使用 Node/PM2、宝塔或自行制作容器镜像部署。

## 安全注意事项

- 生产环境必须使用 HTTPS，并设置稳定、随机的 `CLIENT_ID_SECRET` 和 `AUTH_JWT_SECRET`。
- 不要将 `.env`、Redis 凭据、七牛云密钥或第三方 API Key 提交到公开仓库。
- 媒体代理只允许 `http`/`https` URL，并会拒绝本地主机、环回、私有和保留地址；不要把它当作任意内网访问代理。
- Nginx 必须正确转发 `X-Forwarded-For` / `X-Real-IP`，否则限流和 IP 识别可能不准确。
- 未配置 Redis 时服务重启会丢失易变状态；多实例部署需要先设计共享状态和一致性方案。
- Meting-API、迟言 API 和七牛云均为可选的外部服务，请遵守其服务条款、版权和内容使用要求。

## 常见问题排查

**页面能打开，但进不了房间**
检查 Nginx 是否配置了 `/socket.io/` 的 WebSocket 升级，并确认 `CLIENT_URL` 与访问域名一致。

**搜不到歌或无法播放**
检查 `METING_API_URL`、Meting 服务状态及 `METING_API_AUTH`；蓝点还需要 `CYAPI_KEY`。

**蓝点播放卡顿**
为 `/api/media-proxy` 关闭 Nginx 缓冲，具体配置见 `deploy/nginx.conf.example`。

**生产启动后跨域失败**
设置 `NODE_ENV=production` 时必须配置正确的 `CLIENT_URL`，多个 Origin 用英文逗号分隔。

**出现 502 或服务不可用**
检查 `npm run start` / PM2 是否运行、端口是否与 Nginx 反代端口一致。

**服务重启后房间消失**
未配置 Redis 时属于预期行为；生产环境配置 `REDIS_URL` 或 Redis 分项变量。

**聊天发不了图片**
配置七牛云相关变量；未配置时图片上传能力会被禁用。

**移动端打不开线上页面**
检查 `client/.env.capacitor` 中的 `CAPACITOR_SERVER_URL` 是否为可访问的 HTTPS 地址。

## 目录结构

```text
.
├── client/                 # React + Vite 前端与 Capacitor Android/iOS 项目
│   ├── src/                # 页面、组件、hooks、状态和客户端工具
│   └── android/            # Android 原生工程
├── server/                 # Express + Socket.IO 服务端
│   ├── auth/               # 认证
│   ├── admin/              # 管理接口
│   ├── library/            # 本地曲库
│   ├── autodj/             # AutoDJ
│   ├── playlists/          # 共享歌单
│   ├── tasks/              # 任务中心
│   └── *.test.js           # Node 内置测试
├── deploy/                 # Meting Compose、PM2 和 Nginx 示例
├── docs/                   # 部署、升级和审计文档
├── scripts/                # 构建与视觉资源脚本
├── CHANGELOG.md            # 版本变更记录
└── LICENSE                 # MIT License
```

## 参与贡献

欢迎通过 Gitee 的 Issue 或 Pull Request 提交 Bug、改进建议和代码。提交前请至少运行：

```bash
npm test --prefix server
npm run build
```

涉及服务端请求 URL、媒体代理或第三方接口的改动，应同时检查 URL 协议、主机校验、超时和错误处理。

## 许可证与更新记录

- 本项目采用 [MIT License](LICENSE)，版权信息以仓库中的 `LICENSE` 文件为准。
- 版本变更见 [`CHANGELOG.md`](CHANGELOG.md)。

## 交流与反馈

- QQ 交流群：`1016190748`
- Telegram：https://t.me/lenmoC

反馈问题时请说明使用的版本、运行平台、部署方式和具体错误信息，以便更快定位。
