# Changelog

## Unreleased

### 咪咕短信登录深度修复（v0.0.18 安装包之后）

- 自实现咪咕通行证短信登录，替换 migu-api-enhanced 的 loginPhone/getPacmToken：实测验证码与「发码时的会话」绑定（Cookie + 固定指纹），SDK 两段请求互不关联，导致正确验证码也返回 4005「短信验证码错误或已失效」。发码与登录现在复用同一会话（内存保持 10 分钟）。
- pacmtoken 改为从 token-validate 的响应头/Set-Cookie 提取；SDK 的 ckfetch 只扫描请求自带 Cookie 的同名 key，新登录必然取不到 pacmtoken。
- 登录令牌（STnid…）为一次性凭证，token-validate 严格只调用一次；RSA 加密改用 node:crypto 复刻（JWK + PKCS#1 v1.5 + hex），不再依赖 SDK 内部模块。
- 新增 9 项回归测试覆盖会话保持、真实失败透传、pacmtoken 双通道提取与一次性令牌约束。

## 0.0.18（2026-11-14）

### 代理兼容与音源连接修复

- 桌面版开启规则模式系统代理（Clash 等）时，国内音源域名（网易/QQ/酷狗/咪咕/汽水及其 CDN）在 Electron 会话中强制直连，不再被推进国外代理链；封面、歌词、播放地址解析和音频兜底恢复正常，其余流量（如 GitHub 更新检查）仍走系统代理。
- 内嵌服务端子进程合并 `NO_PROXY` 环境变量，axios 系依赖（咪咕 SDK 等）不会因终端代理变量把国内音源请求送进代理链。
- 修复咪咕短信登录始终提示「未返回有效会话」的问题：会话令牌实际位于通行证响应的 `result.token`，登录成功后现在可正确提取并保存会话。
- 咪咕登录与验证码失败改为透传咪咕通行证的真实原因（如「短信验证码错误或已失效」），并区分网络连接失败；补充响应解析与失败提示的回归测试。

### 队列管理与数据保护

- 新增队列内多关键词搜索、「我的点歌」筛选及批量选择、确认移除。
- 批量移除由服务端整批校验成员权限和歌曲状态，保护当前播放；普通成员仅能移除自己的点歌，房主/管理员可管理全部待播歌曲。
- 删除失败、选择过期和连接超时在队列内显示原因；搜索结果保持原队列顺序和编号。
- 修复共享歌单重排的重复 ID 校验，避免丢失或替换条目，同时保留已有重复 ID 的不同条目。
- 服务端测试默认强制隔离 JSON 数据与 Redis，增加成功/失败清理回归；增加真实双用户浏览器验收脚本。
- 手机队列以紧凑错误图标保留歌名空间，辅助说明继续可读；修正 README 中卸载时数据保留行为的说明。

### Web、Android 与 iOS 维护

- Android 搜索支持加载更多、切换音源后重新搜索和局部失败提示；清空或发起新搜索后不再显示过期结果。
- Android 支持保存自定义 HTTPS Meting 服务地址，并按实际包含 APK 的稳定 Release 检查更新，避免把仅发布 Windows 的版本误报为手机更新。
- Android 增加在线/离线更新日志，修复新旧标题格式解析；网易云歌词回退按歌曲 ID 匹配，避免返回同名歌曲的错误歌词。
- 修复原生播放器的旧歌曲事件覆盖、重复结束通知及切换音质后的状态混用；补充耳机拔出暂停、播放期间唤醒锁和播放器控制器释放。
- Android 返回键优先关闭播放器/歌单弹层、退出子页面，再最小化应用，保留后台播放。
- Web 仅向具备权限且部署受支持的管理员显示服务器更新入口；更新失败明确提示，不再对拒绝或未启动的任务伪造进度，并区分手动重启与自动重启。
- PWA 缓存写入纳入 Service Worker 生命周期；主题存储受限时仍可启动页面。
- iOS 品牌和版本元数据与当前项目对齐；同步强制使用 HTTPS 远程站点和独立占位目录，失败时恢复原配置，保留已有网页构建。
- 新增 Android 构建/lint 与 iOS 模拟器编译工作流；调试产物与正式签名发布分开管理，本轮不移动既有 Tag 或重打旧 Release。

