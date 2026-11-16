import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeObservability } from './runtimeObservability.js';

function runMiddleware(middleware, req, res) {
  return new Promise((resolve) => middleware(req, res, resolve));
}

test('runtime metrics include request duration and status counters', async () => {
  const runtime = createRuntimeObservability();
  runtime.setReady(true);
  const headers = new Map();
  const listeners = new Map();
  const req = { headers: {}, path: '/rooms' };
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name, value); },
    on(name, handler) { listeners.set(name, handler); },
  };
  await runMiddleware(runtime.requestContext, req, res);
  listeners.get('finish')();
  const metrics = runtime.metrics();
  assert.match(metrics, /openmusic_http_requests_total 1/);
  assert.match(metrics, /openmusic_http_request_duration_ms_total \d+/);
  assert.match(metrics, /openmusic_http_response_status_total\{status="200"\} 1/);
  assert.equal(headers.get('X-Request-Id')?.length > 0, true);
});

test('unhealthy runtime rejects business requests but keeps probes available', async () => {
  const runtime = createRuntimeObservability();
  const responses = [];
  const makeResponse = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { responses.push({ status: this.statusCode, body }); },
  });
  runtime.rejectWhenUnhealthy({ path: '/rooms', requestId: 'req-1' }, makeResponse(), () => {
    throw new Error('business request should not pass while unhealthy');
  });
  let probePassed = false;
  await new Promise((resolve) => runtime.rejectWhenUnhealthy(
    { path: '/health/live', requestId: 'req-2' },
    makeResponse(),
    () => { probePassed = true; resolve(); },
  ));
  assert.deepEqual(responses[0], {
    status: 503,
    body: { ok: false, status: 'unhealthy', error: 'runtime_unhealthy', requestId: 'req-1' },
  });
  assert.equal(probePassed, true);
});
