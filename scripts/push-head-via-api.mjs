// Git Data API 推送本地提交（github.com git 通道被代理拦截时的替代方案）
// 逐个重建远程缺失的提交并推进 refs/heads/main；用法：node scripts/push-head-via-api.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = 'yuchen0x1/JukeboxRoom';

function exec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
}

function ghApi(method, path, body) {
  const args = ['api', '-X', method, path];
  if (body !== undefined) {
    const tmp = join(mkdtempSync(join(tmpdir(), 'ghapi-')), 'body.json');
    writeFileSync(tmp, JSON.stringify(body));
    args.push('--input', tmp);
  }
  return JSON.parse(exec('gh', args));
}

function localTree(sha) {
  return exec('git', ['rev-parse', `${sha}^{tree}`]).trim();
}

// 1. 找到本地与远程的同步点（树与远程 main 一致的最近提交）
const remoteMain = ghApi('GET', `repos/${REPO}/git/refs/heads/main`).object.sha;
const remoteTree = ghApi('GET', `repos/${REPO}/git/commits/${remoteMain}`).tree.sha;

const chain = exec('git', ['rev-list', '--reverse', 'HEAD']).trim().split('\n');
let syncIndex = -1;
for (let i = chain.length - 1; i >= 0; i -= 1) {
  if (chain[i] === remoteMain || localTree(chain[i]) === remoteTree) {
    syncIndex = i;
    break;
  }
}
if (syncIndex === -1) {
  console.error('找不到本地与远程 main 的同步点（树不一致），请先手动拉平。');
  process.exit(1);
}
const pending = chain.slice(syncIndex + 1);
if (pending.length === 0) {
  console.log('远程已包含本地全部提交，无需推送。');
  process.exit(0);
}
console.log(`待推送 ${pending.length} 个提交，基点 ${chain[syncIndex].slice(0, 7)}（remote ${remoteMain.slice(0, 7)}）`);

// 2. 逐提交重建
let parentSha = remoteMain;
let baseTree = remoteTree;
for (const sha of pending) {
  const diff = exec('git', ['diff-tree', '--no-commit-id', '--name-status', '-r', sha]).trim().split('\n').filter(Boolean);
  const entries = [];
  for (const line of diff) {
    const [status, path] = line.split('\t');
    if (status === 'D') {
      entries.push({ path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const mode = exec('git', ['ls-tree', sha, '--', path]).trim().split(/\s+/)[0];
    const b64 = exec('git', ['cat-file', 'blob', `${sha}:${path}`], { encoding: 'buffer' }).toString('base64');
    const created = ghApi('POST', `repos/${REPO}/git/blobs`, { content: b64, encoding: 'base64' });
    entries.push({ path, mode: mode === '100755' ? '100755' : '100644', type: 'blob', sha: created.sha });
    console.log(`  blob: ${path} (${created.sha.slice(0, 7)})`);
  }
  const tree = ghApi('POST', `repos/${REPO}/git/trees`, { base_tree: baseTree, tree: entries });
  const meta = exec('git', ['log', '-1', '--format=%an%n%ae%n%aI%n%cn%n%ce%n%cI', sha]).split('\n');
  const [an, ae, ad, cn, ce, cd] = meta;
  const commit = ghApi('POST', `repos/${REPO}/git/commits`, {
    message: exec('git', ['log', '-1', '--format=%B', sha]),
    tree: tree.sha,
    parents: [parentSha],
    author: { name: an, email: ae, date: ad },
    committer: { name: cn, email: ce, date: cd },
  });
  console.log(`commit: ${sha.slice(0, 7)} -> ${commit.sha.slice(0, 7)}`);
  parentSha = commit.sha;
  baseTree = tree.sha;
}

// 3. 推进 main 引用
const ref = ghApi('PATCH', `repos/${REPO}/git/refs/heads/main`, { sha: parentSha });
console.log('ref updated:', ref.object?.sha || JSON.stringify(ref));
console.log('DONE');