### main 分支维护

- 修复网易云搜索结果封面、歌词地址与相关媒体访问兼容问题。
- 收紧 Windows 安装包、部署 ZIP 和 Docker 构建上下文的文件范围，排除本机凭据、设备身份、数据隔离副本、测试和会话产物。
- 补全历史版本说明、下载与升级边界，并移除过期任务记录和已失效的一次性迁移脚本。

## 0.0.17 - 2026-11-13

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.17) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.17)。日期按北京时间记录。

### Windows 网络代理与音频播放兼容性

- Electron 桌面端保留 Windows 系统代理用于外部网络请求，同时强制绕过 `localhost`、`127.0.0.1` 和 `::1`，避免代理工具拦截内置本机服务。
- 桌面音频优先使用本机媒体代理；代理不可达时保留原始 CDN 地址并交给 Chromium/系统代理重试，减少“解析成功但无法播放”的误判。
- 增加音频加载超时、取消和网络错误状态处理，并补充代理绕过、播放地址回退和版本回归测试。
- 保留 v0.0.16 的透明多尺寸 Windows 图标与发布前图标质量门禁。

## 0.0.16 - 2026-11-13

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.16) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.16)。日期按北京时间记录。

### Windows 图标修复

- 替换为真正透明的 JukeboxRoom 图标源，清理透明像素 RGB 污染，保留原有 Logo 设计。
- 重建包含 16、20、24、32、40、48、64、72、96、128、256 图层的标准 Windows ICO。
- 修复桌面 EXE 的 PE 图标资源，避免 Windows 小尺寸图标丢失 Alpha 后出现黑边或黑色背景。
- 发布前自动检查 PNG Alpha、透明边缘、ICO 图层、app.asar、EXE 和 NSIS 安装器图标。

## 0.0.15 - 2026-11-13

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.15) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.15)。日期按北京时间记录。

### 咪咕音乐（实验性）

- Windows 桌面版设置新增咪咕音乐登录入口，支持用户点击后发送手机号短信验证码并完成登录、退出登录和状态展示。
- 咪咕搜索、歌曲标识、歌词、封面和播放地址解析接入桌面音乐源；播放 ID 使用 `contentId|copyrightId`，登录会话支持更高音质解析。
- `token` 与 `pacmToken` 使用 AES-256-GCM 加密保存在本机；手机号和短信验证码仅在请求处理中使用，不写入磁盘。
- 增加咪咕媒体 CDN 白名单、媒体健康状态和播放失败提示；网易云播放错误会明确提示登录、配置 `METING_API_URL` 或切换音源。
- 咪咕登录使用非官方社区接口，属于试验性功能，可能随上游接口变化而暂时不可用。

### 版本与发布

- 根、客户端、服务端和 Windows 桌面包版本统一为 `0.0.15`；Android `versionCode` 递增到 15。
- 本次 Release 继续只发布 Windows 桌面安装包、自动更新元数据和 SHA-256 清单；Android APK 暂不发布。

## 0.0.14 - 2026-11-12

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.14) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.14)。日期按北京时间记录。

### Windows 桌面版发布修复

- 修复 Windows 打包阶段无法定位 `rcedit.exe` 的问题；优先使用 `electron-winstaller` 随依赖提供的工具，并保留显式路径和 electron-builder 缓存回退。
- 为工具定位增加回归测试，避免 GitHub Actions Windows runner 因 electron-builder 缓存布局差异而中止发布。

### 正式交付

- 本版本正式交付开发期间积累的 Windows 桌面自动更新、首屏性能、卸载数据保护与稳定性修复；细节见本节后续记录。
- Android APK 继续暂缓发布，等待稳定签名配置，避免无法覆盖升级的 debug 签名包。

### 自动更新与发布链路（持续维护，2026-11-12）

