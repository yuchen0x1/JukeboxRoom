/**
 * 服务端自更新（面向 git clone + pm2/systemd/Docker 部署方式）。
 *
 * 流程：检测到 Gitee 有更新版本 → git fetch/reset 到最新 main →
 * 重装依赖 → 重建前端 → 在进程管理器（pm2/Docker）下自动重启进程。
 *
 * 安全边界：
 * - 仅当仓库来自 git 工作副本时可用（桌面版等无 git 环境自动跳过）；
 * - .env、data/ 等被 .gitignore 忽略的文件不会被 git reset 触碰；
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
  phase: 'idle', // idle | running | restarting | restart-required | failed
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
export function applySelfUpdate() {
  if (state.phase === 'running' || state.phase === 'restarting') {
    return { started: false, already: true, phase: state.phase };
  }
  if (!isUpdateSupported()) {
    return { started: false, error: '当前部署方式不含 git 仓库（如桌面版），请从发布页下载新版本' };
  }

  state.phase = 'running';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.error = null;
  state.log = [];
  log('开始自更新');

  void (async () => {
    try {
      // 1. 同步到远端最新 main
      let step = await run('git fetch origin main');
      if (!step.ok) throw new Error('git fetch 失败');
      step = await run('git reset --hard origin/main');
      if (!step.ok) throw new Error('git reset 失败');

      // 2. 重装服务端依赖
      step = await run('npm ci --omit=dev', path.join(repoRoot, 'server'));
      if (!step.ok) throw new Error('服务端依赖安装失败');

      // 3. 重装客户端依赖并重建
      step = await run('npm ci', path.join(repoRoot, 'client'), 900_000);
      if (!step.ok) throw new Error('客户端依赖安装失败');
      step = await run('npm run build', path.join(repoRoot, 'client'), 900_000);
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
