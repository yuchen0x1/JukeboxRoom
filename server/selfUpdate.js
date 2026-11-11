/**
 * 服务端自更新（面向 git clone + pm2/systemd/Docker 部署方式）。
 *
 * 流程：检测到 GitHub 有更新版本 → 检查干净工作区 → git fetch/快进合并到 main →
 * 重装依赖 → 重建前端 → 在进程管理器（pm2/Docker）下自动重启进程。
 *
 * 安全边界：
 * - 仅当仓库来自 git 工作副本时可用（桌面版等无 git 环境自动跳过）；
 * - .env、data/ 等被 .gitignore 忽略的文件不会被更新流程触碰；
 * - 未检测到进程管理器时不自动退出进程（避免裸 node 部署直接下线），
 *   标记为 restart-required 并记录日志，由部署者手动重启；
 * - 每次更新全局单飞，重复调用直接返回当前进度。
 */

import { exec } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const UPDATE_LOG_MAX = 200;

const state = {
  phase: 'idle', // idle | checking | running | restarting | restart-required | failed
  startedAt: null,
  finishedAt: null,
  log: [],
  error: null,
};

function log(line) {
  state.log.push(`${new Date().toISOString()} ${line}`);
  if (state.log.length > UPDATE_LOG_MAX) state.log.shift();
  console.info(`[self-update] ${line}`);
}

function run(command, options = {}) {
  const timeoutMs = options.timeoutMs ?? 600_000;
  return new Promise((resolve) => {
    log(`$ ${command}`);
    exec(command, {
      cwd: options.cwd || repoRoot,
      windowsHide: true,
      timeout: timeoutMs,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }, (error, stdout, stderr) => {
      const ok = !error;
      if (!ok) log(`✗ ${command} 失败: ${String(error.message || stderr || '').slice(0, 200)}`);
      resolve({ ok, output: String(stdout || '') });
    });
  });
}

function detectRestartCapability() {
  if (process.env.pm_id !== undefined) return 'pm2';
  if (existsSync('/.dockerenv')) return 'docker';
  if (process.env.JUKEBOXROOM_SYSTEMD === '1') return 'systemd';
  return 'none';
}

export function isUpdateSupported() {
  return existsSync(path.join(repoRoot, '.git'));
}

const EXPECTED_GITHUB_REMOTE = 'https://github.com/yuchen0x1/JukeboxRoom.git';

function normalizeRemoteUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '').replace(/\.git$/, '').toLowerCase();
}

export function isExpectedGithubRemote(value) {
  return normalizeRemoteUrl(value) === normalizeRemoteUrl(EXPECTED_GITHUB_REMOTE);
}

export function isExpectedUpdateBranch(value) {
  return String(value || '').trim() === 'main';
}

function parseRemoteUrl(output) {
  const line = String(output || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith('origin\t') || item.startsWith('origin '));
  if (!line) return '';
  return line.replace(/^origin\s+/, '').split(/\s+/)[0] || '';
}

export function getSelfUpdateState() {
  return {
    phase: state.phase,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    error: state.error,
    log: state.log.slice(-20),
    supported: isUpdateSupported(),
    restartCapability: detectRestartCapability(),
  };
}

/** 执行一次完整的自更新；同一时间只允许一个更新任务 */
export async function applySelfUpdate() {
  if (state.phase === 'checking' || state.phase === 'running' || state.phase === 'restarting') {
    return { started: false, already: true, phase: state.phase };
  }
  if (!isUpdateSupported()) {
    return { started: false, error: '当前部署方式不含 git 仓库（如桌面版），请从发布页下载新版本' };
  }

  // 自更新会改写工作副本；任何本地修改或未跟踪文件都必须由部署者先处理。
  // 这条检查放在异步任务启动前，避免请求返回成功后才发现会覆盖本地工作。
  state.phase = 'checking';
  const [dirtyResult, remoteResult, branchResult] = await Promise.all([
    run('git status --porcelain --untracked-files=all'),
    run('git remote -v'),
    run('git branch --show-current'),
  ]);
  if (!dirtyResult.ok) {
    state.phase = 'idle';
    return { started: false, error: '无法检查 Git 工作区状态，已拒绝自动更新' };
  }
  if (String(dirtyResult.output || '').trim()) {
    state.phase = 'idle';
    return { started: false, error: 'Git 工作区存在未提交或未跟踪文件，请先手动处理后再更新' };
  }
  if (!remoteResult.ok || !isExpectedGithubRemote(parseRemoteUrl(remoteResult.output))) {
    state.phase = 'idle';
    return { started: false, error: '自动更新仅允许使用确认的 GitHub 仓库 yuchen0x1/JukeboxRoom' };
  }
  if (!branchResult.ok || !isExpectedUpdateBranch(branchResult.output)) {
    state.phase = 'idle';
    return { started: false, error: '自动更新仅允许在 main 分支执行' };
  }

  state.phase = 'running';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.error = null;
  state.log = [];
  log('开始自更新');

  void (async () => {
    try {
      // 1. 同步到远端最新 main。工作区已确认干净，快进合并仍会保留本地提交。
      let step = await run('git fetch origin main');
      if (!step.ok) throw new Error('git fetch 失败');
      step = await run('git merge --ff-only origin/main');
      if (!step.ok) throw new Error('git 快进合并失败，请手动处理本地分支后再更新');

      // 2. 重装服务端依赖
      step = await run('npm ci --omit=dev', { cwd: path.join(repoRoot, 'server') });
      if (!step.ok) throw new Error('服务端依赖安装失败');

      // 3. 重装客户端依赖并重建
      step = await run('npm ci', { cwd: path.join(repoRoot, 'client'), timeoutMs: 900_000 });
      if (!step.ok) throw new Error('客户端依赖安装失败');
      step = await run('npm run build', { cwd: path.join(repoRoot, 'client'), timeoutMs: 900_000 });
      if (!step.ok) throw new Error('前端构建失败');

      // 4. 重启进程
      const capability = detectRestartCapability();
      if (capability === 'pm2') {
        state.phase = 'restarting';
        log('检测到 pm2，1.5 秒后自动重启进程…');
        setTimeout(() => process.exit(1), 1500);
        return;
      }
      if (capability === 'docker') {
        state.phase = 'restarting';
        log('检测到 Docker，1.5 秒后自动重启容器…');
        setTimeout(() => process.exit(1), 1500);
        return;
      }
      state.phase = 'restart-required';
      state.finishedAt = new Date().toISOString();
      log('代码已更新，但未检测到进程管理器（pm2/Docker），请手动重启服务后生效');
    } catch (error) {
      state.phase = 'failed';
      state.finishedAt = new Date().toISOString();
      state.error = String(error.message || error).slice(0, 300);
      log(`更新失败: ${state.error}`);
    }
  })();

  return { started: true, phase: state.phase };
}
