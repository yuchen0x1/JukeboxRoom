# 发布前检查清单（RELEASE_CHECKLIST）

> 适用于后续 JukeboxRoom 发布。仅按实际交付平台勾选，未构建的平台不得写成已发布。
> 永久规则：代码与发布一律只推送到 GitHub（`https://github.com/yuchen0x1/JukeboxRoom`），不向 Gitee 推送。

## 1. 版本号与元数据

- [ ] 五处版本号已同步更新（示例：`0.0.10` → 下一版本号）：
  - [ ] `package.json`（根）
  - [ ] `client/package.json`
  - [ ] `server/package.json`
  - [ ] `desktop/package.json`
  - [ ] `client/android/app/build.gradle`（`versionCode` +1，`versionName` 同步）
- [ ] `CHANGELOG.md` 与 `docs/releases/release-notes.md` 新增本版本条目，保留历史；日期统一按北京时间记录。
- [ ] README「最新更新」只保留最新正式版本，并链接完整历史；标签之后的修复仍列在 Unreleased，不归入旧安装包。
- [ ] `RELEASE_NOTES_CN.md` 与 `RELEASE_NOTES_EN.md` 已更新为本版本内容，中英文一致。
- [ ] Android `versionCode` 严格递增，未与历史版本重复。

## 2. 代码质量检查

- [ ] `git status` 干净，无未提交的业务代码改动；发布相关改动已提交。
- [ ] `npm run check` 通过（服务端测试 + 客户端测试 + 前端构建 + 生产依赖审计）。
- [ ] `node --test scripts/package-server.test.mjs` 通过；部署包与桌面资源不得包含 `.env`、设备身份、运行数据及恢复副本。
- [ ] 本版本新增/修改的功能已有对应回归测试（如适用）。
- [ ] 安全自查：新增接口/外部请求是否走既有 SSRF 校验与鉴权链路；新增环境变量已写入 `server/.env.example` 与部署文档。

## 3. 构建产物

- [ ] Windows 桌面版构建：`cd desktop && npm run dist`，产物输出至 `release/desktop/`。
  - 文件名格式：`jukeboxroom-desktop-setup-<版本号>-x64.exe`（附 `.blockmap`）。
- [ ] 如发布 Android，使用稳定签名构建，并核对与旧版覆盖安装兼容；暂缓发包时明确注明，不借用旧版 APK 冒充新版本。
- [ ] 产物在真实设备/系统上完成冒烟测试：
  - [ ] Windows：安装 → 启动 → 加入房间/播放 → 关闭最小化到托盘 → 托盘退出。
  - [ ] Android：安装 → 搜索/播放 → 后台播放与媒体通知 → 覆盖安装数据保留。
  - [ ] 应用内「更新日志」能加载（动态接口正常，断网时回退静态文件）。
- [ ] 确认桌面版内嵌 server 依赖完整（`desktop/scripts/afterPack.cjs` 逻辑未被破坏，v0.0.8 曾因此出现启动错误）。
- [ ] 检查安装目录和部署 ZIP，不含 `server/data*`、`.qishui-device`、本机环境文件、日志、测试及签名私钥；配置模板 `.env.example` 可以保留。

## 4. 发布流程

- [ ] 确认当前分支为 `main`、跟踪 `origin/main`，且 `git remote -v` 中 `origin` 指向 GitHub `yuchen0x1/JukeboxRoom`；不得向 Gitee 或其他远程推送。
- [ ] 推送代码：`git push origin main`。
- [ ] 在版本号、日志和构建检查全部完成后创建并推送 Tag：`git tag v<版本号> && git push origin v<版本号>`。
- [ ] 创建 GitHub Release（`gh release create v<版本号>` 或网页端），正文使用 `RELEASE_NOTES_CN.md` 内容（可附英文版链接）。
- [ ] 只上传本次实际构建的平台资产；Windows 同时保留自动更新与校验文件：

| 资产 | 命名规则 |
|---|---|
| Windows 安装包 | `jukeboxroom-desktop-setup-<版本号>-x64.exe` |
| Windows 更新文件 | 对应 `.exe.blockmap`、`latest.yml`、`SHA256SUMS.txt` |
| Android 安装包（如发布） | 文件名注明版本与实际签名类型 |

## 5. 发布后验证

- [ ] Release 页面资产可下载，链接直链有效（`releases/download/v<版本号>/…`）。
- [ ] 线上应用内「更新日志」已出现新版本条目（动态同步生效）。
- [ ] 本次实际发布平台的「检查更新」能检测到新版本；暂缓发包的平台不得声称已更新。
- [ ] 在应用内完成一次一键更新（自部署环境），升级流程正常。
- [ ] Release 标记为 Latest，历史 Release 未被误删或覆盖。

## 6. 回滚预案

- [ ] 保留 GitHub 历史正式安装包和更新文件，确保上一版本可重新下载；本地重复构建产物可清理。
- [ ] 如新版本出现严重问题：在 GitHub Release 页面将上一版本重新标记为 Latest，并置顶公告说明回退。
