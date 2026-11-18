# 参与 JukeboxRoom 开发

使用 Node.js 24 LTS 和 npm。运行 `npm run install:web` 安装 Web 和服务端依赖，使用 `npm run dev` 启动开发环境。涉及 Windows 打包时另运行 `npm ci --prefix desktop`。开发期使用独立的数据目录，环境变量见 [部署文档](docs/DEPLOY.md)。

提交前运行 `npm test`、`npm run build`、`npm run check:bundle` 和 `npm run audit:prod`。检查改动影响的房间协议、数据兼容性、平台行为及更新路径，记录实测结果。公开 Issue 中请移除用户数据和凭据。安全问题走 [私密报告](SECURITY.md)。

维护者按 [AGENTS.md](AGENTS.md) 直接更新 GitHub 的 `main`。外部贡献可从 fork 开 PR，保持提交范围清晰。文档改动与产品行为同步，发行流程见 [更新文档](docs/AUTO_UPDATE.md)。
