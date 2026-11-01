# Changelog

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
