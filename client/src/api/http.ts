const DEFAULT_TIMEOUT_MS = 10000;
import { isAndroidRuntime, resolveMobileApiUrl } from '../lib/mobileApi';

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestInput = isAndroidRuntime() && typeof input === 'string'
      ? resolveMobileApiUrl(input)
      : input;
    const response = await fetch(requestInput, { ...init, signal: controller.signal });
    return response;
  } finally {
    window.clearTimeout(timer);
  }
}
