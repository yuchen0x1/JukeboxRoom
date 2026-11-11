# JukeboxRoom 项目分析（自主升级会话）

分析时间：2026-11-10 12:20 (+08:00)
分析依据：仓库代码、`PROJECT_AUDIT_REPORT.md`、`CHANGELOG.md`、`README.md`、实际测试输出。

## 1. 项目定位

JukeboxRoom 是自托管的多人实时在线点歌系统：房间大厅、共享队列、Socket.IO 同步播放、歌词、聊天、房主管理、多音源搜索/解析、TV 大屏、本地曲库、AutoDJ、管理后台。项目基于 OpenMusic 二次开发，MIT 许可证。

## 2. 技术栈（以代码为准）

| 层 | 技术 |
|---|---|
| 服务端 | Node.js ≥20、Express 5、Socket.IO 4、可选 Redis adapter、JSON 文件存储（带锁/备份） |
| Web 客户端 | React 19、TypeScript、Vite 8、Zustand、React Router 7、Three.js（懒加载）、Tailwind 3 + 手写 CSS |
| 移动端 | Capacitor 7（Android 独立播放器模式 / iOS WebView） |
| 桌面端 | Electron 42 + electron-builder，内嵌 Node 服务端 |
| 测试 | Node `node:test`（服务端）、Vitest（客户端 6 个文件）、`tsc -b`、Vite build、bundle 预算脚本 |

## 3. 目录与核心模块

- `server/index.js`（3165 行）：HTTP 路由、Socket.IO 事件、媒体代理、搜索/解析、房间广播。
- `server/roomManager.js`（3245 行）：房间领域状态机、队列、权限、聊天、持久化快照。
- `server/sourceResolvers.js`（1057 行）：网易云/QQ/酷狗/汽水搜索与播放地址解析、扫码登录。
- `server/auth/`：scrypt 密码、HMAC JWT、可轮换 refresh session、角色。
- `server/admin/`、`server/tasks/`、`server/library/`、`server/autodj/`、`server/playlists/`：管理、任务中心、曲库、自动 DJ、歌单。
- `server/db/store.js`：JSON 集合存储，跨进程文件锁、原子替换、`.bak` 恢复。
- `server/security/`、`outboundUrl.js`、`mediaProxy.js`、`rateLimiter.js`、`httpRateLimit.js`：安全边界。
- `client/src/pages/`：`Home`、`Room`（3219 行）、`TvDisplay`、`Admin`、`AdminLogin`。
- `client/src/components/`：聊天、队列、设置、视觉特效、桌面/Android 播放器。
- `client/src/lib/`：播放同步、歌词、音源、PWA、SEO、调试等约 90 个模块。
- `scripts/`：bundle 预算、打包、健康检查、图标/着色器生成。

## 4. 验证基线（本次会话开始时）

- `npm test --prefix server`：101 通过 / 0 失败（7.6s）。
- `npm test --prefix client`：22 通过 / 0 失败（6 个文件）。
- `npm run build --prefix client`：成功；`three-vendor.js` 893KB（gzip 236KB），`Room.js` 197KB。
- 工作区已有未提交的 v0.0.14 改动（API 限流收窄、gzip、缓存分级、分包、自更新安全、桌面数据保留）。

## 5. 已识别的改进方向（按优先级）

### P0/P1

1. **PWA Service Worker 缓存策略缺陷**：`client/public/sw.js` 对所有同源 GET 做 cache-first 回填，且 `CACHE` 版本固定为 `v4`；构建产物使用稳定文件名（`assets/[name].js`），发版后旧 SW 会把旧 bundle 永久返回给用户，同时无差别缓存下载文件与图片。需要改为按构建版本命名缓存 + 网络优先/仅缓存安全响应。
2. **API 错误响应格式不统一**：Express 默认 404/500 返回 HTML，前端 `res.json()` 解析失败后只能显示泛化错误；缺少 `X-Request-Id` 关联。需要 `/api` JSON 404 + 统一错误处理。
3. **API 响应未显式禁止缓存**：带认证/房间状态的 GET 可能被浏览器或中间层缓存。需要 `Cache-Control: no-store` 边界。

### P2

4. 首页房间列表 5 秒轮询在页面隐藏时仍持续请求（移动端耗电/流量）。
5. `Room.tsx` 体量过大（3219 行），但拆分风险高，优先做行为测试与局部提取。
6. 管理后台信息架构与错误反馈可继续打磨。
7. 客户端仅 6 个测试文件，覆盖集中在纯函数；需要补充 SW 策略、请求层、播放同步边界测试。

### P3

8. 播放器可访问性与键盘操作（已有部分快捷键）。
9. 房间列表空状态/错误状态之外的加载骨架一致性。
10. 移动端安全区与横屏适配检查。

## 6. 约束

- 不破坏现有未提交改动；在其之上增量修改。
- 不执行 `git commit/push`（除非用户明确要求）。
- 所有结论以实际运行结果为准，未验证项必须标注。
