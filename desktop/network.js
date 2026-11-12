// Electron's session ProxyConfig uses comma-separated rules. The command-line
// proxy-bypass switch uses a different semicolon-separated syntax.
const LOCAL_PROXY_BYPASS_RULES = '<local>,localhost,127.0.0.1,[::1]';

/**
 * Keep the user's system proxy for external requests while ensuring that the
 * embedded local server is always reached directly. Some Windows proxy tools
 * do not add loopback hosts to their bypass list and can otherwise break the
 * renderer's /api/media-proxy requests.
 */
async function configureDesktopSessionProxy(electronSession, logger = console) {
  const defaultSession = electronSession?.defaultSession;
  if (!defaultSession || typeof defaultSession.setProxy !== 'function') return false;

  try {
    await defaultSession.setProxy({
      mode: 'system',
      proxyBypassRules: LOCAL_PROXY_BYPASS_RULES,
    });
    // Drop any connection opened before the proxy policy was applied.
    await defaultSession.closeAllConnections?.();
    return true;
  } catch (error) {
    try {
      logger.warn?.(`[desktop-network] 无法设置本机代理绕过规则：${error?.message || 'unknown error'}`);
    } catch {
      // Logging must not prevent the application from starting.
    }
    return false;
  }
}

module.exports = {
  LOCAL_PROXY_BYPASS_RULES,
  configureDesktopSessionProxy,
};
