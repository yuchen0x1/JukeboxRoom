import {
  getPacmToken,
  getUrlV1,
  getUrlV2,
  searchSong,
} from 'migu-api-enhanced';
import { loginPhone } from 'migu-api-enhanced/login';

const MIGU_IMAGE_BASE = 'https://d.musicapp.migu.cn';
const MAX_SESSION_TOKEN_LENGTH = 16_384;

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${MIGU_IMAGE_BASE}${raw}`;
  return raw;
}

function normalizeSong(item) {
  const song = asRecord(item?.song) || asRecord(item);
  if (!song) return null;
  const contentId = String(song.contentId || '').trim();
  const copyrightId = String(song.copyrightId || '').trim();
  const name = String(song.songName || '').trim();
  if (!contentId || !copyrightId || !name) return null;
  const singers = Array.isArray(song.singerList) ? song.singerList : [];
  return {
    id: encodeMiguSongId(contentId, copyrightId),
    source: 'migu',
    name,
    artist: singers.map((singer) => String(singer?.name || '').trim()).filter(Boolean).join(' / ') || '未知歌手',
    album: String(song.album || '').trim() || undefined,
    pic: normalizeUrl(song.img1 || song.img2 || song.img3),
    duration: Number(song.duration) > 0 ? Number(song.duration) * 1000 : undefined,
    lrc: normalizeUrl(song.lrcUrl),
    vip: Boolean(song.restrictType) || Array.isArray(song.showTags) && song.showTags.some((tag) => /vip|pay/i.test(String(tag))),
  };
}

export function encodeMiguSongId(contentId, copyrightId) {
  const content = String(contentId || '').trim();
  const copyright = String(copyrightId || '').trim();
  if (!/^[\w-]{1,128}$/.test(content) || !/^[\w-]{1,128}$/.test(copyright)) {
    throw new Error('咪咕歌曲标识无效');
  }
  return `${content}|${copyright}`;
}

export function decodeMiguSongId(value) {
  const parts = String(value || '').trim().split('|');
  if (parts.length !== 2 || !/^[\w-]{1,128}$/.test(parts[0]) || !/^[\w-]{1,128}$/.test(parts[1])) {
    throw new Error('咪咕歌曲标识无效');
  }
  return { contentId: parts[0], copyrightId: parts[1] };
}

export async function searchMiguSongs(keyword, page = 1) {
  const result = await searchSong(String(keyword || '').trim(), Math.max(1, Math.min(10, Number(page) || 1)));
  const items = Array.isArray(result?.data?.items) ? result.data.items : [];
  return items.map(normalizeSong).filter(Boolean).slice(0, 30);
}

function toneForQuality(quality) {
  const value = String(quality || '').toLowerCase();
  if (value.includes('lossless') || value.includes('flac') || value.includes('sq')) return 'SQ';
  if (value.includes('high') || value.includes('exhigh') || value.includes('hq') || value === '320') return 'HQ';
  return 'PQ';
}

function extractUrl(result) {
  const data = asRecord(result?.data) || asRecord(result);
  const url = String(data?.url || '').trim();
  return url.startsWith('http') ? url : '';
}

function upstreamMessage(result) {
  const data = asRecord(result?.data) || asRecord(result);
  const dialog = asRecord(data?.dialogInfo);
  return String(dialog?.text || result?.info || '').trim();
}

export async function resolveMiguPlayUrl(id, quality = 'standard', session = null) {
  const { contentId, copyrightId } = decodeMiguSongId(id);
  const toneFlag = toneForQuality(quality);
  const pacmToken = String(session?.pacmToken || '').trim();
  const result = pacmToken
    ? await getUrlV2(contentId, copyrightId, toneFlag, pacmToken)
    : await getUrlV1(contentId, copyrightId, toneFlag);
  const url = extractUrl(result);
  if (url) return url;
  const message = upstreamMessage(result);
  if (/会员|白金|版权|付费/.test(message)) throw new Error(`咪咕音乐：${message}`);
  return null;
}

export async function requestMiguSmsCode(phone) {
  const result = await loginPhone.getMsgCode(phone);
  if (asRecord(result)?.error) throw new Error('咪咕验证码发送失败，请稍后重试');
  return { success: true };
}

function extractToken(result) {
  const candidates = [result?.token, result?.data?.token, result?.body?.token, result?.data?.data?.token];
  return candidates.map((value) => String(value || '').trim()).find((value) => value) || '';
}

export async function loginMiguByPhone(phone, smsCode) {
  const result = await loginPhone.authn(phone, smsCode);
  if (asRecord(result)?.error) throw new Error('咪咕登录失败，请检查验证码是否正确或已过期');
  const token = extractToken(result);
  if (!token || token.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new Error('咪咕登录未返回有效会话，请稍后重试');
  }
  const pacmResult = await getPacmToken(token);
  const pacmToken = String(pacmResult?.pacmToken || '').trim();
  if (!pacmToken || pacmToken.length > MAX_SESSION_TOKEN_LENGTH) {
    throw new Error('咪咕登录会话获取失败，请稍后重试');
  }
  return { token, pacmToken };
}
