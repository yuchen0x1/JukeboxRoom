# JukeboxRoom 自主升级 · 最终报告

日期：2026-11-10
会话窗口：12:11 – 18:40（+08:00）
分支：`main`（本轮已提交并推送 GitHub，未发布 Release）
基线版本：0.0.14

## 1. 项目原始情况

JukeboxRoom 是自托管的多人实时在线点歌系统：房间大厅、共享队列、Socket.IO 同步播放、歌词、聊天、房主管理、多音源搜索/解析、TV 大屏、本地曲库、AutoDJ、管理后台；包含 Web、Electron 桌面版、Capacitor Android/iOS 三端。

技术栈：Node.js ≥20 + Express 5 + Socket.IO 4 + JSON 文件存储（可选 Redis）；React 19 + TypeScript + Vite 8 + Zustand + Three.js；Electron 42。

**开始时会话的基线**：
- 服务端 101 项测试通过，客户端 22 项通过，生产构建成功。
- 工作区已有未提交的 v0.0.14 改动（API 限流收窄、gzip、缓存分级、分包、自更新安全、桌面数据保留）。
- 代码规模：`server/index.js` 3165 行、`server/roomManager.js` 3245 行、`client/src/pages/Room.tsx` 3219 行。

## 2. 本次实际修改

### 2.1 P0：可导致实例不可用或内存耗尽

| 问题 | 修复 | 文件 |
|---|---|---|
| 媒体代理把整个上游响应缓冲进内存（`body: null` 使流式分支成为死代码）；任何大文件 URL 都能打爆内存 | `safeFetch` 新增 `stream: true` 直接返回上游流；缓冲模式增加 8MB `maxBytes` 与绝对超时；媒体代理图片 12MB / 音频流 256MB 上限，使用 `Transform` 计数 | `server/outboundUrl.js`、`server/mediaProxy.js` |
| 畸形 Socket.IO payload（`null`/字符串）在解构时抛异常 → `uncaughtException` → readiness 永久 503 | 新增 `socketGuard`：payload 归一化、同步异常与异步 rejection 捕获并回失败 ack、注册 `socket.on('error')`；在 `io.on('connection')` 统一安装 | `server/socketGuard.js`、`server/index.js` |

### 2.2 P1：状态机与生命周期

| 问题 | 修复 |
|---|---|
| `createRoom` 不排定销毁，未加入的空房永久驻留内存/Redis（自动播放每 500ms 遍历所有房间） | 创建时 `scheduleRoomDestroy`；加入时 `cancelRoomDestroy` |
| 销毁回调在 `await deleteRoomChatImages()` 后无条件删除，期间重新加入的用户会遭遇房间消失 | `finally` 中重新检查占用 |
| 同一事件循环内两次 `skip_song` 连续切两首（锁只串行不幂等） | 用 `expectedQueueId` 去重；踩歌阈值切歌同样去重 |
| `/api` 未匹配路径与异常返回 HTML，客户端 `res.json()` 解析失败 | 新增 JSON 404 + 统一错误边界（带 `X-Request-Id`，5xx 不回显内部信息），`/api` 默认 `no-store` |
| 客户端请求层无法区分超时/断网/服务端错误 | `ApiError` 分类 + `readJsonResponse` / `fetchJson`；兼容外部 `AbortSignal` |
| PWA SW 固定缓存名 + 稳定文件名，发版后弱网可能新旧 bundle 混用 | 构建注入版本化缓存名；network-first；只缓存 2xx 同源响应；跳过 API/Socket/下载/Range |

### 2.3 P2：资源上限与输入校验

- 内存热榜补 200 条上限（Redis 分支原本已有）。
- 汽水房间上下文在房间销毁时释放（新增 `setOnRoomDestroyed` 钩子，避免循环依赖）。
- 房间跟踪表（`userNicknames` / `chatVisibleSinceByUserId`）改为 500 条 LRU；只读大屏身份不再写入。
- `setPlaying` 只接受布尔值（`Boolean("false") === true` 曾导致无法暂停）。
- `seekTo` 夹取到曲目时长，避免越界触发隐式跳歌。
- `finish_song` 补限流，与 `skip_song` 对齐。

### 2.4 客户端体验

- 首页轮询在页面隐藏时暂停，恢复可见时立即刷新。
- 创建/加入房间失败时展示 `ApiError.userMessage`，而不是笼统文案。
- README 更正「没有管理后台 UI」的过期描述。

## 3. 测试与验证结果

