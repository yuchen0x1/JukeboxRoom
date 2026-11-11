import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const PRIVATE_UPSTREAMS_ALLOWED = process.env.ALLOW_PRIVATE_UPSTREAMS === '1';

/** 缓冲模式下的默认上限：JSON/文本响应不应超过 8MB，超出即中止，避免单请求打爆内存。 */
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function normalizeIp(value) {
  return String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function ipv4ToNumber(value) {
  const parts = String(value).split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return null;
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]);
}

function ipv6ToBigInt(value) {
  let input = normalizeIp(value);
  if (input.includes('%')) input = input.split('%')[0];
  if (input.includes('.')) {
    const marker = input.lastIndexOf(':');
    const v4 = ipv4ToNumber(input.slice(marker + 1));
    if (v4 === null) return null;
    input = `${input.slice(0, marker)}:${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const pieces = input.split('::');
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(':') : [];
  const right = pieces[1] ? pieces[1].split(':') : [];
  if ([...left, ...right].some((part) => !/^[\da-f]{1,4}$/.test(part))) return null;
  const missing = 8 - left.length - right.length;
  if (pieces.length === 1 && missing !== 0) return null;
  if (pieces.length === 2 && missing < 1) return null;
  const groups = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  return groups.reduce((result, group) => (result << 16n) | BigInt(parseInt(group, 16)), 0n);
}

function inIpv4Range(number, start, end) {
  return number !== null && number >= start && number <= end;
}

function inIpv6Range(number, prefix, bits) {
  if (number === null) return false;
  const shift = 128n - BigInt(bits);
  return (number >> shift) === (prefix >> shift);
}

function ipv4FromMappedIpv6(number) {
  if (number === null || (number >> 32n) !== 0xffffn) return '';
  const mapped = Number(number & 0xffffffffn);
  return `${mapped >>> 24}.${(mapped >>> 16) & 255}.${(mapped >>> 8) & 255}.${mapped & 255}`;
}

export function isPrivateIp(value) {
  const ip = normalizeIp(value);
  if (!ip) return true;

  if (net.isIP(ip) === 4) {
    const number = ipv4ToNumber(ip);
    return Boolean(
      inIpv4Range(number, 0x00000000, 0x00ffffff)
      || inIpv4Range(number, 0x0a000000, 0x0affffff)
      || inIpv4Range(number, 0x64400000, 0x647fffff)
      || inIpv4Range(number, 0x7f000000, 0x7fffffff)
      || inIpv4Range(number, 0xa9fe0000, 0xa9feffff)
      || inIpv4Range(number, 0xac100000, 0xac1fffff)
      || inIpv4Range(number, 0xc0000000, 0xc00000ff)
      || inIpv4Range(number, 0xc0000200, 0xc00002ff)
      || inIpv4Range(number, 0xc0a80000, 0xc0a8ffff)
      || inIpv4Range(number, 0xc6120000, 0xc613ffff)
      || inIpv4Range(number, 0xc6336400, 0xc63364ff)
      || inIpv4Range(number, 0xcb007100, 0xcb0071ff)
      || number >= 0xe0000000
    );
  }

  if (net.isIP(ip) !== 6) return true;
  const number = ipv6ToBigInt(ip);
  const mappedV4 = ipv4FromMappedIpv6(number);
  return Boolean(
    number === null
    || number === 0n
    || number === 1n
    || inIpv6Range(number, 0x64ff9b00000000000000000000000000n, 96)
    || inIpv6Range(number, 0x100000000000000000000000000000n, 64)
    || inIpv6Range(number, 0x20010000000000000000000000000000n, 23)
    || inIpv6Range(number, 0x20010db8000000000000000000000000n, 32)
    || inIpv6Range(number, 0x20020000000000000000000000000000n, 16)
    || inIpv6Range(number, 0x3fff0000000000000000000000000000n, 20)
    || inIpv6Range(number, 0x5f000000000000000000000000000000n, 16)
    || inIpv6Range(number, 0xfc000000000000000000000000000000n, 7)
    || inIpv6Range(number, 0xfe800000000000000000000000000000n, 10)
    || inIpv6Range(number, 0xfec00000000000000000000000000000n, 10)
    || inIpv6Range(number, 0xff000000000000000000000000000000n, 8)
    || (mappedV4 && isPrivateIp(mappedV4))
  );
}

export function isPrivateHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return Boolean(
    !host
    || host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || (net.isIP(host) > 0 && isPrivateIp(host))
  );
}

export function parseHttpUrl(rawUrl, { allowPrivate = false } = {}) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!HTTP_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) return null;
  if (!allowPrivate && isPrivateHostname(parsed.hostname)) return null;
  return parsed;
}

export async function resolveValidatedHttpUrl(rawUrl, options = {}) {
  const { allowPrivate = false, lookup = dns.lookup } = options;
  const parsed = parseHttpUrl(rawUrl, { allowPrivate });
  if (!parsed) return null;

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(host) > 0) {
    if (!allowPrivate && isPrivateIp(host)) return null;
    return { parsed, address: host, family: net.isIP(host) };
  }

  let addresses;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    return null;
  }

  if (!Array.isArray(addresses) || addresses.length === 0) return null;
  if (!allowPrivate && addresses.some(({ address }) => isPrivateIp(address))) return null;
  const first = addresses.find(({ address }) => net.isIP(address) > 0);
  if (!first) return null;
  return { parsed, address: first.address, family: first.family || net.isIP(first.address) };
}

export async function isSafeHttpUrl(rawUrl, options) {
  return Boolean(await resolveValidatedHttpUrl(rawUrl, options));
}

export async function assertSafeHttpUrl(rawUrl, options) {
  const validated = await resolveValidatedHttpUrl(rawUrl, options);
  if (!validated) throw new Error('拒绝访问不安全的外部 URL');
  return rawUrl;
}

function makePinnedLookup(validated) {
  return (hostname, options, callback) => {
    const expected = validated.parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const actual = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
    if (actual !== expected) {
      callback(new Error('请求主机与已校验主机不一致'));
      return;
    }
    const entry = { address: validated.address, family: validated.family || net.isIP(validated.address) };
    // Node 20+ 默认启用 autoSelectFamily，以 { all: true } 调用自定义 lookup，
    // 此时回调必须返回地址数组，否则连接层读到 undefined 报 Invalid IP address。
    if (options && options.all) {
      callback(null, [entry]);
    } else {
      callback(null, entry.address, entry.family);
    }
  };
}

function normalizeHeaders(headers = {}) {
  const output = {};
  if (typeof headers.forEach === 'function') {
    headers.forEach((value, key) => { output[key] = value; });
    return output;
  }
  for (const [key, value] of Object.entries(headers || {})) {
    if (value !== undefined) output[key] = value;
  }
  return output;
}

function responseFromIncoming(statusCode, headers, body, nodeStream = null) {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    rawHeaders: headers,
    headers: {
      get: (name) => headers[String(name).toLowerCase()] ?? null,
      forEach: (callback) => {
        for (const [key, value] of Object.entries(headers)) callback(value, key);
      },
    },
    // 流式模式下 body 为 web ReadableStream，正文不会被整体读入内存。
    body: nodeStream ? Readable.toWeb(nodeStream) : null,
    nodeStream,
    text: async () => {
      if (nodeStream) throw new Error('流式响应不支持 text()，请使用 nodeStream 或 body');
      return body.toString('utf8');
    },
    json: async () => {
      if (nodeStream) throw new Error('流式响应不支持 json()，请使用 nodeStream 或 body');
      return JSON.parse(body.toString('utf8'));
    },
    arrayBuffer: async () => {
      if (nodeStream) throw new Error('流式响应不支持 arrayBuffer()，请使用 nodeStream 或 body');
      return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    },
  };
}

/**
 * 带 SSRF 校验与资源上限的外部请求。
 *
 * @param {string} rawUrl
 * @param {object} [options]
 * @param {boolean} [options.stream] 为 true 时返回 `nodeStream`/web `body`，不缓冲响应体。
 *   媒体代理必须走这个模式：音频文件可能有几十 MB，缓冲会直接把进程内存打满。
 * @param {number} [options.maxBytes] 缓冲模式下的响应体上限，默认 8MB。
 */
export async function safeFetch(rawUrl, options = {}, timeoutMs = 10000) {
  const {
    allowPrivate = false,
    lookup,
    requestFactory,
    stream = false,
    maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
    ...fetchOptions
  } = options;
  const validated = await resolveValidatedHttpUrl(rawUrl, { allowPrivate, lookup });
  if (!validated) throw new Error('拒绝访问不安全的外部 URL');

  const parsed = validated.parsed;
  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;
  const request = requestFactory || transport.request.bind(transport);

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    // 绝对超时：socket 超时只检测「空闲」，上游慢速滴流可以无限期占用连接。
    const deadline = setTimeout(() => {
      req.destroy(new Error('外部请求超时'));
    }, timeoutMs);

    const req = request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method: fetchOptions.method || 'GET',
      headers: normalizeHeaders(fetchOptions.headers),
      lookup: makePinnedLookup(validated),
      servername: parsed.hostname,
    }, (res) => {
      if (stream) {
        // 重定向时正文无用：立刻销毁，避免占用上游连接。
        if (res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          res.destroy();
        }
        if (settled) {
          res.destroy();
          return;
        }
        settled = true;
        clearTimeout(deadline);
        resolve(responseFromIncoming(res.statusCode || 0, res.headers, null, res));
        return;
      }

      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          res.destroy();
          fail(new Error('外部响应超过大小上限'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        resolve(responseFromIncoming(res.statusCode || 0, res.headers, Buffer.concat(chunks)));
      });
      res.on('error', fail);
    });

    req.on('error', (error) => {
      clearTimeout(deadline);
      fail(error);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('外部请求超时')));
    if (fetchOptions.body) req.write(fetchOptions.body);
    req.end();
  });
}

export async function safeFetchFollow(rawUrl, options = {}, timeoutMs = 10000, maxRedirects = 3) {
  let currentUrl = rawUrl;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await safeFetch(currentUrl, { ...options, redirect: 'manual' }, timeoutMs);
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location || redirectCount === maxRedirects) return response;
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error('外部请求重定向过多');
}

export function shouldAllowPrivateConfiguredUpstream() {
  return PRIVATE_UPSTREAMS_ALLOWED;
}
