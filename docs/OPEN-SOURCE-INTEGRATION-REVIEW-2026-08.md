# 开源能力调研与整合记录

更新时间：2026-08-30

## 结论

本次没有直接复制其他仓库代码，也没有把国外仓库作为发布目标。采用“协议/架构借鉴 + 小范围独立实现 + 本地测试”的方式，避免许可证污染、运行时不兼容和把不适合多人房间的单机逻辑硬塞进项目。

## 已调研项目

| 项目 | 适合借鉴的能力 | 许可证/边界 | OpenMusic 处理 |
| --- | --- | --- | --- |
| [Syncplay](https://github.com/Syncplay/syncplay) | 房间内播放状态、暂停、seek 和聊天同步 | Apache-2.0；不复制实现 | 已有 Socket.IO 房间同步继续独立维护，后续吸收事件版本和漂移校正经验 |
| [Web-SyncPlay](https://github.com/Web-SyncPlay/Web-SyncPlay) | Web 房间、角色控制、Valkey 状态和嵌入式播放器 | MIT；技术路线与现有 React/实时房间相近 | 作为实时协议和多视图设计参考，不引入 Bun/Next.js 运行时 |
| [Music Assistant](https://www.music-assistant.io/) | Provider/Plugin 分层、播放器抽象、音乐库和 API | 以官方仓库和各 provider 的具体许可为准 | 采用 provider 边界思路，后续再拆音乐源插件 |
| [Lark Music](https://github.com/ca-x/lark) | 大型本地库、标签修复、歌词/封面、PWA/共享链接 | AGPL-3.0；不复制代码或 UI | 已整合“本地库优先、元数据丰富、缺失文件可检测”的产品思路 |
| [Navidrome](https://github.com/navidrome/navidrome) | 本地曲库、Subsonic/OpenSubsonic 兼容、收藏/歌单和流媒体语义 | Apache-2.0；不复制内部实现 | 作为本地库、Range/ETag 和未来兼容 API 的设计参考 |
| [OpenSubsonic](https://github.com/opensubsonic/open-subsonic-api) | 跨客户端的音乐库 REST 协议 | Apache-2.0 文档项目；实现需遵循协议与兼容要求 | 规划为 P2 只读本地库兼容层，不映射多人房间实时控制 |
| [Meting](https://github.com/metowolf/Meting) | 多平台音乐源统一 API 抽象 | 以其仓库当前许可和上游平台条款为准 | 现有 Meting 适配继续使用，不直接嵌入其源代码 |
| [BBBUG](https://gitee.com/bbbug_com) | 国内多房间点歌、聊天室、Windows/小程序/UniApp 多端形态 | 需逐仓库核对许可证和版权声明 | 仅作国内产品形态对照，不复制代码、素材或接口凭据 |

## 已实施整合

### 本地曲库增强

- 使用 `music-metadata` 读取 MP3、MP4、FLAC、Ogg、WAV 等常见音频格式的标签；读取失败时回退到“歌手 - 歌名”文件名规则。
- 扫描按顺序处理文件，避免大曲库一次性并发解析占满内存和文件句柄。
- `runScanAsync()` 会更新标签、标记已删除文件，并保持旧数据可审计，不直接删除记录。
- 使用 `chokidar` 提供可选的跨平台目录监听；只有设置 `LIBRARY_WATCH_ENABLED=1` 才启用。
- 新增/修改/删除事件使用防抖扫描，避免复制大文件时反复写索引。
- 保留既有 Range、ETag、路径边界和媒体流安全检查。

### 音乐源可靠性增强

- 参考 Music Assistant 的 provider 分层和服务端可观测性思路，为网易云、QQ、酷狗请求增加成功/失败状态。
- 连续失败的音源进入短时熔断，冷却结束后自动进行一次恢复探测，避免故障源反复击穿。
- `/api/music/health` 只返回状态、失败计数和时间，不返回 Cookie、API Key 或用户数据。

涉及模块：`server/library/index.js`、`server/library/stream.js`、`server/tasks/index.js`、`server/db/store.js`。

## 下一阶段候选

1. 将音乐源统一为稳定的 Provider 接口，并提供健康评分和熔断；先不增加新的受版权约束的抓取源。
2. 为本地曲库增加封面缓存、歌词文件关联、专辑/艺术家聚合和后台修复页面。
3. 在 Redis/数据库模型稳定后，增加只读 OpenSubsonic 兼容 API；不把 Subsonic 的单用户播放模型误当作多人房间协议。
4. 将房间同步拆出版本化事件和可重放快照，参考 Syncplay/Web-SyncPlay 的房间状态经验，但保持现有 Socket.IO 客户端兼容。
5. 评估 FFmpeg 转码、转码并发上限和缓存清理；所有外部媒体仍须通过 URL 安全校验和版权合规审查。

## 不自动执行的事项

- 不把 AGPL 项目代码或前端界面直接并入当前 MIT 项目。
- 不复制带有第三方音乐服务 Cookie、下载器或受版权限制的内容。
- 不在国外仓库创建 Issue、PR、Fork、Release 或推送代码。
- 不在没有 macOS/Xcode、签名凭据和人工授权的情况下发布 iOS 安装包。