- Windows 桌面版接入 `electron-updater`：只从 GitHub Releases 检查稳定版本，默认不自动下载，设置页展示真实下载进度，失败自动重试一次，下载完成后由用户确认退出并安装。
- 新增 GitHub Actions CI 与 Windows tag 发布流程；只接受版本一致的 `vX.Y.Z` 标签，并上传 NSIS 安装包、`latest.yml` 和 `.blockmap`。
- 新增 [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md)，说明 Web、自托管、Windows、Android/iOS 的更新边界、回滚、权限与未签名构建限制。

### 可用性修复

- 修复全站 HTTP 限流误伤静态资源的问题。此前限流中间件挂在 `express.static` 之前，首页、`/assets/*.js`、`/qface/*.apng` 全都计入同一个 IP 桶（默认 60 次/分钟）：进入房间一次就要拉 20+ 个 chunk，正常用户几分钟内会被整站返回 429；反向代理后未开启 `TRUST_PROXY` 时所有用户共用一个桶，会直接演变成整站不可用。
  - 限流范围收窄到 `/api/*`，默认阈值提升到 240 次/分钟，可用 `HTTP_API_RATE_LIMIT_PER_MIN` 调整。
  - `/api/health`、`/api/health/live`、`/api/health/ready` 豁免限流，避免监控探针被误判为实例故障。
  - 新增 5 项回归测试覆盖「静态资源不限流 / API 超限返回 429 / 健康检查豁免」。

### 性能

- 修复首屏被迫加载 900KB Three.js 的分包问题。`manualChunks` 原用 `id.includes('three')` 匹配，把 zustand 依赖的 `use-sync-external-store`、`react-use-measure` 等包名含 "three" 的间接依赖一起并进了 `three-vendor`，形成 `Home → roomStore → react.js → three-vendor` 的静态闭环。
  - 改为按 npm 包边界匹配，并把 `zustand`、`use-sync-external-store`、`react-use-measure`、`suspend-react`、`its-fine` 显式归入 `react-vendor`。
  - 首页静态闭包 gzip 380KB → 153KB（-60%），房间页 440KB → 213KB，TV 页 387KB → 160KB；Three.js 仅在进入 3D 视觉模式时按需加载。
  - 新增 `scripts/check-bundle.mjs` 与 `npm run check:bundle`：断言首屏入口的静态闭包不含 `three-vendor`、各入口体积不超预算，并已接入 `npm run check`。
- 启用响应压缩。此前 `/assets/*` 全部按原始体积传输（Room.js 197KB），现在 gzip 后为 52KB；音频与 APNG 等已压缩内容自动跳过。
- 静态资源缓存分级：`/assets/*` 改为 `max-age=300, must-revalidate`（避免每次导航产生 20+ 次条件请求），`/qface/*` 与 `/icons/*` 改为 7 天缓存，`index.html` 与 `sw.js` 保持 `no-cache`。

### 桌面版数据安全

- 卸载桌面版不再删除用户数据。原先 `deleteAppDataOnUninstall: true` 会在卸载时清空 `userData` 下的房间数据、曲库索引、收藏、歌单与音源配置，且不可恢复；现已改为保留。
- 设置页「本机数据」新增「打开数据目录」与「清空本地数据（带二次确认并重启）」入口，需要清理时不必手动翻目录。

### 安全

- `/metrics` 在设置 `METRICS_ENABLED=1` 但未配置 `METRICS_TOKEN` 时会直接返回 404，不再无鉴权公开运行指标；令牌比较改为恒定时间比较。
- 未捕获异常后 readiness 立即置为不健康（`/api/health/ready` 返回 503），避免负载均衡继续向状态可能已损坏的实例分发流量。
- 媒体代理默认只允许已知音乐 CDN 域名，并对每次重定向重新执行域名白名单、DNS 和私网地址校验；自建音源可通过 `MEDIA_PROXY_ALLOWED_HOSTS` 显式加入。

### 稳定性与安全（本轮）

