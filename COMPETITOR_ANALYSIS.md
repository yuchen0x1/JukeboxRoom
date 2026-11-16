# 全球开源竞品与相关技术对标

- 研究日期：2026-11-16（Asia/Shanghai）
- 研究对象：15 个公开源码项目
- 研究范围：仓库主页、README、目录/模块说明、许可证信息，以及公开的 Release/Issue/PR 页面（能访问时）。本轮没有复制第三方代码，也没有把第三方依赖加入 JukeboxRoom。
- 证据边界：GitHub API 匿名请求受限时，使用仓库公开页面和源码树交叉核对；对不适合直接移植的 GPL/AGPL 项目只提取架构和交互思路，不复制实现。

## 1. 研究清单

| 项目 | 定位 | 许可证 | 实际可借鉴点 | 对 JukeboxRoom 的决定 |
|---|---|---|---|---|
| [Musare](https://github.com/Musare/Musare) | 协作电台/点歌 | GPL-3.0 | DJ/请求角色、投票跳歌、站点级播放控制 | 继续强化房间权限和投票语义，不引入其代码 |
| [Mopidy](https://github.com/mopidy/mopidy) | 可扩展音乐服务 | Apache-2.0 | backend/frontend 插件边界、播放器核心与 UI 解耦 | 作为未来 provider adapter 的架构参考 |
| [Navidrome](https://github.com/navidrome/navidrome) | 自托管音乐服务器 | GPL-3.0 | Subsonic API 与响应式 Web UI 分层、媒体库索引 | 参考 API/客户端分层，保持本项目房间协议 |
| [Koel](https://github.com/koel/koel) | Web 音乐库/PWA | AGPL-3.0 | 搜索、队列、收藏和移动端 PWA 信息层级 | 参考搜索和空状态，暂不改变房间模型 |
| [Funkwhale](https://github.com/funkwhale/funkwhale) | 联邦音乐社区 | AGPL-3.0 | 社区歌单、实例边界、审核和联邦思路 | 仅作长期生态方向，当前不做联邦化 |
| [Ampache](https://github.com/ampache/ampache) | 成熟音乐流媒体服务 | AGPL-3.0 | 智能歌单、标签查询、兼容 API 和权限 | 作为歌单/过滤能力参考 |
| [Jellyfin](https://github.com/jellyfin/jellyfin) | 多设备媒体平台 | GPL-2.0 | 明确的 playback session、设备能力和多端状态 | 参考能力协商和会话状态 |
| [Airsonic-Advanced](https://github.com/airsonic-advanced/airsonic-advanced) | Subsonic 兼容服务 | GPL-3.0 | 转码、客户端能力协商、兼容协议 | 参考 provider capability，不移植其转码栈 |
| [Music Player Daemon](https://github.com/MusicPlayerDaemon/MPD) | 守护进程/客户端播放器 | GPL-2.0 | 确定性的播放器核心和命令协议 | 参考房间服务与播放核心边界 |
| [Syncplay](https://github.com/Syncplay/syncplay) | 同步观看/播放协议 | Apache-2.0 | 服务端权威时间戳、重连初始化、漂移校正 | 保持当前服务器权威播放状态，继续量化漂移 |
| [Strawberry](https://github.com/strawberrymusicplayer/strawberry) | 桌面音乐库 | GPL-3.0 | 键盘友好的密集队列、标签和本地库操作 | 参考桌面端快捷操作和信息密度 |
| [Tauon Music Box](https://github.com/Taiko2k/TauonMusicBox) | 桌面播放器 | GPL-3.0 | 快速浏览、队列编辑、封面信息层级 | 参考队列批量交互和封面加载 |
| [Lollypop](https://gitlab.gnome.org/World/lollypop) | GNOME 音乐播放器 | GPL-3.0 | 专辑优先的浏览结构、原生桌面交互 | 作为桌面播放器视觉参考 |
| [Quod Libet](https://github.com/quodlibet/quodlibet) | 高级本地音乐管理 | GPL-2.0 | 强大的标签查询和可组合搜索 | 参考高级搜索语法，暂不扩展到房间协议 |
| [Rhythmbox](https://gitlab.gnome.org/GNOME/rhythmbox) | 桌面播放器 | GPL-2.0 | 插件化功能模块、桌面任务反馈 | 参考模块化和任务状态展示 |

## 2. 对标结论

### 产品功能

JukeboxRoom 的优势是多人房间、实时队列、投票/权限、聊天、TV 页面和本地曲库/AutoDJ 的组合。Navidrome、Ampache、Koel 等在单用户媒体库、标签、智能歌单和 API 兼容上更成熟；Musare、Syncplay 更接近协作与同步语义。

差距集中在：

- 外部 provider 的契约测试和能力声明；
- 多实例状态一致性；
- 稳定的歌单 entry ID 与跨进程事务；
- 长时间运行、断网、真实设备和安装升级证据；
- 大型页面拆分和统一客户端错误处理。

### 用户体验和 UI

成熟单机播放器通常把搜索、媒体库、队列、收藏和播放会话分开组织，桌面快捷键更完整；JukeboxRoom 的房间页同时承载聊天、队列、歌词、视觉效果、成员和设置，功能丰富但认知负担高。

可吸收的做法：

1. 保留当前房间页的实时协作入口；
2. 把高频队列动作、播放状态和成员状态分成清晰的可聚焦区域；
3. 用统一的 loading、empty、error、retry 和 aria status/alert；
4. 桌面端增加键盘操作和稳定的焦点顺序；
5. 移动端保持底部导航和播放器 sheet，不把桌面布局缩小后硬塞进手机。

### 技术架构

Mopidy、MPD、Jellyfin 和 Navidrome 的共同价值是边界清晰：

- 播放核心维护确定性状态；
- provider/backend 只负责能力和数据适配；
- 客户端通过稳定协议消费状态；
- 设备能力、会话和媒体格式显式声明。

JukeboxRoom 已具备 roomManager、sourceResolvers、mediaProxy、Redis adapter 等模块，下一步应优先补齐契约和观测，而不是更换框架。

### 性能

Navidrome、Koel、Tauon 等把索引、封面缩略图、搜索和队列浏览作为一等性能路径。JukeboxRoom 已使用虚拟队列、压缩和视觉按需加载，但还缺：

- provider 搜索/解析的缓存命中、耗时和失败率；
- 房间广播大小及队列更新耗时；
- Redis/JSON 存储在长队列和高并发下的基准；
- Android/桌面真实设备的启动和内存测量。

### 安全与稳定性

本轮重点借鉴的不是某个项目的代码，而是成熟系统的边界习惯：

- 外部 URL 每一次重定向都重新校验；
- 运行时故障应从 readiness 和业务流量两侧隔离；
- 会话/设备/播放状态应有明确生命周期；
- 能力不可用时返回可解释的错误和降级路径；
- 依赖、发布、签名、备份和回滚要有可验证证据。

本轮已修复 QQ 登录重定向 SSRF 风险，并让 provider JSON 请求统一经过安全出站请求器。

## 3. 许可证和移植决策

- 本轮没有复制任何第三方源码。
- MIT/Apache-2.0 仅在未来确需移植具体代码时再单独核对 NOTICE、版权和兼容性。
- GPL-2.0/GPL-3.0/AGPL-3.0 项目只作为架构、交互和协议研究对象；不会把其代码直接嵌入当前 MIT 项目。
- 研究结论不能证明第三方项目的全部功能在当前日期仍然可用；本报告只记录公开源码和文档中可核对的设计方向。

## 4. 需要保持的独特能力

1. 房间级实时协作、房主/管理员/成员边界和投票跳歌；
2. 共享聊天、表情、回复、@ 和房间公告；
3. 多音源、歌词、封面、媒体代理和失败降级；
4. TV 大屏、Windows 桌面壳和 Android 独立播放器；
5. 本地曲库、AutoDJ、任务中心和审计日志；
6. 可自托管、Docker/PM2/Nginx 文档和 GitHub 发布流程。

这些能力不应因盲目追求单机播放器的功能数量而被削弱。
