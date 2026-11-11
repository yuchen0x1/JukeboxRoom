# OPEN_SOURCE_RESEARCH

日期：2026-11-10
说明：本会话**没有新增 GitHub/Gitee 网络抓取**（浏览器与搜索工具在会话中不可用/受限）。下表来自本项目 2026-11-09 的只读审计（`PROJECT_AUDIT_REPORT.md`）中已核实并记录的信息，本次仅作为架构与交互对照。**没有复制任何第三方代码，也没有引入新依赖。**

## 1. 对照项目

| 项目 | 地址 | 许可证 | 定位 | 值得借鉴 | 本轮是否采用 |
|---|---|---|---|---|---|
| Syncplay | github.com/Syncplay/syncplay | Apache-2.0 | 多播放器房间同步 | 重新加入后的状态恢复、明确的同步协议 | 否（现有重连已覆盖，本轮未改同步协议） |
| CrowdRoom | github.com/jaherhum/crowdroom | AGPL-3.0 | 共享点歌房（FastAPI + Vue + WebSocket） | 音源 adapter 边界、投票跳歌 | 否（AGPL 与 MIT 不兼容，仅参考设计） |
| Melodee | github.com/melodee-project/melodee | MIT | 自托管音乐库 + Party Mode | 媒体入库流水线、后台任务编排、OpenSubsonic 兼容 | 否（超出本轮范围） |
| CrownJukebox | github.com/Kronborgs/crownjukebox | MIT | Go + SQLite 本地点唱机 | TV kiosk 信息层级、封面缩略图缓存 | 否（本项目已有 TV 页与缩略图） |

## 2. 差距判断（与当前代码对照）

| 维度 | 当前状态 | 差距 | 优先级 |
|---|---|---|---|
| 同步播放 | Socket.IO 广播播放状态 + 客户端时钟同步 | 不宣称样本级同步；缺跨设备声学对齐 | 低（产品定位不同） |
| 音源抽象 | `sourceResolvers.js` 四平台适配 | 契约测试依赖真实上游，缺可控 mock 服务 | 中 |
| 媒体代理 | 本轮完成流式化 + 上限 | 仍是开放代理（任意公网 URL），建议域名白名单 | 中 |
| 房间生命周期 | 本轮补齐空房 TTL 与销毁竞态 | 多实例下仍需 Redis 级协调 | 中 |
| 曲库 | JSON 索引 + 文件监听 | 无入库流水线/格式归一化/去重 | 低 |
| 可观测性 | 结构化日志 + 可选 Prometheus | 缺分布式追踪、缺前端错误上报 | 低 |
| E2E | 单元/集成测试充分 | 无浏览器端到端测试 | **高** |
| 巨型页面 | `Room.tsx` 3219 行 | 拆分成本高，需行为测试保护 | 中 |

## 3. 结论

本轮升级的收益来自**对自有代码的故障路径审计**（内存上限、进程级异常、状态机竞态），而不是照搬竞品功能。这符合项目当前阶段：先把可靠性与安全性做扎实，再考虑功能扩张。

后续如需继续做开源对照，建议优先研究：
1. Syncplay 的重连状态机（Apache-2.0，可安全借鉴实现思路）。
2. Melodee 的入库任务编排（MIT）。
3. 任何项目的 Playwright E2E 组织方式（用于补齐本项目最大的验证缺口）。

许可证提醒：AGPL-3.0 项目（如 CrowdRoom）只能参考公开设计，不得复制实现到 MIT 项目。
