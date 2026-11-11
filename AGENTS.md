# 仓库推送规则（所有 AI 会话必须遵守）

**【永久规则】从现在开始，本项目的代码更新一律推送到 GitHub；不再向 Gitee 推送任何内容。**

- GitHub 仓库：https://github.com/yuchen0x1/JukeboxRoom
- 任何 git push、发版、同步任务：目标只能是已确认的 GitHub 仓库，绝不要向 Gitee 推送。
- 推送前先运行 `git remote -v` 检查远程；如没有 GitHub 远程，使用 `git remote add github https://github.com/yuchen0x1/JukeboxRoom.git`，推送时只使用 GitHub 远程。

## 主分支规则

- 本项目后续代码更新统一直接落在 `main` 分支；不要创建或切换到其他长期开发分支。
- 提交前确认当前分支为 `main`，并确认 `main` 跟踪 GitHub 的 `origin/main`。
- 推送统一使用 GitHub 的 `origin`，命令为 `git push origin main`；禁止向其他远程或其他分支推送。
- 如果发现历史残留分支，先确认没有未合并提交，再删除本地和 GitHub 远程分支；`main` 永远不得删除或重命名。
