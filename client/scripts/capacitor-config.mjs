export function createCapacitorConfig(base, platform, serverUrl = '') {
  if (!['android', 'ios'].includes(platform)) throw new Error('请指定 android 或 ios 平台');
  const config = { ...base, appName: 'JukeboxRoom' };
  delete config.server;
  if (platform === 'android') return { ...config, webDir: 'dist' };
  let url;
  try { url = new URL(serverUrl); } catch { throw new Error('iOS 需要先配置 CAPACITOR_SERVER_URL 为可访问的 HTTPS 站点'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('iOS 站点必须使用 HTTPS，且不包含账号、密码、查询参数或片段');
  }
  return { ...config, webDir: 'capacitor-stub', server: { url: url.toString().replace(/\/+$/, ''), cleartext: false } };
}
