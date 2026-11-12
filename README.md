# JukeboxRoom · 多人实时在线点歌系统

[![Release](https://img.shields.io/github/v/release/yuchen0x1/JukeboxRoom?display_name=tag&label=release&color=blue)](https://github.com/yuchen0x1/JukeboxRoom/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-brightgreen.svg)
![React](https://img.shields.io/badge/React-19-61dafb.svg)

JukeboxRoom 是一个可自托管的多人实时在线点歌系统：大家在同一个房间里搜索歌曲、提交队列、同步播放进度、看歌词、聊天和管理播放规则。

- 当前版本：**v0.0.15**（2026-11-13）
- 仓库、Issue 与 Release：<https://github.com/yuchen0x1/JukeboxRoom>
- 项目基于 [OpenMusic](https://github.com/qq01-hub/openmusic) 二次开发，感谢原作者
- 完整变更记录：[CHANGELOG.md](CHANGELOG.md) · [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases)

## 最新更新

### v0.0.15（2026-11-13）

- Windows 桌面版新增咪咕音乐（实验性）搜索与播放，支持用户主动触发手机号短信验证码登录。
- 咪咕登录令牌使用 AES-256-GCM 加密保存在本机，手机号和短信验证码不会写入磁盘；支持登录状态展示与退出登录。
- 优化咪咕歌曲、歌词、封面和播放地址解析，并加入媒体 CDN 白名单与健康状态保护。
- 网易云播放失败时给出更明确的登录、`METING_API_URL` 和切换音源提示；QQ 音乐、酷狗音乐等其他音源可继续使用。
- 咪咕接入依赖非官方社区接口，可能随上游变化失效；本次自动发布工作流继续生成 Windows 安装包及更新元数据，Android APK 暂不随本次 Release 发布。
- 更新边界与回滚步骤见 [自动更新说明](docs/AUTO_UPDATE.md)，完整历史见 [发布说明历史](docs/releases/release-notes.md)。

| 房间大厅 | 房间点歌与聊天 | 音源登录（房主专属） |
|:---:|:---:|:---:|
| ![房间大厅](docs/screenshots/home.png) | ![房间点歌](docs/screenshots/room.png) | ![音源登录](docs/screenshots/login.png) |

## 先选择使用方式

| 使用方式 | 适合场景 | 需要什么 |
|---|---|---|
| **自托管 Web** | 聚会、社群、办公室或家庭共享房间 | 一台 Node.js 20+ 服务器，或 Docker |
| **Windows 桌面版** | 单机使用，或在本机运行一个房间服务 | 从 GitHub Release 下载 NSIS 安装包；无需 Node.js |
| **Android 独立播放器** | 手机本地搜索、播放、收藏和后台播放 | Android 6.0（API 23）及以上，安装 APK 即可 |
| **iOS / Capacitor** | 将现有站点装进移动端 WebView | 需要自己的 HTTPS 站点和 Capacitor 工具链；当前不等同于 Android 独立播放器 |

> Windows 和 Android 安装包、版本说明及签名状态以 [最新 GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/latest) 为准。当前 Windows 构建未使用商业代码签名证书，Android 发布资产为 debug 签名。

## 核心能力

### 房间与社交

- 房间大厅、6 位房间号、密码、锁定、在线人数和分享链接
- 房间内聊天：文本、表情、回复、@ 提及、消息回应；可选七牛云图片上传
- 断线重连、房主转移、管理员/贵宾角色、禁言和踢人

### 播放与音乐

- 基于 Socket.IO 的实时同步播放：播放状态、队列、进度、暂停、拖动和跳歌
- 聚合搜索网易云音乐、QQ 音乐、酷狗音乐、汽水音乐；音质由上游和账号权限决定
- 房主可扫码或授权登录音源平台，房间成员共享房主可用的高品质音源；凭据加密保存在服务端，不下发到浏览器
- Windows 桌面版额外提供咪咕音乐（实验性）搜索与播放：手机号短信验证码仅在用户点击后发送，登录令牌加密保存在本机；该接入使用非官方社区接口，可能随上游变化失效
- 歌词、逐字高亮、封面背景、Mini Player、收藏、热榜、歌单搜索与外部歌单导入
- 同源媒体代理、音乐源健康检查、失败熔断和播放失败后的降级处理

### 房主管理与展示

- 房间改名、公告、点歌规则、FM 模式、音质和成员权限
- 多种视觉模式与 TV 大屏页面：`/tv/:roomId`

### 本地音乐与自动化

- 本地曲库扫描：读取音频标签，支持配置多个目录和可选文件变化监听
- AutoDJ：在指定时间段内按低水位自动补歌，并按歌曲/歌手去重
- 可选 Redis、JSON 数据持久化、Prometheus 指标和任务/审计 API

> 服务端包含认证、管理员、曲库、AutoDJ、共享歌单、任务中心和审计日志 API；Web 客户端提供首页、房间页、TV 大屏与管理后台（`/admin`）。

## 快速开始

### 方式一：Docker（推荐）

仓库根目录提供主服务的多阶段 `Dockerfile` 和 `docker-compose.yml`，会同时构建 React 前端并启动 Node.js 服务端。

```bash
git clone https://github.com/yuchen0x1/JukeboxRoom.git
cd JukeboxRoom
docker compose up -d --build
```

打开 `http://服务器IP:4000`。Compose 示例默认使用公开的第三方音乐源；音乐搜索和播放是否可用取决于上游服务，请按实际情况替换为自建或可信的 Meting 服务。

生产环境至少要做这些事：

1. 将 `CLIENT_ID_SECRET` 和 `AUTH_JWT_SECRET` 换成**两段不同的、至少 32 个字符的随机值**。
2. 首次启动前配置 `ADMIN_INIT_USERNAME` 和 `ADMIN_INIT_PASSWORD`，服务端会创建一个超级管理员；两项必须同时设置，密码长度需为 8-128 位。创建成功后可移除这两项配置。
3. 保留宿主机 `./data` 数据目录，升级时不要删除它。
4. 对外提供服务时使用 HTTPS、正确的 `CLIENT_URL` 和 WebSocket 反向代理。
5. 如需 Redis，启用 Compose 中的 Redis 服务并配置 `REDIS_URL`；多实例部署仍需额外设计共享状态和一致性方案。

启动后从首页底栏进入「管理后台」，管理员可使用 `/admin` 完成用户封禁/角色调整、房间公告/关闭、任务、审计、曲库和 AutoDJ 管理。普通账号可以注册和登录，但没有管理后台权限。

### 方式二：源码开发

要求 Node.js 20+ 和 npm。首次安装网页端依赖：

```bash
git clone https://github.com/yuchen0x1/JukeboxRoom.git
cd JukeboxRoom
npm run install:web
```

复制服务端配置模板：

```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server/.env.example server/.env
```

开发环境可以使用如下最小配置（非生产环境的空密钥会由服务端生成并保存到被忽略的 `server/data/.secrets.json`）：

```env
PORT=4000
CLIENT_URL=http://localhost:5173
CLIENT_ID_SECRET=
AUTH_JWT_SECRET=
METING_API_URL=http://127.0.0.1:3300
ALLOW_PRIVATE_UPSTREAMS=1
```

如果没有可用的 Meting 上游，可以启动仓库提供的示例：

```bash
docker compose -f deploy/docker-compose.meting.yml up -d
```

然后启动前端和服务端：

```bash
npm run dev
```

- Vite 前端：<http://localhost:5173>
- Node.js 服务端：<http://localhost:4000>
- 健康检查：<http://localhost:4000/api/health>

本机自托管 Meting 只应在开发环境使用 `ALLOW_PRIVATE_UPSTREAMS=1`；公网部署优先使用 HTTPS 上游，并遵守相关服务条款和版权要求。

### 方式三：下载安装包

从 [GitHub Releases](https://github.com/yuchen0x1/JukeboxRoom/releases/latest) 下载：

- **Windows**：`jukeboxroom-desktop-setup-<版本>-x64.exe`。内置本地服务端和完整页面，无需安装 Node.js。
- **Android**：`jukeboxroom-android-<版本>-debug.apk`。独立个人音乐播放器，不需要填写 JukeboxRoom 服务器地址。

Windows 首次运行若出现 SmartScreen，请先核对文件确实来自本项目 GitHub Release。桌面版关闭主窗口默认进入系统托盘；卸载安装程序会删除本机应用数据目录，升级或卸载前请按需备份。

## 生产部署

### 自动更新边界

服务端默认每天检查 GitHub Release。执行一键更新前会检查 Git 工作区必须干净，并确认 `origin` 指向 `yuchen0x1/JukeboxRoom`；存在未提交/未跟踪文件、远程地址不匹配或本地分支无法快进时会拒绝更新，不会覆盖本地代码。需要手动维护版本时可设置 `AUTO_UPDATE=0`。

Windows 桌面安装包使用独立的 `electron-updater` 流程：只在已打包的 Windows NSIS 版本启用，检查不会自动下载，用户确认后才下载并退出安装。Android/iOS 仍使用应用商店或手动分发。完整流程见 [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md)。

### Node.js / PM2

生产环境由同一个 Node.js 进程提供 API、Socket.IO 和 `client/dist` 静态资源：

```bash
npm run install:web
npm run build
cp server/.env.example server/.env
# 编辑 server/.env，设置生产密钥、CLIENT_URL 和音乐源
npm start
```

使用 PM2 时可直接使用仓库配置：

```bash
pm2 start deploy/ecosystem.config.cjs
```

完整的手动部署、宝塔、Redis 和故障排查说明见 [docs/DEPLOY.md](docs/DEPLOY.md) 与 [deploy/DEPLOY-BAOTA.md](deploy/DEPLOY-BAOTA.md)。

### Nginx / WebSocket

必须为 `/socket.io/` 配置 WebSocket 升级，否则房间无法实时同步。可参考 [deploy/nginx.conf.example](deploy/nginx.conf.example)。反向代理正确覆盖 `X-Forwarded-For` / `X-Real-IP` 后，才设置 `TRUST_PROXY=1`。

### 数据与 Redis 边界

- 未配置 Redis 时，服务使用进程内存和本地 JSON；重启会丢失易变的房间状态。
- `OPENMUSIC_DATA_DIR` 可把 JSON 数据目录放到独立磁盘；升级、备份时不要删除该目录。
- Redis 可用于持久化部分房间/收藏/热榜状态，但当前部署仍建议单实例运行；多实例需要共享状态、连接适配器和一致性方案。

## 环境变量参考

完整模板见 [`server/.env.example`](server/.env.example)。下面只列常用公开配置；内部诊断、构建和健康检查变量不在此重复维护。

### 基础与安全

| 变量 | 默认/要求 | 说明 |
|---|---|---|
| `PORT` | `4000` | HTTP 与 WebSocket 端口 |
| `NODE_ENV` | — | 生产环境设为 `production` |
| `CLIENT_URL` | 生产必填 | 允许的前端 Origin，多个值用英文逗号分隔 |
| `CLIENT_ID_SECRET` | 生产必填 | 浏览器会话签名密钥；至少 32 字符，重启后保持不变 |
| `AUTH_JWT_SECRET` | 生产必填 | 平台账号 JWT 密钥；至少 32 字符，必须与上一项不同且保持不变 |
| `AUTH_ACCESS_TTL` / `AUTH_REFRESH_TTL` | 访问令牌 24 小时 / 刷新令牌 30 天 | 单位为毫秒 |
| `TRUST_PROXY` | 关闭 | 仅在可信反代正确覆盖转发头时设为 `1`；未开启时所有客户端共用回环 IP 桶 |
| `HTTP_API_RATE_LIMIT_PER_MIN` | `240` | 单 IP 每分钟 `/api/*` 请求上限；静态资源与健康检查不计入 |
| `MAX_CONCURRENT_SOCKETS_PER_IP` | `50` | 单 IP 进程内 Socket 连接上限 |
| `OPENMUSIC_DATA_DIR` | `server/data` | JSON 数据目录；变量名保留 OpenMusic 兼容前缀 |

### 音乐源

| 变量 | 说明 |
|---|---|
| `METING_API_URL` | Meting-API 地址；网易云/QQ 音乐的播放、歌词、封面和歌单能力依赖上游 |
| `METING_SEARCH_API_URL` | 主 Meting 不支持搜索时使用的备用搜索端点 |
| `METING_API_AUTH` | Meting 鉴权令牌（如上游启用鉴权） |
| `ALLOW_PRIVATE_UPSTREAMS` | 仅为本机自托管 Meting 放行私有地址；不要用于放宽用户可控媒体代理 |
| `MEDIA_PROXY_ALLOWED_HOSTS` | 媒体代理额外允许的 CDN 域名，逗号/空格/分号分隔，支持 `*.example.com`；未知域名默认拒绝 |
| `CYAPI_BASE` / `CYAPI_KEY` | 可选的迟言 API 配置，用于部分酷狗能力和推荐 |
| `VMY_LRC_URL` | 按歌名获取歌词的备用接口 |

### Redis、本地曲库与 AutoDJ

| 变量 | 说明 |
|---|---|
| `REDIS_URL` | Redis 连接串；也可使用 `REDIS_HOST`、`REDIS_PORT`、`REDIS_USERNAME`、`REDIS_PASSWORD`、`REDIS_DB` |
| `MUSIC_LIBRARY_PATHS` | 本地曲库目录，多个目录用分号分隔 |
| `LIBRARY_WATCH_ENABLED` | 设为 `1` 后监听曲库变更并自动刷新索引 |
| `AUTODJ_ENABLED` | 设为 `1` 开启 AutoDJ |
| `AUTODJ_ACTIVE_HOURS` | AutoDJ 活动时段，例如 `9-23` |
| `AUTODJ_AVOID_SAME_SONG` / `AUTODJ_AVOID_SAME_ARTIST` | 歌曲/歌手去重窗口 |
| `AUTODJ_LOW_WATER` | 队列低水位阈值 |

### 可选服务、更新与监控

| 变量 | 说明 |
|---|---|
| `QINIU_ACCESS_KEY` / `QINIU_SECRET_KEY` / `QINIU_BUCKET` / `QINIU_DOMAIN` / `QINIU_ZONE` | 七牛云聊天图片上传 |
| `APIHZ_IMG_ID` / `APIHZ_IMG_KEY` | 接口盒子表情包搜索；不配置则隐藏入口 |
| `UPDATE_REPOSITORY` | 在线更新仓库，默认 `yuchen0x1/JukeboxRoom` |
| `UPDATE_GITHUB_TOKEN` | GitHub 只读令牌；降低更新检查和应用内更新日志同步的匿名限流影响 |
| `METRICS_ENABLED` / `METRICS_TOKEN` | 开启并保护 `/metrics`；只开开关不配令牌时 `/metrics` 返回 404 |
| `MEDIA_HEALTH_FAILURE_THRESHOLD` / `MEDIA_HEALTH_FAILURE_WINDOW_MS` / `MEDIA_HEALTH_COOLDOWN_MS` | 音乐源失败统计与熔断参数 |
| `TASK_AUDIT_RETENTION_DAYS` / `TASK_RUNS_KEEP` | 任务审计保留时间和运行记录上限 |

## 使用指南

### Web 房间

1. 打开首页创建房间，可设置名称和密码。
2. 分享 6 位房间号或房间链接。
3. 搜索歌曲并加入队列；播放、进度、歌词和队列会同步给房间成员。
4. 在聊天室发送文本、表情、回复、@ 或消息回应。
5. 房主在设置中管理公告、点歌限制、成员权限、音质、视觉效果和 FM 模式。
6. TV 大屏访问 `https://你的域名/tv/房间号`。

### Windows 桌面版

- 配置文件：`%APPDATA%\JukeboxRoom\jukeboxroom.env`；升级时兼容旧版 `%APPDATA%\openmusic-desktop` / `%APPDATA%\OpenMusic` 目录。
- 首次启动会生成配置模板和随机安全密钥；搜索/播放仍需要可用的 Meting 或其他音乐源配置。
- 关闭主窗口会最小化到托盘；托盘菜单可恢复窗口或完全退出。
- 构建：`npm run desktop:build`，安装程序输出到 `release/desktop/`。
- 内部包名和 Android applicationId 仍保留 `openmusic` 兼容身份，不代表项目对外品牌已回退。

### Android 独立播放器

Android 版不依赖多人房间服务，支持搜索、播放、歌词、收藏、播放队列、最近播放、本地歌单，以及系统媒体通知、锁屏和耳机控制。音源可用性由对应服务提供方决定。

```bash
npm run cap:run:android
npm run cap:build:apk

# 本地签名 release APK（在 client 下执行）
npm run cap:build:apk:release --prefix client
```

Release 构建前需配置 `client/android/keystore.properties`，或设置 `ANDROID_KEYSTORE_FILE`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。`com.openmusic.app` applicationId 目前保持不变，以便沿用已有安装身份；没有旧签名证书时可能需要先卸载旧版。

### Capacitor / iOS 现状

复制 `client/.env.capacitor.example` 为 `client/.env.capacitor`，填入可访问的 HTTPS 站点：

```env
CAPACITOR_SERVER_URL=https://your-domain.com
```

当前 Android 是独立播放器；iOS 工程仍是现有远程 URL 客户端，不应按 Android 的独立播放器功能对外宣传。

## API 与 WebSocket 入口

以下是常用入口，完整路由请以 [server/index.js](server/index.js) 和 `server/` 下的模块为准：

| 模块 | 代表性入口 |
|---|---|
| 健康检查 | `GET /api/health`、`/api/health/live`、`/api/health/ready` |
| 更新 | `GET /api/update`、`GET /api/update/changelog` |
| 房间 | `GET /api/rooms`、`POST /api/rooms`、`GET /api/rooms/:id` |
| 音乐 | `/api/music/sources`、`/api/music/health`、`/api/music/hot`、`/api/music/toplist/netease` |
| 歌单 | `POST /api/music/playlist/import` |
| 媒体 | `GET /api/media-proxy?url=...` |
| 扩展 API | `/api/auth/...`、`/api/admin/...`、`/api/library/...`、`/api/autodj/...`、`/api/playlists/...`（按角色鉴权） |

HTTP 与 WebSocket 使用同一端口，Socket.IO 路径为 `/socket.io`。常见事件包括：

- 客户端 → 服务端：`join_room`、`add_song`、`toggle_play`、`seek`、`send_chat`、`toggle_chat_reaction`
- 服务端 → 客户端：`room_update`、`playback_state`、`chat_message`

快速验证：

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/music/sources
```

## 开发、测试与构建

| 命令 | 用途 |
|---|---|
| `npm run install:web` | 安装根目录、服务端和客户端依赖 |
| `npm run install:all` | 额外安装桌面端依赖 |
| `npm run dev` | 同时启动服务端（4000）和 Vite（5173） |
| `npm test` | 运行服务端和客户端测试 |
| `npm test --prefix server` | 仅服务端 Node test runner |
| `npm test --prefix client` | 仅客户端 Vitest |
| `npm run build` | TypeScript 检查并构建 `client/dist` |
| `npm run check` | 测试、构建、包体预算检查和生产依赖审计 |
| `npm run check:bundle` | 校验首屏入口不加载 3D 依赖且体积在预算内 |
| `npm run check:health` | 对已启动实例执行健康/更新接口冒烟检查 |
| `npm run desktop:build` | 构建 Windows NSIS 安装包 |

`check:health` 默认检查 `http://127.0.0.1:4000`；可用 `OPENMUSIC_URL` 指定地址，或用 `OPENMUSIC_SKIP_UPDATE=1` 跳过外部更新检查。

## 项目结构

```text
.
├── client/                 # React + Vite + TypeScript；Web、Capacitor Android/iOS
│   ├── src/pages/          # Home / Room / TvDisplay
│   ├── src/components/     # 播放器、聊天、队列和视觉组件
│   ├── src/stores/         # Zustand 状态
│   └── scripts/            # Capacitor 同步与 APK 构建脚本
├── server/                 # Express + Socket.IO 服务端
│   ├── auth/ admin/        # 认证与管理接口
│   ├── library/ autodj/    # 本地曲库与 AutoDJ
│   ├── playlists/ tasks/   # 歌单与任务中心
│   └── *.test.js           # 服务端测试
├── desktop/                # Electron Windows 桌面壳
├── deploy/                 # Meting Compose、PM2、Nginx 和宝塔示例
├── docs/                   # 部署、审计和规划文档
├── scripts/                # 健康检查、打包等脚本
├── Dockerfile              # 主服务多阶段镜像
├── docker-compose.yml      # 主服务 Compose（Redis 可选）
├── CHANGELOG.md            # 版本变更记录
├── RELEASE_CHECKLIST.md    # GitHub 发布检查清单
└── SECURITY.md             # 安全漏洞私下披露流程
```

## 常见问题

**页面能打开，但进不了房间？**  检查 Nginx 是否为 `/socket.io/` 配置 WebSocket 升级，并确认 `CLIENT_URL` 与浏览器访问 Origin 一致。

**搜不到歌或无法播放？**  检查 `METING_API_URL`、备用搜索地址、鉴权令牌和上游服务状态。第三方音乐源可能限流、失效或受地区/账号权限影响。

**服务重启后房间消失？**  未配置 Redis 时，易变房间状态重启丢失是预期行为；同时检查 `OPENMUSIC_DATA_DIR` 是否指向可写并已备份的目录。

**生产环境跨域失败？**  `NODE_ENV=production` 时设置正确的 `CLIENT_URL`，多个 Origin 使用英文逗号分隔，不要带末尾斜杠。

**桌面版提示“本地服务已退出”？**  检查 `%APPDATA%\JukeboxRoom\jukeboxroom.env` 是否有无效配置，以及端口和数据目录是否可用。

**Android / Capacitor 打不开线上页面？**  检查 `CAPACITOR_SERVER_URL` 是否为可访问的 HTTPS 地址，并与服务端允许的 `CLIENT_URL` 对应。

**聊天无法发送图片？**  配置七牛云相关变量；未配置时图片上传入口会被禁用。

## 安全与第三方服务

- 生产环境使用 HTTPS，并为 `CLIENT_ID_SECRET`、`AUTH_JWT_SECRET` 设置稳定、随机、互不相同的值。
- 不要提交 `.env`、Redis 凭据、七牛云密钥、音乐源令牌或其他 API Key。
- 媒体代理仅接受受限的 HTTP/HTTPS 目标；不要把它当作任意内网访问代理。
- 反向代理必须正确传递客户端 IP，否则限流和审计信息可能不准确。
- 当前部署边界是单实例；多实例上线前先设计共享状态和会话一致性。
- Meting、迟言、七牛云及各音乐平台均是第三方服务，请遵守其服务条款、版权和内容使用要求。

安全漏洞请不要通过公开 Issue 提交，请按 [SECURITY.md](SECURITY.md) 的私下披露流程联系维护者。

## 版本、贡献与反馈

本项目统一在 GitHub 的 `main` 分支上持续更新。提交或同步前请确认当前分支为 `main`、远程指向 `https://github.com/yuchen0x1/JukeboxRoom.git`；项目不再向 Gitee 或其他分支推送。

应用内更新日志会优先读取 `GET /api/update/changelog` 的 GitHub Releases 内容；网络不可用或上游失败时，会回退到随包日志并按版本号去重。完整历史见 [CHANGELOG.md](CHANGELOG.md)。

欢迎通过 GitHub [Issue](https://github.com/yuchen0x1/JukeboxRoom/issues) 或 Pull Request 反馈问题和提交改进。提交前至少运行：

```bash
npm test
npm run build
```

涉及 URL、媒体代理、鉴权或第三方接口的改动，请同时检查协议、主机校验、超时、错误处理和回归测试。发布流程见 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=yuchen0x1/JukeboxRoom&type=Date)](https://star-history.com/#yuchen0x1/JukeboxRoom&Date)

如果这个项目对你有帮助，欢迎点一个 Star 支持继续维护。

## License

本项目基于 [MIT License](LICENSE) 开源。

## 交流

- QQ 交流群：`1016190748`
- Telegram：<https://t.me/lenmoC>