| 检查项 | 结果 |
|---|---|
| 服务端 `npm test --prefix server` | **130 通过 / 0 失败**（本轮新增媒体代理策略测试） |
| 客户端 `npm test --prefix client` | **32 通过 / 0 失败**（基线 22） |
| `npm run build --prefix client` | 成功（TypeScript + Vite） |
| `npm run check:bundle` | 通过（首屏不含 three-vendor，体积在预算内，SW 版本化） |
| `git diff --check` | 通过 |
| 运行态冒烟 | `/api/health/ready` 200；`/api/nope` 返回 JSON 404；`/sw.js` 含注入版本；**真实 Socket.IO 客户端发送无 payload / null / 字符串后 readiness 仍 200**，日志无 uncaughtException |

详见 `TEST_REPORT.md`。

## 4. 参考的开源项目

本会话**未新增网络抓取**。以下为项目既有审计（`PROJECT_AUDIT_REPORT.md`，2026-11-09）中已核实并记录的项目，本次仅作为设计对照，未复制任何代码：

| 项目 | 许可证 | 借鉴点 | 是否落地 |
|---|---|---|---|
| Syncplay | Apache-2.0 | 重新加入时的状态恢复、同步协议边界 | 未新增（现状已覆盖重连） |
| CrowdRoom | AGPL-3.0 | 音源 adapter 边界、投票跳歌 | 未复制（许可不兼容） |
| Melodee | MIT | 曲库入库流水线、后台任务 | 未新增 |
| CrownJukebox | MIT | TV kiosk 信息层级、封面缓存 | 未新增 |

**本轮改进主要来自代码审计与真实故障路径，而不是功能堆叠**。没有引入新依赖。

## 5. 已知问题与未完成项

1. **未进行真实浏览器 E2E**：本机无可用浏览器自动化环境，核心流程（创建房间、点歌、聊天、同步播放）仍缺端到端证据。
2. **未验证 Redis 多实例**：所有修复均为单实例内存语义；Redis 模式下的一致性未回归。
3. **Android 安装包与 Windows 安装包未重新构建**：`npm run check` 中的打包流程未执行。
4. **`Room.tsx`（3219 行）未拆分**：属于高风险重构，本轮未做。
5. **媒体代理域名白名单已完成**：默认仅允许已知音乐 CDN，可通过 `MEDIA_PROXY_ALLOWED_HOSTS` 显式加入自建 CDN；仍需用真实四平台播放链路做上游回归。
6. **服务端 `knownUserIds` 仍会序列化**：已限制 500 条且跳过只读身份，但该字段目前无读取方，可后续移除。

## 6. 变更文件清单

新增：
- `server/httpErrors.js` / `server/httpErrors.test.js`
- `server/socketGuard.js` / `server/socketGuard.test.js`
- `server/outboundUrl.stream.test.js`
- `server/songHotRank.test.js`
- `server/roomManager.state.test.js`
- `client/src/api/http.test.ts`
- `.autonomous-upgrade/*`

修改：
- `server/outboundUrl.js`、`server/mediaProxy.js`、`server/index.js`
- `server/roomManager.js`、`server/songHotRank.js`、`server/sourceResolvers.js`
- `client/public/sw.js`、`client/vite.config.ts`
- `client/src/api/http.ts`、`client/src/pages/Home.tsx`
- `scripts/check-bundle.mjs`
- `README.md`、`CHANGELOG.md`

未删除任何文件或数据。

## 7. 质量评估（本轮）

| 维度 | 变化 | 依据 |
|---|---|---|
| 稳定性 | 明显提升 | 消除两个 P0（OOM、实例永久不健康）；修复房间生命周期竞态 |
| 安全性 | 提升 | 输入归一化、错误不泄漏、媒体流上限、`/api` 禁缓存 |
| 可观测性 | 提升 | 所有 API 错误带 `requestId`；socket 异常结构化记录 |
| 客户端可靠性 | 提升 | 错误分类、超时/取消语义、PWA 缓存正确性、后台轮询暂停 |
| 可维护性 | 小幅提升 | 新模块均有中文边界注释与回归测试；巨型页面未拆分 |
| 功能完整度 | 未变 | 本轮以修复为主，未新增业务功能 |

## 8. Git 与远程状态

- 已执行 `git commit` 和 `git push origin main`，提交为 `91c71bf`。
- 未打 Tag 或发布 Release；GitHub 推送后提示 1 个 moderate Dependabot alert，本地官方 npm audit 仍为 0 vulnerabilities，待定位差异。
- 推送目标按仓库规则仅允许 GitHub：`https://github.com/yuchen0x1/JukeboxRoom.git`。
