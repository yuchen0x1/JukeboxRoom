# JukeboxRoom 自动更新说明

本文说明当前 `main` 分支上的四种更新路径。它们是不同的部署模型，不会互相替代。

## Web / 自托管服务

服务端的 `/api/update`、`/api/update/changelog` 仍然从 GitHub Releases 读取信息。自托管实例的一键更新由服务端执行：检查工作区干净、确认远程为 `yuchen0x1/JukeboxRoom`、确认当前分支为 `main`，然后快进到 `origin/main`、重建前端并按部署方式重启。

普通 Web/PWA 站点由部署方更新构建产物；现有 Service Worker 按构建版本缓存并在网络可用时刷新同源资源，用户重新打开或刷新页面即可获得新前端。Web 页面不会像桌面安装包那样下载并执行本机安装器。

生产环境可用 `AUTO_UPDATE=0` 关闭自动更新。更新不会删除 `OPENMUSIC_DATA_DIR`、用户凭据或数据库文件；更新前仍应先做备份。出现故障时，把部署目录回退到上一条已验证的 `main` 提交，再重新构建并重启。

Web 页面只在管理员会话有效且部署支持时提供“更新服务器”。必须先收到服务端的任务启动确认，再轮询真实状态；权限拒绝、更新失败和需要手动重启会显示对应提示。普通访客可以刷新网站或打开发布页。

## Android 独立播放器

设置页直接读取 GitHub 稳定 Release 列表，并选择实际包含 Android APK 的最新版本。仅发布 Windows 安装包的新版本不会触发手机更新提示，也不会建议降级。用户自行确认下载与安装；本机 debug 构建和 CI 调试产物不自动发布到正式更新通道，覆盖升级仍须使用兼容签名。

## iOS 远程站点客户端

iOS 加载配置的 HTTPS 站点；网页更新由站点部署方完成，原生工程变更需重新编译和签名。当前没有独立音乐播放器或自动安装 IPA 能力。同步及持续编译方式见 [移动端维护说明](MOBILE.md)。

## Windows 桌面版

桌面版使用 `electron-updater` 和 GitHub Releases，更新源固定为：

```text
yuchen0x1/JukeboxRoom
```

只有已经打包的 Windows NSIS 安装版启用 Electron 更新器。开发环境、Web 版、Android 和 iOS 不会调用它。应用启动后会自动检查一次，设置页也可以手动检查；检查不会自动下载，下载和安装都必须由用户确认。

自动检查默认每 6 小时再次执行一次，可通过启动桌面应用时的 `JUKEBOX_UPDATE_CHECK_INTERVAL_HOURS` 调整为 1–168 小时。

流程如下：

1. 发布页提供 NSIS 安装包、`latest.yml` 和 `.blockmap`。
2. 应用检查 GitHub Release，发现更高的稳定版本后显示版本、更新说明和下载按钮。
3. 用户点击下载后显示真实的传输进度、速度、已传输字节数和可计算时的剩余时间；失败会自动重试一次，仍失败时可手动重试，也可取消下载。断点续传依赖 electron-updater 的差分下载条件，本项目尚未完成断网续传端到端测试。
4. 下载完成后，用户点击“退出并安装”；安装器完成覆盖升级并重新启动应用。
5. 检查或下载失败时不会替换当前版本，且不会把错误详情或更新源凭据暴露给页面。NSIS 安装器运行失败时没有经过本项目端到端验证的自动回滚保证；按下方回滚步骤手动重装上一版。

NSIS 安装器使用 per-user 模式，`deleteAppDataOnUninstall` 保持为 `false`，因此覆盖安装不会清除应用数据。electron-updater 在下载后、启动安装器前校验 `latest.yml` 中的 SHA-512；发布工作流另生成 `SHA256SUMS.txt`，供用户独立核验安装包、blockmap 与更新清单（客户端不会读取这份 SHA-256 清单）。

当前锁定的 electron-builder 26 / electron-updater 6 会生成带 SHA-512 文件摘要的更新元数据，但不提供 Ed25519 签名更新清单。SHA-512 校验可检测安装包与当前元数据不匹配；它本身不能防止同时控制 Release 与 `latest.yml` 的攻击者替换二者。发布源仍依赖 HTTPS、GitHub 仓库权限和 Release 操作权限保护。

