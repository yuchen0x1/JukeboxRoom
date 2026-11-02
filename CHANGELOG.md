# Changelog

## 0.0.7 - 2026-11-03

### 音源账号：登录一次长期有效

- QQ 音乐、网易云、酷狗、汽水的登录凭据从「房间级」升级为「本机长期账号」：扫码登录一次后，刷新页面、重启程序、新建房间均无需重新登录（新增 `server/sourceAccounts.js` 加密持久化，凭据 AES 加密落盘）。
- 房间凭据与本机账号双写并自动回退，汽水令牌刷新后同步更新本机账号；退出账号同时清除房间与本机凭据，且仅允许登录者本人操作。
- 网页版补齐「退出账号」入口；登录成功提示明确凭据已保存在本机。

### 登录与解析修复

- 修复网易云扫码登录 code=8821 风控问题：weapi 会话保持（NMTID + Set-Cookie 合并）、固定 `os=pc` 请求头、轮询重试与状态码精确映射，手机确认后能正确进入已登录态。
- 修复 QQ 音乐扫码 403 与状态码错位：先建立 `ptlogin2` 前置会话再取二维码（`appid=716027609` + `pt_3rd_aid`），扫码状态码对齐官方语义（66 等待扫码 / 67 已扫待确认 / 65 已失效），登录后跟随跳转链补全 `qm_keyst`/`uin`。
- 修复汽水音乐 CDN 按 Referer 拒绝（403）：汽水域名媒体强制走媒体代理并附带 `Referer: https://qishui.douyin.com/`，与登录状态无关的播放失败问题一并解决。

### 播放稳定性

- 语音源失效的歌曲自动跳过：播放失败重试一次后按「Ns 后自动跳过」倒计时切歌（已知坏歌 2 秒、未知 5 秒），连续自动跳过设上限，播放中态自动清零。
- 队列推进防强制跳歌：`finish_song` 仅在接近自然结束时允许推进（提前 ≤10 秒，未知时长至少播 30 秒）。
- 修复文件锁超时未捕获导致的服务端进程崩溃（`task_runs` 锁 10 秒超时兜底 + 全局 `unhandledRejection`/`uncaughtException` 兜底）。

### 网页版修复

- 「加载房间列表失败」误报：成功响应后定向清除历史错误提示。
- 房间状态恢复：重连遇永久错误（房间解散/被踢/被禁言）时清理会话并返回首页，不再停留在幽灵房间。
- 播放器降级链补 `.catch`、卸载清理定时器；歌曲 URL 预加载缓存 key 统一（缓存修复后重新生效）；音质切换保留当前曲目缓存；加入房间 effect 防重复 join。
- 房间密码校验补齐 `isLocked` 字段，上锁房间前置拦截生效。

### 安全加固

- `/api/update/apply` 一键更新加鉴权：网页版需管理员身份；桌面模式仅接受本机同源请求（`sec-fetch-site` 缺失一律拒绝）。
- 桌面账号接口（`/api/desktop/music/accounts`）收紧可信校验，跨站请求 403。
- `shell.openExternal` 增加协议白名单（仅 http/https），阻断 `file:`/`ms-msdt:` 等本机协议注入。
- 汽水搜索接口加房间成员校验；音源凭据内容校验（必须含 `MUSIC_U`/`uin`/`token`）；密钥变更后登录状态与解密结果对齐。

### 桌面版

- preload IPC 通信补异常捕获；登录状态读取与网页版语义统一（解密失败视为未登录）。
- 依赖 `server/sourceAccounts.js` 统一账号链路，桌面与网页登录一次互通。

## 0.0.6 - 2026-11-02

### 仓库迁移至 GitHub

