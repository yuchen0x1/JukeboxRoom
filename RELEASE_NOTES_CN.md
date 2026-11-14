# JukeboxRoom v0.0.18

发布日期：2026-11-14（北京时间） · [与上一版比较](https://github.com/yuchen0x1/JukeboxRoom/compare/v0.0.17...v0.0.18)

## 本版更新

- 规则模式系统代理兼容：开启 Clash 等规则模式代理时，国内音源域名（网易/QQ/酷狗/咪咕/汽水及其 CDN）在桌面版内强制直连，封面、歌词、播放解析和音频兜底不再被推进国外代理链；GitHub 更新检查等其余流量仍走系统代理。
- 修复咪咕短信登录始终提示「未返回有效会话」的问题；登录与验证码失败会显示咪咕通行证的真实原因（如「短信验证码错误或已失效」）。
- 修复网易云搜索结果封面、歌词地址与相关媒体访问兼容问题。
- 房间队列新增多关键词搜索、「我的点歌」筛选和批量移除；普通成员仅能撤回自己的点歌，房主/管理员可管理全部待播歌曲。
- 修复共享歌单重排时重复 ID 导致条目丢失的问题；服务端测试默认使用隔离数据目录。

## 下载与发布资产

| 文件 | 用途 |
|---|---|
| [jukeboxroom-desktop-setup-0.0.18-x64.exe](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.18/jukeboxroom-desktop-setup-0.0.18-x64.exe) | Windows x64 安装程序（内置本地服务端，无需安装 Node.js） |
| [jukeboxroom-desktop-setup-0.0.18-x64.exe.blockmap](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.18/jukeboxroom-desktop-setup-0.0.18-x64.exe.blockmap) | Windows 增量更新所需文件 |
| [latest.yml](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.18/latest.yml) | Windows 自动更新版本及 SHA-512 元数据 |
| [SHA256SUMS.txt](https://github.com/yuchen0x1/JukeboxRoom/releases/download/v0.0.18/SHA256SUMS.txt) | 发布文件 SHA-256 校验清单 |

## 升级与适用范围

- Windows 用户可下载安装包覆盖安装；操作前建议备份收藏、歌单与本机配置。
- 已支持自动更新的 Windows 客户端可在设置页检查版本，确认下载后重启安装；本版卸载程序保留本机数据。
- 本次只发布 Windows 安装包；Android 暂缓发包，请继续使用现有版本。
- Web / 自托管用户按原部署方式更新；启用管理后台时按部署文档配置首个管理员。

## 已知限制

- Windows 安装包未使用商业代码签名证书，首次运行可能触发 SmartScreen。
- 本版未发布 Android APK 或 iOS IPA。
- 音乐播放、登录、封面和歌词可用性受外部平台、账号权限与网络环境影响。

[本版技术变更](https://github.com/yuchen0x1/JukeboxRoom/blob/v0.0.18/CHANGELOG.md) · [完整发布历史](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/releases/release-notes.md) · [部署说明](https://github.com/yuchen0x1/JukeboxRoom/blob/main/docs/DEPLOY.md)