Windows Authenticode 更新签名验证已启用；当前未提供证书时，安装包无签名且没有已安装版本中的发布者身份可比对，因此不能声称签名验证已实测通过。electron-updater 6 的 NSIS 实现遇到缺失的 `publisherName` 时会跳过 Authenticode 检查，所以配置开关本身不等于无证书构建也在强制拒绝未签名更新。未签名构建还可能触发 SmartScreen。正式发布前可配置 `WINDOWS_CSC_LINK` 与 `WINDOWS_CSC_KEY_PASSWORD` Secrets；证书私钥不进入仓库。配置后仍需在真实签名 runner 上确认发布者名称，并完成签名升级测试。electron-builder v27 的官方文档引入 Ed25519 签名更新清单，但上游目前将 v27 标为尚未发布的 next 版本；应待正式稳定版发布并完成旧版本兼容/密钥轮换评估后再迁移，不能用预发布版宣称生产签名已完成。

### 方案调研与选择

调研了三种适用于 Electron 桌面分发的成熟路线：

1. [`electron-updater`](https://www.electron.build/docs/features/auto-update/)：和本项目现有的 Electron Builder + NSIS 安装方式直接兼容，可生成 `latest.yml`、NSIS 更新文件，并使用 GitHub Releases provider；因此保留现有打包体系并采用此方案。
2. [Electron 内置 `autoUpdater` / `update-electron-app`](https://www.electronjs.org/docs/latest/tutorial/updates)：由 Electron 官方维护，适合 Electron Forge 与 Squirrel.Windows / Squirrel.Mac 更新流程；Windows 元数据与安装包格式不同，迁移会替换当前 NSIS 分发方式，且不能直接复用本项目的 builder 更新资产，因此未采用。
3. [Velopack](https://docs.velopack.io/)：活跃的跨平台桌面安装与更新框架，提供 release channel、独立包格式及差分更新；要采用它需要替换 NSIS 安装链并重做 Electron 集成，不是当前结构下的增量接入，故未采用。

[Tauri Updater](https://v2.tauri.app/plugin/updater/) 也很成熟并强制验证更新签名，但当前项目不是 Tauri 应用；迁移到 Tauri 会改变桌面运行时，不属于本次安全的增量实施范围。

## GitHub Actions 发布

### 日常验证

`.github/workflows/ci.yml` 在 `main` push 和 Pull Request 上运行：

- Node.js 20；
- 服务端、客户端和桌面更新器测试；
- 前端构建与 bundle 检查；
- 生产依赖审计。

### Windows Release

`.github/workflows/release.yml` 只响应形如 `v1.2.3` 的 tag。工作流会验证根目录、`client`、`server`、`desktop` 的版本一致，在 Windows runner 上构建 NSIS，并把安装包、`latest.yml` 和 `.blockmap` 上传到对应 GitHub Release。

发布工作流会拒绝不在 `origin/main` 历史中的标签，也会在构建前拒绝覆盖已有 Release。上传前自动生成 `SHA256SUMS.txt`。Electron updater 使用的 SHA-512 来自 `latest.yml`，不是用独立 SHA-256 清单代替。

发布命令应在 `main` 上执行：

```bash
git checkout main
git pull --ff-only origin main
# 同步四处版本号、CHANGELOG 和发布说明后
git tag v1.2.3
git push origin main
git push origin v1.2.3
```

不要把 tag 推到 Gitee 或其他分支。Release 使用 Actions 内置的 `GITHUB_TOKEN`，工作流只需要 `contents: write` 权限；仓库不保存 Token、证书私钥或密码。

## 签名 Secrets

如果启用 Windows 代码签名，应在 GitHub Actions Secrets 中保存证书内容及密码，并在工作流环境中配置 `CSC_LINK` / `CSC_KEY_PASSWORD`（或 electron-builder 支持的等价变量）。证书文件不要提交到仓库、Release 资产或日志。没有证书时必须如实标记为未签名。

## 回滚与限制

- 回滚桌面版：保留上一版 GitHub Release 安装包，用户手动安装上一稳定版本。
- 回滚 Web：把部署目录恢复到上一条稳定 `main` 提交，重新执行依赖安装、前端构建和服务重启。
- GitHub Release 不存在、`latest.yml` 缺失、网络被防火墙拦截或版本号未递增时，桌面端会保留当前版本并显示失败状态。
- Electron 自动更新只适用于 Windows 桌面安装包；Android/iOS 仍依赖应用商店或手动分发。
- 本地无法替代真实线上验证：必须在 GitHub Actions 成功、Release 资产可下载、Windows 安装后升级和签名环境可用后，才能宣称端到端发布完成。
