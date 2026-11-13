# 仓库与打包文件范围

源码、问题反馈和正式资产只使用 [GitHub 仓库](https://github.com/yuchen0x1/JukeboxRoom)。日常代码更新在 `main` 提交，检查 `origin` 后执行 `git push origin main`。

## 应保留在仓库中

- 应用源码、回归测试、依赖清单与 lockfile、CI 和发布配置。
- Android Gradle wrapper、平台工程、资源图标及使用中的网页静态资源。这些是可复现构建和应用功能的输入。
- `.env.example`、`.env.capacitor.example`、签名配置示例等无真实凭据的模板。
- 部署、安全、许可证、发布历史和有参考价值的历史技术文档。

## 只保留在本机

- `.env` 及环境变体、签名密钥、证书私钥、Android 本机 SDK 配置。
- `server/data*` 数据目录、恢复备份、`.qishui-device` 设备身份、下载文件。
- `node_modules`、构建缓存、`client/dist`、`release` 安装包与未打包目录、临时测试截图和日志。
- `.autonomous-upgrade`、`.evolution`、`.workbuddy`、`.zcode` 等会话记录。仍在使用的本机工具与验证证据可以保留，但不进入 Git 或构建上下文。

数据目录及隔离备份可能是唯一恢复来源，不能仅因名称含 backup、quarantine 或 bak 就删除。已发布历史安装包留在 GitHub Releases，`.blockmap`、`latest.yml` 和校验清单有更新用途，不按无用文件删除。

## 打包边界

- 部署 ZIP 经 `scripts/package-server.mjs` 只复制运行 JavaScript、package 清单和 `.env.example`；拒绝符号链接和本机数据目录，不复制依赖及测试。部署后按文档安装生产依赖。
- Windows 安装包使用同一范围的资源过滤；`afterPack.cjs` 另行补齐内置服务依赖。
- Docker 使用 `.dockerignore` 排除本机文件，并显式复制根目录 `CHANGELOG.md`，供前端生成离线更新日志。
- CI 与发布流程均运行 `node --test scripts/package-server.test.mjs`，检查源码保留以及凭据、设备身份、数据恢复副本等排除行为。

新增运行资源类型时，需要同时更新 ZIP 与 Windows 过滤范围及回归样例，避免因遗漏资源导致安装后启动失败。

## 版本记录

面向用户的历史以 [发布说明历史](releases/release-notes.md) 为入口，技术细节保留在 [CHANGELOG](../CHANGELOG.md)。README 只摘要最新正式版本。GitHub Release 正文使用可直接访问的完整链接，平台和资产以实际发布内容为准。

补写历史记录只编辑说明文字；不移动旧 Tag、不重打旧版本、不把标签之后的修复写成旧安装包已包含，也不为仅有历史文档的版本虚构 Release。
