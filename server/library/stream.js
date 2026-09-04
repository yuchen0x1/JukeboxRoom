/**
 * Local library streaming service (P1-2).
 * Serves indexed local audio files with:
 * - HTTP Range support -> 206 Partial Content (seek/resume)
 * - ETag + If-None-Match -> 304 Not Modified
 * - Accept-Ranges / Content-Range / Content-Length
 * - Path-traversal guard: only files inside configured MUSIC_LIBRARY_PATHS
 */

import fs from 'fs';
import path from 'path';
import { findOne } from '../db/store.js';

const MIME_BY_EXT = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  '.ape': 'audio/x-ape',
};

function libraryRoots() {
  return (process.env.MUSIC_LIBRARY_PATHS || '')
    .split(';')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => fs.realpathSync.native?.(p) || fs.realpathSync(p))
    .map(p => path.resolve(p));
}

function resolveLibraryFilePath(filePath) {
  const roots = libraryRoots();
  if (roots.length === 0) return '';
  const realPath = fs.realpathSync(filePath);
  const normalized = path.resolve(realPath);
  const allowed = roots.some(root => normalized === root || normalized.startsWith(root + path.sep));
  return allowed ? realPath : '';
}

/** Stable ETag from size + mtime (hex) so renames/edits invalidate cache. */
function buildEtag(stat) {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function contentTypeFor(filePath) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function createValidatedReadStream(realPath, options = {}) {
  const fd = fs.openSync(realPath, 'r');
  try {
    return fs.createReadStream('', { ...options, fd, autoClose: true });
  } catch (err) {
    fs.closeSync(fd);
    throw err;
  }
}

/**
 * Express handler: GET /library/stream/:id
 * Looks up the song in the local index, then serves the file with
 * Range/ETag support.
 */
function streamLocalSong(req, res) {
  const song = findOne('library_songs', s => s.id === req.params.id && !s.deletedAt);
  if (!song || !song.filePath) {
    return res.status(404).json({ error: 'song_not_found', message: '本地曲库中不存在该歌曲' });
  }
  let realPath;
  try {
    realPath = resolveLibraryFilePath(song.filePath);
  } catch {
    return res.status(404).json({ error: 'file_missing', message: '源文件不存在或不可读' });
  }
  if (!realPath) {
    return res.status(403).json({ error: 'forbidden', message: '文件不在曲库目录内' });
  }
  let stat;
  try {
    stat = fs.statSync(realPath);
  } catch {
    return res.status(404).json({ error: 'file_missing', message: '源文件不存在或不可读' });
  }
  if (!stat.isFile()) {
    return res.status(403).json({ error: 'forbidden', message: '不是普通文件' });
  }

  const etag = buildEtag(stat);
  const total = stat.size;
  const mime = contentTypeFor(song.filePath);

  // Conditional GET
  if (req.headers['if-none-match'] === etag) {
    res.status(304);
    res.setHeader('ETag', etag);
    return res.end();
  }

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Type', mime);

  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
    let start = -1;
    let end = -1;
    if (m) {
      if (m[1] !== '' && m[2] !== '') {
        start = parseInt(m[1], 10);
        end = parseInt(m[2], 10);
      } else if (m[1] !== '') {
        start = parseInt(m[1], 10);
        end = total - 1;
      } else if (m[2] !== '') {
        // suffix range: last N bytes
        const suffix = parseInt(m[2], 10);
        start = Math.max(0, total - suffix);
        end = total - 1;
      }
    }
    if (start >= 0 && end >= start && start < total) {
      if (end >= total) end = total - 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      const stream = createValidatedReadStream(realPath, { start, end });
      stream.on('error', () => res.destroy());
      return stream.pipe(res);
    }
    // Unsatisfiable range
    res.status(416);
    res.setHeader('Content-Range', `bytes */${total}`);
    return res.end();
  }

  res.status(200);
  res.setHeader('Content-Length', total);
  const stream = createValidatedReadStream(realPath);
  stream.on('error', () => res.destroy());
  return stream.pipe(res);
}

export { streamLocalSong, resolveLibraryFilePath, buildEtag, contentTypeFor, libraryRoots };
