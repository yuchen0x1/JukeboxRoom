const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_FAILURE_WINDOW_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const PROVIDERS = ['netease', 'tencent', 'kugou', 'qishui', 'migu'];
const states = new Map();

function config() {
  const positiveNumber = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    failureThreshold: positiveNumber('MEDIA_HEALTH_FAILURE_THRESHOLD', DEFAULT_FAILURE_THRESHOLD),
    failureWindowMs: positiveNumber('MEDIA_HEALTH_FAILURE_WINDOW_MS', DEFAULT_FAILURE_WINDOW_MS),
    cooldownMs: positiveNumber('MEDIA_HEALTH_COOLDOWN_MS', DEFAULT_COOLDOWN_MS),
  };
}

function stateFor(provider) {
  let state = states.get(provider);
  if (!state) {
    state = {
      failures: [],
      openUntil: 0,
      probeInFlight: false,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastStatus: null,
    };
    states.set(provider, state);
  }
  return state;
}

export function canRequestProvider(provider) {
  if (!provider) return true;
  const state = stateFor(provider);
  const now = Date.now();
  if (state.openUntil > now) return false;
  if (state.openUntil > 0) {
    if (state.probeInFlight) return false;
    state.probeInFlight = true;
  }
  return true;
}

export function recordProviderSuccess(provider, status = 200) {
  if (!provider) return;
  const state = stateFor(provider);
  state.failures = [];
  state.openUntil = 0;
  state.probeInFlight = false;
  state.lastSuccessAt = new Date().toISOString();
  state.lastStatus = status;
}

export function recordProviderFailure(provider, status = null) {
  if (!provider) return;
  const state = stateFor(provider);
  const now = Date.now();
  const { failureThreshold, failureWindowMs, cooldownMs } = config();
  state.failures = state.failures.filter((timestamp) => timestamp > now - failureWindowMs);
  state.failures.push(now);
  state.lastFailureAt = new Date(now).toISOString();
  state.lastStatus = Number.isFinite(Number(status)) ? Number(status) : null;
  state.probeInFlight = false;
  if (state.failures.length >= failureThreshold) state.openUntil = now + cooldownMs;
}

export function providerHealth(provider) {
  const state = stateFor(provider);
  const now = Date.now();
  const { failureWindowMs } = config();
  state.failures = state.failures.filter((timestamp) => timestamp > now - failureWindowMs);
  if (state.openUntil <= now && state.openUntil !== 0) state.openUntil = 0;
  return {
    provider,
    status: state.openUntil > now ? 'open' : state.lastFailureAt && !state.lastSuccessAt ? 'degraded' : 'healthy',
    failures: state.failures.length,
    lastStatus: state.lastStatus,
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    retryAt: state.openUntil > now ? new Date(state.openUntil).toISOString() : null,
  };
}

export function getProviderHealth() {
  return PROVIDERS.map(providerHealth);
}

export function resetProviderHealth() {
  states.clear();
}