- **修复媒体代理整包缓冲导致的 OOM 风险**：`safeFetch` 原先把所有响应块拼接成 Buffer，且返回值 `body: null`，使媒体代理的流式分支成为死代码。现在支持 `stream: true` 直接返回上游流；缓冲模式增加 8MB 上限与绝对超时（原 `req.setTimeout` 只检测空闲，慢速滴流可无限占用）。图片缓冲上限 12MB，音频流上限 256MB。
- **修复恶意 Socket.IO payload 可导致实例永久不健康**：`join_room` 等处理器直接解构 payload，客户端发送 `null`/字符串即抛 TypeError；Socket.IO 在 `nextTick` 中派发，异常会升级为 `uncaughtException`，而进程会因此把 `/api/health/ready` 永久置为 503。新增统一 `socketGuard`：payload 归一化、同步异常与异步 rejection 均回失败 ack，并注册 `socket.on('error')`。
- **`/api` 错误边界**：未匹配路径返回 JSON 404，路由异常统一 JSON 500（不回显内部错误），并带 `X-Request-Id`；`/api` 响应默认 `Cache-Control: no-store`。
- **修复空房间泄漏**：`createRoom` 现在为新空房排定销毁计时器；销毁回调在异步清理后重新检查占用，避免把期间重新加入的用户踢进「房间不存在」状态。
- **修复并发切歌吞歌**：同一事件循环内的两次 `skip_song` 会连续切两首；现在用 `expectedQueueId` 去重。踩歌达到阈值时同样只切一次。
- **播放参数类型校验**：`setPlaying` 只接受布尔值（`Boolean("false") === true` 曾导致无法暂停）；`seekTo` 将位置夹到曲目时长内，避免隐式跳歌。
- **内存上限**：内存热榜补 200 条上限；汽水房间上下文在房间销毁时释放；房间跟踪表（昵称/聊天可见时间）改为 500 条 LRU，且只读大屏身份不再写入。
- **`finish_song` 补限流**，与 `skip_song` 对齐。

### 客户端可靠性

- **PWA Service Worker 版本化缓存**：缓存名由构建注入 `<版本>-<assets 内容指纹>`，导航与静态资源改为 network-first，只缓存 2xx 同源响应，跳过 `/api`、`/socket.io`、`/downloads` 与 Range 请求。修复发版后离线用户可能拿到「新 index.html + 旧 chunk」的问题。`check-bundle` 增加对应断言。
- **请求层错误分类**：新增 `ApiError`（http/timeout/network/invalid_response/aborted）、`readJsonResponse`、`fetchJson`；兼容外部 `AbortSignal`，不再把网络错误/HTML 错误页暴露成 `TypeError` 或 `SyntaxError`。
- **首页轮询**：页面隐藏时停止 5 秒轮询，恢复可见时立即刷新一次。
- README 更正「没有管理后台 UI」的过期描述。

### 测试（本轮）

- 服务端 101 → 127 项通过；客户端 22 → 32 项通过。
- 新增：`httpErrors.test.js`、`socketGuard.test.js`、`outboundUrl.stream.test.js`、`songHotRank.test.js`、`roomManager.state.test.js`、`client/src/api/http.test.ts`。

### 其他

- PWA manifest 名称由 `OpenMusic` 更正为 `JukeboxRoom`；Service Worker 缓存改为按构建版本命名。
- npm 生产依赖审计固定使用官方 registry，避免镜像未实现 audit endpoint 造成误报。
- `deploy/nginx.conf.example` 补充 gzip 配置与 `TRUST_PROXY` 对限流影响的说明。

## 0.0.13 - 2026-11-08

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.13) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.13)。日期按北京时间记录。

### 管理后台

- 新增独立管理后台 `/admin`：概览、用户、房间、任务、审计、曲库、AutoDJ 七个页签，覆盖日常运营所需的核心管理能力。
- 新增独立登录页 `/admin/login`，管理员会话使用 access/refresh token 存储；普通账号登录会被明确拒绝进入后台，避免与普通用户登录混淆。
- 首页底栏新增「管理后台」入口。

### 账号与权限

