# 发布说明历史

> 本页为面向用户的完整版本历史。日期按北京时间（Asia/Shanghai）记录；技术细节见 [CHANGELOG.md](../../CHANGELOG.md)。历史 OpenMusic 2.x 与 JukeboxRoom 0.0.x 为不同阶段的版本序列，不能按数字大小判断新旧。

## 未发布（main 分支，非 v0.0.17 安装包内容）

- 修复网易云搜索结果封面、歌词地址及相关媒体访问兼容问题。该修复提交在 v0.0.17 标签之后，需后续版本安装包才会包含。
- 完善版本历史与发布说明；部署包和 Windows 安装包只携带运行资源，避免把本机凭据和数据副本带到其他电脑。

## 0.0.17（GitHub 正式发布，2026-11-13）

- 修复 Windows 系统代理拦截桌面内置服务的问题：外部服务继续使用系统代理，本机地址始终直连。
- 桌面音频优先通过本机媒体代理播放，代理不可达时回退原始 CDN 地址。
- 补充音频超时、取消、网络中断和格式错误提示；延续 v0.0.16 的透明多尺寸图标。

发布资产：Windows x64 安装包、自动更新元数据及校验清单。本次未发布 Android APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.17) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.17)

## 0.0.16（GitHub 正式发布，2026-11-13）

- 修复 Windows 图标黑边、黑底和透明边缘污染，保留原有 Logo 设计。
- 统一 EXE、安装器、快捷方式、任务栏、标题栏和系统托盘的透明多尺寸图标。
- 延续 v0.0.14 的 GitHub 自动更新与数据保留能力，以及 v0.0.15 的实验性咪咕音源。

发布资产：Windows x64 安装包、自动更新元数据及校验清单。本次未发布 Android APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.16) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.16)

## 0.0.15（GitHub 正式发布，2026-11-13）

- Windows 桌面版新增实验性咪咕音乐搜索、歌词、封面和播放地址解析。
- 设置页支持手机号短信验证码登录、查看状态和退出登录；令牌加密保存在本机，手机号和验证码不落盘。
- 改进咪咕媒体访问和网易云播放失败提示，便于用户判断需要登录、配置音源或切换平台。
- 咪咕依赖非官方社区接口，可用性会随上游变化。

发布资产：Windows x64 安装包、自动更新元数据及校验清单。本次未发布 Android APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.15) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.15)

## 0.0.14（GitHub 正式发布，2026-11-12）

- Windows 桌面版支持检查 GitHub 稳定版本、确认下载、查看下载进度，并在确认后退出安装。
- 修复 Windows 发布时找不到图标工具的问题，交付安装包、自动更新元数据与校验清单。
- 优化首屏加载、资源压缩和缓存，Three.js 在需要 3D 效果时再加载。
- 卸载桌面版开始保留用户数据；设置页可打开数据目录，或二次确认后清理。
- 收紧媒体代理访问范围，改进房间事件、播放推进、API 错误和 PWA 缓存更新的稳定性。

发布资产：Windows x64 安装包、自动更新元数据及校验清单。本次未发布 Android APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.14) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.14)

## 0.0.13（GitHub 正式发布，2026-11-08）

- 新增独立管理后台和登录页，提供概览、用户、房间、任务、审计、曲库及 AutoDJ 七个页签。
- 普通用户可自助注册；普通账号无法进入管理后台，也无法通过注册请求提升权限。
- 首个超级管理员由环境变量显式创建；超级管理员可调整用户角色，禁止自降权限或降级最后一位超管。
- 管理员可发送全服公告、关闭房间；角色变更和封禁会撤销相关刷新会话。

发布资产：Windows x64 安装包、Android debug APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.13) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.13)

## 0.0.12（GitHub 正式发布，2026-11-06）

- 修复首页仍显示旧版本徽章的问题，改为显示构建时的实际版本。
- 同步 Web、服务端、Windows 和 Android 的版本信息，避免界面与安装包版本不一致。
- 更新 Android 版本为 0.0.12，并提供重新构建的 Windows 安装包和 Android debug APK。

发布资产：Windows x64 安装包、Android debug APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.12) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.12)

## 0.0.11（GitHub 正式发布，2026-11-06）

- 全站升级为赛博 HUD 界面，更新大厅、房间、全屏播放器和桌面导航。
- 新增播放、切歌、调音量和聚焦搜索快捷键，以及五段音频均衡器预设。
- 歌曲不可播放时可跨平台匹配替代音源；增强网易云和 QQ 音乐歌单链接导入。
- 房间队列支持导出 JSON；桌面托盘显示曲名并支持播放、暂停和下一首。
- 修复音频节点泄漏、非浏览器环境读取本地存储和 Windows 导出文件名兼容问题。

发布资产：Windows x64 安装包、Android debug APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.11) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.11)

## 0.0.10（GitHub 正式发布，2026-11-04）

- 应用内更新日志改为同步 GitHub Releases，减少新版本日志遗漏或过期。
- 网络不可用时回退到随包日志，并去重展示版本。
- 补齐 v0.0.8、v0.0.9 的应用内历史记录。

发布资产：Windows x64 安装包、Android debug APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.10) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.10)

## 0.0.9（GitHub 正式发布，2026-11-04）

- Windows 设置页新增 QQ 交流群入口，方便反馈点歌、播放和账号问题。
- Android 设置页新增“关于与交流”，提供 QQ 群和 GitHub 发布页入口。

发布资产：Windows x64 安装包、Android debug APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.9) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.9)

## 0.0.8（GitHub 正式发布，2026-11-04）

