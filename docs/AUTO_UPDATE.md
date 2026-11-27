# JukeboxRoom 发行与更新

## Web 与 PWA

新构建使用含内容哈希的 JS/CSS 文件。Service Worker 在独立缓存中准备大厅入口，并在 HTML 与入口文件匹配时完成安装。用户可以稍后刷新或立即刷新。立即刷新会等新版 Worker 接管，再重新连接页面。服务器 API、媒体分段、下载与实时连接使用网络。

部署时先上传新哈希资源，随后切换 HTML 和 `sw.js`，保留前一版资源直到既有会话完成。HTTPS 源站可安装 PWA。断网时可访问缓存大厅，房间消息和流媒体需要恢复网络。部署回退时恢复上一个完整构建及其配置。 [Service Worker 生命周期](https://developer.chrome.com/docs/workbox/service-worker-lifecycle)

## 自托管

`/api/update` 从 GitHub Releases 获取版本、发布时间、说明和平台资产。管理员发起更新前，服务会确认工作区干净，Git HTTPS 远程和分支正确，新版是官方仓库发布的稳定标签，标签可由当前提交快进且位于远端 `main` 历史中。确认后重新安装 npm 依赖并构建前端。PM2 和带重启策略的容器可重启服务，其他进程托管方式按状态提示重启。显式设置 `AUTO_UPDATE=1` 可启用定时安装。

对于 Docker 镜像、ZIP 部署包和非 Git 部署，从 GitHub 获取目标版本。下载同页的 `SHA256SUMS.txt` 并执行 `sha256sum -c SHA256SUMS.txt` 或用 PowerShell 的 `Get-FileHash -Algorithm SHA256` 比对。校验后将其部署到新目录，沿用原数据目录和配置。启动后检查 `/api/health/ready`，再切换运行入口。

部署前备份环境配置与数据目录。如果安装、构建或启动失败，从上一版部署目录或 Git 标签重新构建并重启。管理员根据部署方式保留和恢复备份。回滚演练应使用隔离环境。

## Windows

Windows x64 构建使用 GitHub Releases 及 `latest.yml`。用户确认后开始下载，可查看进度或取消。Electron 更新器按发布元数据校验文件内容；签名构建还会验证构建中配置的发布者签名。确认安装后由 NSIS 执行，安装后重启程序。应用数据沿用已有目录。

配置 `WINDOWS_CSC_LINK` 和证书所需的 `WINDOWS_CSC_KEY_PASSWORD` 后，发布作业检查安装器、程序和更新发布者配置，并让新安装启用后续应用内更新。签名未配置时仍发布未签名兼容资产和 `latest.yml`，以便旧版客户端收到更新提示；首次运行可能触发 SmartScreen，未签名新安装不会启用后续应用内更新。签名证书安装链、真实跨版本更新、故障回退和 Windows 10/11 真机验收均需专门环境。

## Android、iOS 与 iPadOS

Android 调试构建使用 Gradle 调试签名，正式同包升级须由部署方维护同一发布密钥及递增版本码。iOS/iPadOS 使用 Apple 签名与应用商店更新。各平台的实际构建和验收路径见 [移动端维护说明](MOBILE.md)。

## GitHub 发布与检查

1. 在 `main` 更新产品说明、所有 npm 版本和锁文件，以及 Android 和 Xcode 的版本元数据。两种移动端构建号各自递增。
2. 本地运行 `node scripts/check-versions.mjs vX.Y.Z`、`npm run check` 与相关平台测试。推送到 GitHub 的 `origin/main` 后检查 CI。
3. 在 GitHub 为经验证的提交创建新标签 `vX.Y.Z`。标签提交必须位于 `origin/main` 历史。
4. Actions 执行校验和产物测试，将资产上传到草稿后比对 GitHub 提供的摘要，再发布不可变 Release。已存在的 Release 由维护者检查。
5. 下载并验证发布文件，检查 README 自动同步、应用实际读取的更新版本和客户端安装验证。定期资产检查由 `release-health.yml` 执行。

SHA-256 用于检查字节完整性。下载来源依赖 HTTPS 和官方 GitHub 仓库；签名构建还应验证 Windows 发布者。 [GitHub 发行管理](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