- 支持普通用户自助注册：注册入口位于后台登录页，公开注册永远只创建 `user` 角色，无法借注册提权。
- 首个超级管理员改为通过 `ADMIN_INIT_USERNAME` + `ADMIN_INIT_PASSWORD` 环境变量显式引导创建，不再存在任何固定默认密码；两项必须同时配置，创建成功后可移除。
- 超级管理员可在后台调整用户角色（超级管理员/管理员/主持人/普通用户），并带有完整安全边界：
  - 普通管理员不能修改任何角色；
  - 超级管理员不能降低自己的权限；
  - 不能降级最后一个超级管理员；
  - 角色变更后自动撤销目标用户的 refresh session，权限即时生效。
- 管理员被封禁时同步撤销其 refresh session。

### 房间管理

- 管理员可对任意房间发布全服公告（`adminAnnounceRoom`）。
- 管理员可强制关闭房间并清理持久化数据（种子测试房除外）。

### 问题修复

- 补全普通用户角色徽章 `.role-badge-user` 缺失的样式定义。

## 0.0.12 - 2026-11-06

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.12) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.12)。日期按北京时间记录。

### 热修复

- 修复首页版本徽章仍显示 `V0.0.10 PRO` 的硬编码问题，改为使用构建期注入的实际版本号。
- 同步根目录、服务端、客户端和桌面端 package lock 的版本元数据，避免 `package.json` 与 lockfile 版本不一致。
- 更新服务端 `.env.example` 中过期的 `APP_VERSION` 示例，并将 Android `versionCode` / `versionName` 递增到 12 / 0.0.12。

## 0.0.11 - 2026-11-06

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.11) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.11)。日期按北京时间记录。

### UI 全面升级：赛博科技感重构

- 全局设计语言升级为赛博朋克 / 科幻 HUD 风格：新增霓虹光晕、扫描线流光、全息渐变、发光矩阵底网、终端徽章与 HUD 边角装饰器。
- 首页大厅重塑：房间卡片改为「动态节点」样式（悬浮升维 + 发光边框 + 全息边角），播放中房间带等离子光柱与 4 柱立体声波律动条；大厅顶部改为仪表盘式 HUD（ACTIVE NODES 在线节点计数 + 脉冲状态灯）。
- 房间页重塑：房间号改为等宽终端徽章（ROOM-ID），工作台标签页增加霓虹背光与发光描边，搜索状态栏加入侧边等离子光条。
- 全屏播放页重塑：黑胶唱片新增慢速自转的全息雷达光环与播放态外发光，主播放键升级为青蓝渐变发光控制中枢。
- 桌面端重塑：侧边栏激活项霓虹内发光 + 状态圆点脉冲光晕。

### 新增功能

- **快捷键体系**：`Space` 播放/暂停、`Ctrl/Cmd + ←/→` 上/下一曲、`Ctrl/Cmd + ↑/↓` 音量调节、`/` 或 `Ctrl/Cmd + F` 聚焦搜索框；输入框内自动避让，普通成员无播放权限时友好提示。
- **Web Audio API 五段均衡器**：内置原声无损 / 超重低音 / 清亮人声 / 通透高音 / 沉浸律动五档 EQ 预设，随房间视觉频谱链路自动生效，本地记忆所选预设。
- **跨源智能换源**：新增 `findAlternativeSourceSongs`，按歌名+歌手在其他平台智能匹配同名可播版本，缓解单平台无版权问题。
- **歌单导入解析增强**：网易云移动端短链（163cn.tv）、QQ 音乐多路径格式（taoge / details / tid）均可直接解析导入。
- **播放队列导出**：房间播放队列面板新增「导出」按钮，一键导出 JSON 备份，便于迁移与分享。
- **桌面托盘增强**：托盘菜单动态显示当前播放曲名，并提供「播放 / 暂停」「下一首」快捷控制。

### 问题修复与安全性

- 修复 `roomStore` 在非浏览器上下文（Node 测试环境）加载即抛 `localStorage is not defined` 的问题，改为安全读写并增加异常兜底。
- 修复均衡器在音频链路重复挂载时旧 `BiquadFilterNode` 未断开导致的音频节点泄露风险。
- 歌单导出文件名增加非法字符清洗，避免 Windows 保留字符导致的下载异常。
- 修复 `coverBackdrop` 重复注释；封面色彩提取保持跨域污染兜底，不会导致渲染崩溃。
- 依赖审计：清理客户端开发依赖中的 `glob` / `minimatch` 已知漏洞，生产与开发依赖审计均为 0 漏洞。

