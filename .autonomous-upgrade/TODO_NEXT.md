# TODO_NEXT

## 已完成（本轮）

- [x] P1：PWA Service Worker 版本化缓存 + 导航 network-first + 跳过 API/下载/Range
- [x] P1：`/api` JSON 404 + 统一错误边界 + `no-store`
- [x] P1：客户端 `ApiError` / `readJsonResponse` / `fetchJson`，兼容外部 AbortSignal
- [x] P2：首页轮询在页面隐藏时暂停
- [x] P0：媒体代理流式化 + 大小上限 + 绝对超时
- [x] P0：socketGuard 统一 payload 归一化与异常接管
- [x] P1：空房销毁计时器 + 销毁竞态复检
- [x] P1：并发切歌 / 踩歌去重
- [x] P2：内存热榜上限、汽水上下文释放、跟踪表 LRU、播放参数校验、finish_song 限流
- [x] 文档：CHANGELOG / README / 四份交付报告

## 下一轮优先级

1. Playwright 浏览器 E2E（最大验证缺口）
2. ~~媒体代理域名白名单~~（2026-11-12 已完成：默认已知 CDN + `MEDIA_PROXY_ALLOWED_HOSTS`）
3. Redis 多实例一致性回归
4. `Room.tsx` 拆分（先补行为测试）
5. 生产依赖审计 + Android/Windows 打包回归
6. 前端错误上报（带 requestId）
7. 可访问性复查
8. 移除无读取方的 `knownUserIds` 快照字段

详情见 `NEXT_UPGRADE_PLAN.md`。