- Windows 主窗口关闭后进入托盘，音乐继续后台播放；再次启动会唤起已有窗口。
- 搜索结果按每页 30 条分页，封面加载失败时显示占位图。
- 登录凭据在本机加密保存，重启或覆盖安装后可继续使用；网易云凭据到期时提示重新登录。
- 修复首批 Windows 安装包缺少内嵌服务依赖导致无法启动的问题；遇到 code=1 请重新下载本版安装包。
- 本版卸载程序会清除本机应用数据；从 v0.0.14 起改为保留，卸载旧版前请先备份。

发布资产：Windows x64 安装包、Android debug APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.8) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.8)

## 0.0.7（GitHub 正式发布，2026-11-03）

- QQ 音乐、网易云、酷狗和汽水账号改为本机长期保存，刷新、重启或新建房间后无需重复登录。
- 修复网易云扫码风控、QQ 音乐二维码状态与登录凭据补全，以及汽水媒体访问 403 问题。
- 播放失败歌曲支持倒计时自动跳过，并限制连续跳过次数。
- 修复房间列表误报、重连状态和播放器资源释放等问题；加强更新接口与本机账号访问保护。

发布资产：Windows x64 安装包、Android debug APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.7) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.7)

## 0.0.6（GitHub 正式发布，2026-11-02）

- 源码、问题反馈、发布和更新源统一迁至 GitHub；旧 Gitee 更新通道停止使用。
- 更新检查支持 GitHub Releases，匿名 API 限流时回退订阅源。
- 更新页和下载入口使用 GitHub 官方资产地址，支持可选只读 UPDATE_GITHUB_TOKEN。

发布资产：Windows x64 安装包、Android debug APK。

[本版下载与升级说明](https://github.com/yuchen0x1/JukeboxRoom/releases/tag/v0.0.6) · [版本源码](https://github.com/yuchen0x1/JukeboxRoom/tree/v0.0.6)

## 0.0.5（历史标签，2026-11-02）

- 新增独立 Windows 个人音乐工作区，提供发现、搜索、收藏、最近播放、歌单和本地音乐。
- 提供独立 Android 播放器，无需填写多人房间服务器地址。
- Android 支持后台播放、系统媒体通知、锁屏和耳机控制；改进房间布局及音源错误恢复。

当前 GitHub 无对应 Release 安装包记录；保留历史说明，不补造发布记录。

## 0.0.4（历史标签，2026-11-02）

- 加强平台账号与房间密码要求，完善刷新会话轮换、退出和封禁撤销。
- 生产部署要求稳定的安全密钥，JSON 存储增加写锁、原子更新与恢复备份。
- 加强接口限流、连接数限制和外部媒体地址校验，修复依赖安全问题。

当前 GitHub 无对应 Release 安装包记录；保留历史说明，不补造发布记录。

## 0.0.3（历史标签，2026-11-02）

- 自托管更新弹窗新增一键更新入口，可完成拉取、安装依赖、重建与重启流程。
- 支持每日检查更新，通过 AUTO_UPDATE 控制；裸 Node.js 部署仍需按提示重启。
- 改善更新弹窗文本的可读性。历史更新源为 Gitee，现行 GitHub 迁移始于 v0.0.6。

当前 GitHub 无对应 Release 安装包记录；保留历史说明，不补造发布记录。

## 0.0.2（历史标签，2026-11-02）

- 新增 Docker 与可选 Redis 部署配置，并为房间数据提供持久化挂载。
- 重写部署文档，加入可交给 AI 执行的一键部署说明。
- 补充音源搜索、安全密钥和更新源配置；移动端安装包统一从发布页获取。

当前 GitHub 无对应 Release 安装包记录；保留历史说明，不补造发布记录。

## 0.0.1（历史标签，2026-11-02（首个版本））

- 以 JukeboxRoom 品牌重设版本序列，默认深色主题，保留免账号加入房间的使用方式。
- 房主可登录网易云、QQ 音乐、酷狗及汽水音源，为房间点歌提供相应账号能力；凭据留在服务端。
- 改进平台搜索、封面、VIP 标识及不可播放歌曲提示，修复 Node.js 20+ 上游地址解析问题。
- 新增 TEST01 联调房间，并支持固定设备身份签名密钥。

当前 GitHub 无对应 Release 安装包记录；保留历史说明，不补造发布记录。

## 2.0.2（历史标签，2026-09-05）

- 历史 OpenMusic 阶段：新增首页版本徽章、手动检查更新及新版本发布入口。
- 版本徽章由构建注入，更新接口不可用时仍能显示当前版本。
- 当时使用 Gitee 更新源；JukeboxRoom 后续在 v0.0.6 迁移至 GitHub。

当前 GitHub 无对应 Release 安装包记录；保留历史说明，不补造发布记录。

## 2.0.1（历史文档记录，2026-08-29）

- 历史 OpenMusic 阶段：支持网站、PWA 与远程移动壳的在线更新提示。
- 提供已发布桌面 ZIP、Android APK 和 iOS IPA 的下载回退入口。
- 改进 PWA 资源更新策略；本条来自历史文档，当前 GitHub 无对应独立 Tag 或 Release。

当前 GitHub 无对应 Release 安装包记录；保留历史说明，不补造发布记录。

## 2.0.0（历史文档记录，2026-08-13）

- 历史 OpenMusic 稳定基线，统一 Web、服务端及移动壳版本信息。
- 同步前端锁文件、React 与 Three.js 依赖兼容配置，并修复服务端依赖安全问题。
- 本条来自历史文档，当前 GitHub 无对应独立 Tag 或 Release；不表示当前仍为 2.0.0。

当前 GitHub 无对应 Release 安装包记录；保留历史说明，不补造发布记录。