## 0.0.10 - 2026-11-04

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.10) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.10)。日期按北京时间记录。

### 应用内更新日志

- 「更新日志」改为动态同步 GitHub Releases 说明：发布新版后应用内自动展示最新条目，不再依赖随包内置的静态日志文件。
- 服务端新增 `GET /api/update/changelog` 接口：读取 GitHub Releases 最近发布说明（最多 15 条），服务端缓存 10 分钟；支持 `UPDATE_GITHUB_TOKEN`（只读令牌）提升请求限额；GitHub 地址沿用既有安全校验（SSRF 防护）。
- 网络不可用或接口异常时自动回退到随包内置的 `changelog.md`，并按版本号去重展示，避免重复或空白。
- 补齐 v0.0.8、v0.0.9 的随包更新日志条目。

## 0.0.9 - 2026-11-04

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.9) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.9)。日期按北京时间记录。

### 桌面版 & Android 版

- 设置页新增「QQ 交流群」入口：点击即可跳转加入【冷漠网络科技交流群①】，点歌、播放或账号问题欢迎进群反馈。
- Android 版设置页新增「关于与交流」区块（QQ 交流群 + GitHub 发布页）。

## 0.0.8 - 2026-11-04

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.8) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.8)。日期按北京时间记录。

### 桌面版：系统托盘

- 点击关闭不再直接退出：主窗口最小化到系统托盘，音乐在后台继续播放。
- 首次关闭时弹气泡提示；托盘图标左键恢复主界面，右键菜单可「显示主界面 / 退出 JukeboxRoom」。
- 应用已在托盘后台运行时再次启动，直接唤起主窗口，不会开新实例。

### 桌面版：音乐搜索体验

- 搜索结果改为分页展示（每页 30 条，支持上一页 / 下一页），解决结果过多导致的界面卡顿。
- 封面加载失败自动显示音符占位图，不再留白。

### 音源账号：登录状态更可靠

- 登录凭据本机加密持久化：重启电脑、覆盖安装新版本均无需重新扫码，直到凭据真正过期。
- 新增网易云登录有效期探测：cookie 过期后自动显示「未登录」，重新扫码绑定即可；网络波动不会误报。
- 卸载应用时同步清理本机数据目录（含账号凭据）。

### 安装包修复

- 修复 v0.0.8 首个安装包内嵌服务依赖缺失导致的「本地服务已退出（code=1）」启动错误。

## 0.0.7 - 2026-11-03

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.7) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.7)。日期按北京时间记录。

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

> [GitHub Release](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.6) · [本版源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.6)。日期按北京时间记录。

### 仓库迁移至 GitHub

