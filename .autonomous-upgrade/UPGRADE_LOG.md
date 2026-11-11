# UPGRADE_LOG

## 第 0 轮：基线（12:11–12:25）

- 阅读项目结构、包清单、现有审计报告、CHANGELOG、v0.0.14 未提交 diff。
- 运行基线：
  - `npm test --prefix server` → 101 pass
  - `npm test --prefix client` → 22 pass
  - `npm run build --prefix client` → 成功
- 建立持久化状态文件。
- 发现：PWA SW 缓存策略会把旧 bundle 长期返回；API 404/500 返回 HTML；API 响应缺少 no-store。

## 第 1 轮：PWA 缓存与 HTTP 错误边界（12:26–12:40）

### 修复

1. **PWA Service Worker 会长期返回旧前端 bundle（P1）**
   - `client/public/sw.js` 原策略：固定缓存名 `jukeboxroom-shell-v4` + 对所有同源 GET 做 stale-while-revalidate。
   - 构建产物使用稳定文件名（`assets/[name].js`），发版后旧缓存会与新 `index.html` 混用，弱网/离线用户可能白屏。
   - 新策略：版本化缓存名（构建时注入 `<version>-<assets 内容哈希>`）、导航 network-first、只缓存 2xx 同源响应、跳过 `/api`、`/socket.io`、`/downloads`、Range 请求、运行时缓存上限 120 条 / 单文件 4MB。
   - `client/vite.config.ts` 新增 `swCacheVersionPlugin`，构建后替换 `__SW_VERSION__`。
   - `scripts/check-bundle.mjs` 增加断言：dist/sw.js 不得残留占位符，必须使用版本化缓存名。

2. **`/api` 未匹配路径与异常返回 HTML（P1）**
   - 新增 `server/httpErrors.js`：`apiNoStore`、`apiNotFoundHandler`、`createErrorHandler`。
   - `/api` 下未匹配路径返回 JSON 404；路由异常统一 JSON 500，5xx 不回显内部错误，同时带 `requestId`。
   - `server/index.js` 接入：`/api` 默认 `Cache-Control: no-store`；SPA 兜底之后挂 404 与错误处理器。

3. **客户端请求层错误不可区分（P1）**
   - `client/src/api/http.ts` 重写：`ApiError`（http/timeout/network/invalid_response/aborted）、`readJsonResponse`、`fetchJson`。
   - 兼容外部 `AbortSignal`；网络失败/超时不再抛裸 `TypeError`；非 JSON 响应不再抛 `SyntaxError`。
   - 首页创建/加入房间失败时展示 `ApiError.userMessage`。

4. **首页轮询在后台标签页持续请求（P2）**
   - `Home.tsx` 改为 `visibilitychange` 驱动：隐藏时停止 5 秒轮询，恢复可见时立即补一次再继续。

### 测试

- 新增 `server/httpErrors.test.js`：6 项（JSON 404、no-store、500 不泄漏、expose 4xx、未 expose 4xx、非 API 文本错误）。
- 新增 `client/src/api/http.test.ts`：10 项（错误分类、超时、网络错误、外部取消、错误体解析、HTML 错误页、非 JSON 2xx、fetchJson）。
- server：107 pass；client：32 pass；`npm run build` 成功；`npm run check:bundle` 通过。
- 运行态冒烟：`/api/health` 200、`/api/rooms` 200、`/api/nope` 返回 JSON 404 + requestId、`/sw.js` 含注入版本、`/` 为 no-cache。

## 第 2 轮：服务端缺陷修复（审计驱动）

来源：一次只读代码审计（逐行核对后确认）。按 P0 → P2 修复。

### P0

1. **媒体代理整包缓冲导致 OOM**
   - `server/outboundUrl.js` 的 `safeFetch` 把所有 chunk 推进数组再 `Buffer.concat`，且返回对象 `body: null`，使 `mediaProxy` 的流式分支成为死代码。任何一个大文件（含攻击者可控 URL）都会把整份内容读入内存。
   - 修复：新增 `stream: true` 模式，直接返回上游 `IncomingMessage`；缓冲模式新增 `maxBytes`（默认 8MB）与绝对超时（原来的 `req.setTimeout` 只检测空闲，慢速滴流可无限占用）。
   - `server/mediaProxy.js` 改为流式转发，增加图片 12MB / 音频流 256MB 上限，用 `Transform` 计数而不是额外 `data` 监听（后者会提前切 flowing 模式丢数据）。

2. **恶意 socket payload 可永久摘除实例**
   - Socket.IO 在 `process.nextTick` 中派发事件，监听器内抛出的异常会变成 `uncaughtException`。`join_room` 直接解构 payload，客户端发 `null`/字符串即抛 TypeError；本进程的 `uncaughtException` 处理会把 readiness 永久置为 503。
   - 修复：新增 `server/socketGuard.js`，在 `io.on('connection')` 统一包裹全部监听器：payload 归一化为对象、同步异常与异步 rejection 都捕获并回失败 ack、注册 `socket.on('error')`。

### P1

3. **幽灵房间**：`createRoom` 从不排定销毁，未加入的空房永久驻留内存/Redis，而自动播放检查每 500ms 遍历所有房间。
4. **销毁竞态**：`scheduleRoomDestroy` 在 `await deleteRoomChatImages()` 后无条件删除，期间重新加入的用户会让房间消失。
5. **切歌重复消费**：同一事件循环内两次 `skip_song` 都通过所有权检查，锁只串行不幂等，会连续切掉两首。改为用 `expectedQueueId` 去重；`toggleCurrentDislike` 同理。

### P2

6. **内存热榜无上限**：Redis 分支有 `trimHotRank`，内存分支没有，任意成员持续点新歌即可无界增长。补 200 条上限（按 count / 最后点歌时间淘汰）。
7. **汽水房间上下文泄漏**：`qishuiRooms` 只增不减。新增 `releaseQishuiRoom` + `setOnRoomDestroyed` 钩子（避免 roomManager ⇄ sourceResolvers 循环依赖）。
8. **播放参数类型校验**：`setPlaying` 会把字符串 `"false"` 存成 truthy（注意 `Boolean("false") === true`），改为只接受布尔值；`seekTo` 不再接受超出时长的位置（否则下一次自动检查会隐式跳歌）。
9. **只读观众跟踪表膨胀**：TV 大屏每次连接都是新随机身份，`userNicknames` / `chatVisibleSinceByUserId` 从不清理。改为 500 条 LRU 上限，且只读身份不写入。
10. **`finish_song` 缺少限流**：与 `skip_song` 对齐。

### 测试

- 新增 `server/socketGuard.test.js`：7 项（非对象 payload、同步异常、异步 rejection、正常 ack、disconnect 签名、socket error、自定义替身）。
- 新增 `server/outboundUrl.stream.test.js`：4 项（流式返回、maxBytes 中止、缓冲 JSON、流式误用 text/json）。
- 新增 `server/songHotRank.test.js`：3 项（200 条上限、累加计数、非法输入）。
- 新增 `server/roomManager.state.test.js`：6 项（并发切歌去重、setPlaying 类型、seek 夹取、踩歌并发去重、幽灵房间计时器、加入取消销毁）。
- **server：127 pass / 0 fail**；client：32 pass。
- 运行态验证：真实 Socket.IO 客户端发送 `join_room`（无 payload / null / 字符串）后，实例 `/api/health/ready` 仍为 200，日志无 uncaughtException；`/api/nope` 返回 JSON 404。
