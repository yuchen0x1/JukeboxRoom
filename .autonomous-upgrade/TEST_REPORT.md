# TEST_REPORT

日期：2026-11-12
环境：Windows 10.0.26340 / Node.js v24.20.0 / npm（Git Bash）

## 1. 已执行并通过

| # | 检查 | 命令 | 结果 |
|---|---|---|---|
| 1 | 服务端单元/集成测试 | `npm test --prefix server` | **130 passed / 0 failed**（约 57s） |
| 2 | 客户端单元测试 | `npm test --prefix client` | **32 passed / 0 failed**（7 files） |
| 3 | TypeScript + 生产构建 | `npm run build --prefix client` | 成功，`✓ built in 2.31s` |
| 4 | 包体预算与 SW 版本断言 | `npm run check:bundle` | 通过 |
| 5 | 语法检查 | `node --check`（index/roomManager/outboundUrl/mediaProxy/sourceResolvers/socketGuard/songHotRank） | 全部通过 |
| 6 | 空白/冲突检查 | `git diff --check` | 通过 |
| 7 | 服务端启动冒烟 | `PORT=45921 OPENMUSIC_DATA_DIR=<temp> node server/index.js` | 启动成功，`/api/health/ready` 200 |
| 8 | API JSON 404 | `GET /api/nope` | 404 `{"ok":false,"error":"not_found",...}` |
| 9 | API no-store | `GET /api/rooms` | `Cache-Control: no-store` |
| 10 | SW 注入 | `GET /sw.js` | `CACHE` 含 `0.0.14-3a515f926e94` |
| 11 | Socket 畸形 payload | 真实 `socket.io-client` 发送 `join_room`（无 payload / null / 字符串） | 3 个失败 ack；实例 readiness 仍 200；日志无 uncaughtException |
| 12 | 媒体代理域名白名单 | `GET /api/media-proxy?url=https://example.com/song.mp3` | HTTP 403，返回“媒体域名不在允许列表中” |
| 13 | 生产依赖审计 | `npm audit`（官方 npm registry，根/server/client） | 三处均 0 vulnerabilities |

## 2. 新增测试明细

### 服务端（+26 项；101 → 127）

- `server/httpErrors.test.js`（6）
  - `/api` 未匹配 → JSON 404
  - 成功响应 `no-store`
  - 500 不回显内部错误、记录 error 日志
  - `expose` 的 4xx 透出 message 并记录 warn
  - 未 `expose` 的 4xx 用通用文案
  - 非 API 异常返回纯文本
- `server/socketGuard.test.js`（7）
  - 非对象 payload 归一化
  - 同步异常 → 失败 ack、不冒泡
  - 异步 rejection → 失败 ack、不悬挂
  - 正常 ack / 返回值不受影响
  - `disconnect` 保持原签名
  - `socket.on('error')` 被记录
  - 自定义 socket 替身不崩
- `server/outboundUrl.stream.test.js`（4）
  - `stream: true` 返回可读流
  - `maxBytes` 超限中止
  - 缓冲模式正常 JSON
  - 流式响应误用 `text()/json()` 明确报错
- `server/songHotRank.test.js`（3）
  - 200 条上限且保留高热度
  - 重复点歌累加不新增
  - 缺 id/名称不入榜
- `server/roomManager.state.test.js`（6）
  - 并发 skip 只前进一首
  - `setPlaying` 拒绝非布尔
  - seek 夹取到末尾
  - 踩歌并发只切一次
  - 新空房排定销毁计时器
  - 加入后取消销毁计时器

### 客户端（+10 项；22 → 32）

- `client/src/api/http.test.ts`（10）
  - `ApiError` 可重试判定与中文文案
  - 超时 → `kind: 'timeout'`
  - 网络错误 → `kind: 'network'`
  - 外部 signal 取消 → `kind: 'aborted'`（不误报超时）
  - 错误体 message / requestId / retry-after
  - HTML 错误页不崩溃
  - 2xx 非 JSON → `invalid_response`
  - `fetchJson` 正常解析

## 3. 未执行 / 未验证

| 项 | 原因 | 风险 |
|---|---|---|
| 浏览器 E2E（Playwright） | 本机无可用 Chromium 会话 | 核心用户流程缺少端到端证据 |
| 真实外部音乐源播放 | 依赖第三方上游可用性 | 音源解析未在真实网络下复测 |
| Redis 多实例一致性 | 无 Redis 实例 | 修复仅覆盖单实例内存语义 |
| Android release APK | 未签名、未跑 Gradle | 移动端未验证 |
| Windows 安装包 | 未执行 electron-builder | 桌面端未验证 |
| ~~`npm run audit:prod`~~ | 2026-11-12 已按官方 npm registry 分别执行根/server/client 审计 | 三处均 0 vulnerabilities |

## 4. 测试中发现的真实缺陷（已修复）

1. 客户端错误体解析会把机器码 `rate_limited` 当作用户文案展示 —— 修正为只展示 `message`。
2. `safeFetch` 测试最初无法连本地服务 —— 原因是 DNS pinning 设计（安全特性），测试改用 `requestFactory` 绕过连接固定，而非削弱生产逻辑。
3. 新增 `readOnly` 变量时引入重复声明 —— `node --check` 立即发现并修正。

## 5. 结论

核心修复均有自动化回归覆盖，运行态验证确认两个 P0 缺陷不再可复现。**不能**把未执行的浏览器 E2E、Redis 多实例、移动端/桌面打包视为已验证。