- 源码、Issue 与 Release 统一迁移至 [github.com/yuchen0x1/JukeboxRoom](https://github.com/yuchen0x1/JukeboxRoom)，不再使用 Gitee 作为代码托管与分发渠道。
- 在线更新检查改读 GitHub Releases API（`GET https://api.github.com/repos/yuchen0x1/JukeboxRoom/releases/latest`），匿名请求触发限流时自动回退到 `releases.atom` 订阅源，更新检测不再因限流失败。
- Release 资产直链白名单改为 GitHub 官方域名与资产 CDN（`github.com`、`objects.githubusercontent.com`、`release-assets.githubusercontent.com`），302 下载兜底与前端资产解析同步生效。
- 新增 `UPDATE_GITHUB_TOKEN`（只读令牌，`Bearer` 鉴权）替代 `UPDATE_GITEE_TOKEN`；更新通道固定为 `github`，旧的 Gitee 通道配置不再读取。
- 首页仓库入口、桌面版「软件更新」中的发布页链接与下载兜底文案全部指向 GitHub Release，首页图标同步替换为 GitHub 图标。
- 版本号统一升至 `0.0.6`；`README`、`docs/DEPLOY.md`、`server/.env.example` 等文档的更新源说明同步改为 GitHub。

## 0.0.5 - 2026-11-02

> [历史标签源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.5)；当前 GitHub 无对应 Release 安装包记录。

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

> [历史标签源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.4)；当前 GitHub 无对应 Release 安装包记录。

### 安全加固与稳定性

- 生产环境强制配置稳定的 `CLIENT_ID_SECRET` 与 `AUTH_JWT_SECRET`；开发环境密钥持久化，避免重启后会话失效。
- 新增 JWT 刷新令牌轮换、注销撤销、账号封禁撤销与重放保护；刷新令牌仅保存哈希值。
- 平台账号和房间密码最低长度提升至 8 位，并增加最大长度限制；认证接口增加专用失败限流。
- JSON 存储增加跨进程读写锁、原子查重写入、刷新令牌原子更新及备份恢复机制，并继续明确单实例部署边界。
- 限流器改为有界滑动窗口，并增加按 IP 的并发 Socket 连接上限与断开释放。
- 补充 SSRF 回归测试，保持私有上游仅对配置的 Meting 主机按需放行，普通媒体与重定向仍严格校验。
- 更新服务端依赖并修复生产依赖审计发现的安全漏洞。

## 0.0.3 - 2026-11-02

> [历史标签源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.3)；当前 GitHub 无对应 Release 安装包记录。

### 一键更新 + 每日自动更新

- 更新弹窗新增「一键更新」按钮：服务端自动完成 git 拉取 → 依赖安装 → 前端重建 → 自动重启，约 1-3 分钟
- 每日定时自动检查更新，发现新版本自动完成上述流程（AUTO_UPDATE=0 可关闭）
- 安全边界：凭据/数据目录不受更新影响；pm2/Docker 部署自动重启，裸 node 部署提示手动重启
- 更新弹窗说明文本不再显示 Markdown 符号

## 0.0.2 - 2026-11-02

> [历史标签源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.2)；当前 GitHub 无对应 Release 安装包记录。

### 部署体验

- 新增 Dockerfile 与 docker-compose.yml：单容器跑通前后端，房间数据挂载持久化，支持可选 Redis
- 部署文档全面重写（docs/DEPLOY.md）：新增「AI 一键部署提示词」——复制给 AI 编程助手即可自动完成整台服务器部署
- README 新增「🚀 快速部署」章节：AI 提示词 / Docker 一条命令 / Windows 桌面版 三种方式
- 补充新环境变量文档：METING_SEARCH_API_URL、CLIENT_ID_SECRET、UPDATE_GITEE_TOKEN

### 其他

- 首页移除 Android/iOS 下载入口（安装包改从 Release 发布页获取）
- 修复更新检查在 Gitee 匿名接口限流时的失败问题（支持 UPDATE_GITEE_TOKEN 认证请求）

## 0.0.1 - 2026-11-02（首个版本）

> [历史标签源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.1)；当前 GitHub 无对应 Release 安装包记录。

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

> [历史标签源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v2.0.2)；当前 GitHub 无对应 Release 安装包记录。

- Added a home footer version badge with a manual check-for-updates action.
- Showed a footer link to the latest stable Gitee release when a newer version is detected.
- Injected the client version at build time so the badge stays visible while the update API is unavailable.
- Fixed the home header Gitee repository link to point to the actual repository.

## 2.0.1 - 2026-08-29

> 历史 OpenMusic 文档记录；当前 GitHub 无对应独立 Tag 或 Release，不代表当前稳定版本。

- Added automatic online update detection from the latest stable Gitee Release.
- Added update notices for the website, PWA and Capacitor remote URL clients.
- Added one-click links for the desktop deployment ZIP, Android APK and iOS IPA when published.
- Updated the PWA cache strategy to activate new static resources promptly.
- Added release asset fallback redirects for the desktop, Android and iOS download routes.

## 2.0.0 - 2026-08-13

> 历史 OpenMusic 文档记录；当前 GitHub 无对应独立 Tag 或 Release，不代表当前稳定版本。

OpenMusic 2.0 was the historical baseline at this stage; the current JukeboxRoom version is recorded at the top of this file.

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