- 源码、Issue 与 Release 统一迁移至 [github.com/yuchen0x1/JukeboxRoom](https://github.com/yuchen0x1/JukeboxRoom)，不再使用 Gitee 作为代码托管与分发渠道。
- 在线更新检查改读 GitHub Releases API（`GET https://api.github.com/repos/yuchen0x1/JukeboxRoom/releases/latest`），匿名请求触发限流时自动回退到 `releases.atom` 订阅源，更新检测不再因限流失败。
- Release 资产直链白名单改为 GitHub 官方域名与资产 CDN（`github.com`、`objects.githubusercontent.com`、`release-assets.githubusercontent.com`），302 下载兜底与前端资产解析同步生效。
- 新增 `UPDATE_GITHUB_TOKEN`（只读令牌，`Bearer` 鉴权）替代 `UPDATE_GITEE_TOKEN`；更新通道固定为 `github`，旧的 Gitee 通道配置不再读取。
- 首页仓库入口、桌面版「软件更新」中的发布页链接与下载兜底文案全部指向 GitHub Release，首页图标同步替换为 GitHub 图标。
- 版本号统一升至 `0.0.6`；`README`、`docs/DEPLOY.md`、`server/.env.example` 等文档的更新源说明同步改为 GitHub。

## 0.0.5 - 2026-11-02

### Windows 桌面版

- 新增独立个人音乐工作区，打开后直接进入发现、搜索、收藏、最近播放、歌单和本地音乐页面。
- 加入全局播放器、歌词与队列侧栏、音源账号登录和配置入口；导航切换期间保留播放状态。
- 提供 Windows NSIS 安装程序，安装器创建桌面和开始菜单快捷方式，并保留用户数据。

### Android

- 新增独立 Android 音乐播放器，无需配置 JukeboxRoom 服务器地址或多人房间服务。
- 支持音乐搜索、在线播放、歌词、收藏、播放队列、最近播放和本地歌单。
- 增加 Android MediaSession、后台播放、系统媒体通知、锁屏和耳机传输控制。

### 网页与服务端

- 改进房间工作区分栏、播放器、聊天消息和音源登录界面。
- 增强音乐音源解析、播放错误恢复和 Android 端媒体兼容性，并补充对应回归测试。

## 0.0.4 - 2026-11-02

### 安全加固与稳定性

- 生产环境强制配置稳定的 `CLIENT_ID_SECRET` 与 `AUTH_JWT_SECRET`；开发环境密钥持久化，避免重启后会话失效。
- 新增 JWT 刷新令牌轮换、注销撤销、账号封禁撤销与重放保护；刷新令牌仅保存哈希值。
- 平台账号和房间密码最低长度提升至 8 位，并增加最大长度限制；认证接口增加专用失败限流。
- JSON 存储增加跨进程读写锁、原子查重写入、刷新令牌原子更新及备份恢复机制，并继续明确单实例部署边界。
- 限流器改为有界滑动窗口，并增加按 IP 的并发 Socket 连接上限与断开释放。
- 补充 SSRF 回归测试，保持私有上游仅对配置的 Meting 主机按需放行，普通媒体与重定向仍严格校验。
- 更新服务端依赖并修复生产依赖审计发现的安全漏洞。

## 0.0.3 - 2026-11-02

### 一键更新 + 每日自动更新

- 更新弹窗新增「一键更新」按钮：服务端自动完成 git 拉取 → 依赖安装 → 前端重建 → 自动重启，约 1-3 分钟
- 每日定时自动检查更新，发现新版本自动完成上述流程（AUTO_UPDATE=0 可关闭）
- 安全边界：凭据/数据目录不受更新影响；pm2/Docker 部署自动重启，裸 node 部署提示手动重启
- 更新弹窗说明文本不再显示 Markdown 符号

## 0.0.2 - 2026-11-02

### 部署体验

- 新增 Dockerfile 与 docker-compose.yml：单容器跑通前后端，房间数据挂载持久化，支持可选 Redis
- 部署文档全面重写（docs/DEPLOY.md）：新增「AI 一键部署提示词」——复制给 AI 编程助手即可自动完成整台服务器部署
- README 新增「🚀 快速部署」章节：AI 提示词 / Docker 一条命令 / Windows 桌面版 三种方式
- 补充新环境变量文档：METING_SEARCH_API_URL、CLIENT_ID_SECRET、UPDATE_GITEE_TOKEN

### 其他

- 首页移除 Android/iOS 下载入口（安装包改从 Release 发布页获取）
- 修复更新检查在 Gitee 匿名接口限流时的失败问题（支持 UPDATE_GITEE_TOKEN 认证请求）

## 0.0.1 - 2026-11-02（首个版本）

### 音源登录（房主专属）

- 新增「音源登录」面板（房主专属，房间顶栏 🔑 入口）：网易云音乐、QQ 音乐、酷狗音乐、汽水音乐四平台。
- 网易云 / 酷狗 / 汽水：扫码登录（官方二维码 + 倒计时自动过期）；QQ 音乐：扫码 + Cookie 两种方式。
- 房主登录后，全房间成员点歌即使用该账号的 VIP / 高品质音源；凭据仅存服务端，永不下发浏览器。

### 搜索与播放

- QQ 音乐、酷狗音乐改走官方网页接口搜索（原版排序更准，带 VIP 标记与封面）。
- 网易云歌单搜索改官方直连；修复 QQ 音乐搜索无结果的回退逻辑。
- 搜索结果排序：房主已登录（可播放）的平台排前，未登录平台排最后。
- 不可播放平台的点歌直接拦截并提示，不再进入播放队列出现「歌曲源异常」。
- 修复酷狗二维码内容缺失 appid 导致 App 扫不上的问题。

### 其他

- 移除账号登录/注册（免登录使用，收藏等走设备身份）。
- 界面品牌更新为 JukeboxRoom；默认强制深色主题。
- 修复 Node.js 20+ 下所有 Meting 上游请求报 Invalid IP address 的问题。
- 修复多个玻璃弹层被样式覆盖导致房间头部变形的问题。
- 新增固定测试房 TEST01（首个加入者自动成为房主，便于联调）。
- 服务器启动时可通过 CLIENT_ID_SECRET 固定会话签名，避免重启后浏览器登录态失效。

## 2.0.2 - 2026-09-05

- Added a home footer version badge with a manual check-for-updates action.
- Showed a footer link to the latest stable Gitee release when a newer version is detected.
- Injected the client version at build time so the badge stays visible while the update API is unavailable.
- Fixed the home header Gitee repository link to point to the actual repository.

## 2.0.1 - 2026-08-29

- Added automatic online update detection from the latest stable Gitee Release.
- Added update notices for the website, PWA and Capacitor remote URL clients.
- Added one-click links for the desktop deployment ZIP, Android APK and iOS IPA when published.
- Updated the PWA cache strategy to activate new static resources promptly.
- Added release asset fallback redirects for the desktop, Android and iOS download routes.

## 2.0.0 - 2026-08-13

OpenMusic 2.0 is the current stable baseline for the codebase, which remains under normal maintenance and ongoing development.

### Release Notes

- Finalized the project version as 2.0.0 across the root package, web client, server, Android, and iOS app metadata.
- Confirmed the main branch is the active integration branch for ongoing updates.
- Added the project status document at docs/PROJECT-2.0-UPGRADE-PLAN.md.
- Synchronized the frontend dependency lockfile after package version and dependency cleanup.
- Kept React on the stable 18.x line for this release to avoid React 19 peer dependency risk in the 3D and virtualized list stack.
- Updated Three.js type declarations to match the runtime Three.js version line.
- Updated the server lockfile to resolve the nanoid security advisory.

### Verification

- Frontend build: passed with npm run build.
- Server tests: passed with 46 node:test checks.
- Security audit: passed with 0 vulnerabilities for root, client, and server production dependencies.
