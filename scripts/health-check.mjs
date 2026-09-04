const baseUrl = String(process.env.OPENMUSIC_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const timeoutMs = Number(process.env.OPENMUSIC_CHECK_TIMEOUT_MS || 8000);
const skipUpdate = process.env.OPENMUSIC_SKIP_UPDATE === '1';

async function request(pathname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, { signal: controller.signal });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* Non-JSON body is still reported below. */ }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

const checks = ['/api/health/live', '/api/health/ready', '/api/music/health'];
if (!skipUpdate) checks.push('/api/update');

let failed = false;
for (const pathname of checks) {
  try {
    const result = await request(pathname);
    const ok = result.status >= 200 && result.status < 300 && result.body?.ok === true;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${pathname} HTTP ${result.status}`);
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(`FAIL ${pathname} ${error.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : error.message}`);
  }
}

if (failed) process.exitCode = 1;
